import { Request, Response } from 'express';
import { emitToAll, emitAdminNotification } from '../utils/socketEmitter';
import { prisma } from '../lib/prisma';
import { getPlatformConfig as loadPlatformConfig, updatePlatformConfig as savePlatformConfig, ensurePlatformConfig } from '../repositories/platformConfig.repository';
import {
  findSubByStoreId,
  findSubById,
  ensureSubForStore,
  updateSub,
  listPendingSubs,
  listAllSubs,
  syncCommissionForPlan,
  commissionImpact,
  CommissionPlan,
  CommissionSyncChoice,
} from '../repositories/storeSubscription.repository';
import logger from '../config/logger';
import { AppError } from '../utils/AppError';
import {
  actorFromRequest,
  MoneyActionError,
  recordAdminMoneyAction,
  sendMoneyActionError,
} from '../services/adminMoneyAction.service';

const COMMISSION_FIELDS: ReadonlyArray<readonly [CommissionPlan, 'commissionPlan1' | 'commissionPlan2' | 'commissionPlan3']> = [
  ['plan1', 'commissionPlan1'],
  ['plan2', 'commissionPlan2'],
  ['plan3', 'commissionPlan3'],
];
const SYNC_CHOICES: CommissionSyncChoice[] = ['keep_special', 'all'];
const round2 = (v: number) => Math.round(v * 100) / 100;
const cents = (v: unknown) => Math.round(Number(v) * 100);
/** Número (ou texto numérico) entre 0 e 100; senão null. */
const parsePercent = (value: unknown): number | null => {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100 ? round2(n) : null;
};

// ✅ GET Current Platform Config
export const getPlatformConfig = async (req: Request, res: Response) => {
  try {
    // Se não existe, cria com os defaults do schema Prisma.
    const config = await ensurePlatformConfig('system');
    return res.json(config);
  } catch (err) {
    console.error('❌ Error getting platform config:', err);
    return res.status(500).json({ error: 'Erro ao buscar configurações' });
  }
};

// ✅ UPDATE Platform Config (settings:manage)
// D3b-3 (spec 6): comissão de plano alterada exige escolha (commissionSync) para as lojas;
// config + lojas + linha commission_sync numa transação só. Valor igual não toca nas lojas.
export const updatePlatformConfig = async (req: Request & { user?: any }, res: Response) => {
  try {
    const userId = req.user?.id || (req as any).userId;

    const {
      commissionPlan1,
      commissionPlan2,
      commissionPlan3,
      commissionSync,
      motoboyCutPerDelivery,
      motoboyCutPerKm,
      motoboyMinimumWithdraw,
      storeMinimumWithdraw,
      motoboyCommissionPercent,
      lateCancellationFeePercent,
      lateCancellationMotoboyShare,
      cancelFeeCustomerPercent, cancelFeeStorePercent, cancelFeeMotoboyPercent,
      storeAcceptTimeoutMin, poolTimeoutMin, customerAbsentWaitMin,
      seasonalTheme,
      cardFeePercent, cardFeeFixed, cardAnticipationMonthlyRate, cardInstallmentMaxCount, cardInstallmentMinValue,
    } = req.body;

    // Saque mínimo (D1): número >= 0 e <= 100.000; texto numérico vira número; o resto é recusado.
    const minimums: Record<string, unknown> = { motoboyMinimumWithdraw, storeMinimumWithdraw };
    for (const [field, value] of Object.entries(minimums)) {
      if (value === undefined) continue;
      const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
      if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100000) {
        return res.status(400).json({
          error: 'O saque mínimo precisa ser um valor entre R$ 0 e R$ 100.000',
          code: 'INVALID_MINIMUM_WITHDRAW',
          field,
        });
      }
      minimums[field] = n;
    }

    // Comissão por plano (D3b-3): número entre 0 e 100, duas casas.
    const commissions: Partial<Record<CommissionPlan, number>> = {};
    const commissionInput: Record<CommissionPlan, unknown> = { plan1: commissionPlan1, plan2: commissionPlan2, plan3: commissionPlan3 };
    for (const [plan, field] of COMMISSION_FIELDS) {
      if (commissionInput[plan] === undefined) continue;
      const n = parsePercent(commissionInput[plan]);
      if (n === null) return res.status(400).json({ error: 'A comissão precisa ser um número entre 0 e 100', field });
      commissions[plan] = n;
    }

    // Escolha por plano: objeto estrito { plan1?|plan2?|plan3?: 'keep_special' | 'all' }.
    let choices: Partial<Record<CommissionPlan, CommissionSyncChoice>> = {};
    if (commissionSync !== undefined && commissionSync !== null) {
      const ok = typeof commissionSync === 'object' && !Array.isArray(commissionSync)
        && Object.entries(commissionSync).every(([k, v]) =>
          COMMISSION_FIELDS.some(([p]) => p === k) && SYNC_CHOICES.includes(v as CommissionSyncChoice));
      if (!ok) return res.status(400).json({ error: 'Escolha de sincronização inválida' });
      choices = commissionSync as Partial<Record<CommissionPlan, CommissionSyncChoice>>;
    }

    // Só grava os campos enviados (patch parcial), preservando o resto da config.
    const patch: Record<string, any> = {};
    for (const [plan, field] of COMMISSION_FIELDS) {
      if (commissions[plan] !== undefined) patch[field] = commissions[plan];
    }
    if (motoboyCutPerDelivery !== undefined) patch.motoboyCutPerDelivery = motoboyCutPerDelivery;
    if (motoboyCutPerKm !== undefined) patch.motoboyCutPerKm = motoboyCutPerKm;
    if (motoboyMinimumWithdraw !== undefined) patch.motoboyMinimumWithdraw = minimums.motoboyMinimumWithdraw;
    if (storeMinimumWithdraw !== undefined) patch.storeMinimumWithdraw = minimums.storeMinimumWithdraw;
    if (motoboyCommissionPercent !== undefined) patch.motoboyCommissionPercent = motoboyCommissionPercent;
    if (lateCancellationFeePercent !== undefined) patch.lateCancellationFeePercent = lateCancellationFeePercent;
    if (lateCancellationMotoboyShare !== undefined) patch.lateCancellationMotoboyShare = lateCancellationMotoboyShare;
    if (cancelFeeCustomerPercent !== undefined) patch.cancelFeeCustomerPercent = cancelFeeCustomerPercent;
    if (cancelFeeStorePercent !== undefined) patch.cancelFeeStorePercent = cancelFeeStorePercent;
    if (cancelFeeMotoboyPercent !== undefined) patch.cancelFeeMotoboyPercent = cancelFeeMotoboyPercent;
    if (storeAcceptTimeoutMin !== undefined) patch.storeAcceptTimeoutMin = storeAcceptTimeoutMin;
    if (poolTimeoutMin !== undefined) patch.poolTimeoutMin = poolTimeoutMin;
    if (customerAbsentWaitMin !== undefined) patch.customerAbsentWaitMin = customerAbsentWaitMin;
    if (seasonalTheme !== undefined) patch.seasonalTheme = seasonalTheme;
    if (cardFeePercent !== undefined) patch.cardFeePercent = cardFeePercent;
    if (cardFeeFixed !== undefined) patch.cardFeeFixed = cardFeeFixed;
    if (cardAnticipationMonthlyRate !== undefined) patch.cardAnticipationMonthlyRate = cardAnticipationMonthlyRate;
    if (cardInstallmentMaxCount !== undefined) patch.cardInstallmentMaxCount = cardInstallmentMaxCount;
    if (cardInstallmentMinValue !== undefined) patch.cardInstallmentMinValue = cardInstallmentMinValue;

    const actor = actorFromRequest(req);
    const { config, commissionSync: synced } = await prisma.$transaction(async (tx) => {
      // Trava a config: a comparação com o valor salvo e a gravação acontecem sem corrida.
      const current = await ensurePlatformConfig(userId, tx);
      await tx.$queryRaw`SELECT id FROM "PlatformConfig" WHERE id = ${current.id} FOR UPDATE`;
      const locked = await tx.platformConfig.findUniqueOrThrow({ where: { id: current.id } });

      const changes: Array<{ plan: CommissionPlan; oldValue: number; newValue: number }> = [];
      for (const [plan, field] of COMMISSION_FIELDS) {
        const newValue = commissions[plan];
        if (newValue === undefined) continue;
        const oldValue = Number(locked[field]);
        if (cents(oldValue) !== cents(newValue)) changes.push({ plan, oldValue, newValue });
      }
      const missing = changes.filter((c) => !choices[c.plan]).map((c) => c.plan);
      if (missing.length > 0) {
        throw new MoneyActionError(409, 'COMMISSION_SYNC_CHOICE_REQUIRED',
          'Escolha o que fazer com as lojas dos planos com comissão alterada', { plans: missing });
      }

      const saved = await savePlatformConfig(patch, userId, tx);
      const results: Array<{ plan: CommissionPlan; oldValue: number; newValue: number; choice: CommissionSyncChoice; storesUpdated: number }> = [];
      for (const c of changes) {
        const choice = choices[c.plan] as CommissionSyncChoice;
        const storesUpdated = await syncCommissionForPlan(tx, c.plan, c.oldValue, c.newValue, choice);
        await recordAdminMoneyAction(tx, {
          actor,
          type: 'commission_sync',
          targetType: 'plan_commission',
          targetId: c.plan,
          before: { value: c.oldValue },
          after: { value: c.newValue, choice, storesUpdated },
        });
        results.push({ ...c, choice, storesUpdated });
      }
      return { config: saved, commissionSync: results };
    }, { maxWait: 15_000, timeout: 20_000 });

    // Notificar todos os clientes sobre mudança de tema sazonal (depois do commit)
    if (seasonalTheme !== undefined) {
      emitToAll('theme:updated', { seasonalTheme: config.seasonalTheme });
    }

    const total = synced.reduce((acc, s) => acc + s.storesUpdated, 0);
    logger.info('[settings] configuração da plataforma salva', { by: userId, commissionSync: synced });

    return res.json({
      config,
      commissionSync: synced,
      message: `Configurações salvas e ${total} lojas sincronizadas`,
    });
  } catch (err) {
    if (sendMoneyActionError(res, err)) return;
    logger.error('Erro ao atualizar configurações da plataforma', err as Error);
    return res.status(500).json({ error: 'Erro ao atualizar configurações' });
  }
};

// GET /settings/commission-impact?plan=plan1|plan2|plan3&value=<n> (settings:manage) — D3b-3 spec 6.
export const getCommissionImpact = async (req: Request, res: Response) => {
  const plan = String(req.query.plan ?? '') as CommissionPlan;
  const field = COMMISSION_FIELDS.find(([p]) => p === plan)?.[1];
  if (!field) return res.status(400).json({ error: 'Plano inválido' });
  const newValue = parsePercent(req.query.value);
  if (newValue === null) return res.status(400).json({ error: 'Valor inválido' });

  const config = await ensurePlatformConfig('system');
  const oldValue = Number(config[field]);
  const { atOldValue, special } = await commissionImpact(plan, oldValue);
  return res.json({ oldValue, newValue, atOldValue, special });
};

// ✅ GET Store Subscription (loja vê seu plano atual)
export const getStoreSubscription = async (req: Request & { user?: any }, res: Response) => {
  try {
    const userId = req.user?.id || (req as any).userId;

    // Encontrar loja do usuário
    const store = await prisma.store.findFirst({ where: { ownerId: userId } });
    if (!store) {
      return res.status(404).json({ error: 'Loja não encontrada' });
    }

    const subscription = await ensureSubForStore(store.id, store.name);
    return res.json(subscription);
  } catch (err) {
    console.error('❌ Error getting store subscription:', err);
    return res.status(500).json({ error: 'Erro ao buscar plano da loja' });
  }
};

// ✅ REQUEST Plan Change (loja requisita mudança de plano)
export const requestPlanChange = async (req: Request & { user?: any }, res: Response) => {
  try {
    const userId = req.user?.id || (req as any).userId;
    const { newPlan } = req.body;

    if (!['plan1', 'plan2', 'plan3'].includes(newPlan)) {
      return res.status(400).json({ error: 'Plano inválido' });
    }

    // Encontrar loja do usuário
    const store = await prisma.store.findFirst({ where: { ownerId: userId } });
    if (!store) {
      return res.status(404).json({ error: 'Loja não encontrada' });
    }

    let subscription = await ensureSubForStore(store.id, store.name);

    // Se já tem uma requisição pendente, rejeita
    if (subscription.planChangeStatus === 'pending') {
      return res.status(400).json({
        error: 'Você já tem uma alteração de plano pendente de aprovação do CEO',
      });
    }

    subscription = await updateSub(subscription.id, {
      requestedPlan: newPlan,
      planChangeStatus: 'pending',
      requestedAt: new Date(),
    });

    logger.debug('✅ Plan change requested:', { storeId: store.id, newPlan });
    emitAdminNotification({
      title: 'Solicitação de mudança de plano',
      body: `Loja "${store.name}" solicitou mudança para ${newPlan}.`,
      url: '/admin/plan-approvals',
      tag: 'plan-request',
    });
    return res.json({
      message: 'Solicitação enviada para o CEO',
      subscription,
    });
  } catch (err) {
    console.error('❌ Error requesting plan change:', err);
    return res.status(500).json({ error: 'Erro ao solicitar mudança de plano' });
  }
};

/**
 * DELETE /api/settings/store-subscription/request-change — a loja desiste da troca pendente.
 * updateMany condicional: só sai de `pending`; se o CEO já decidiu, 409 (nada muda).
 */
export async function cancelPlanChangeRequest(req: Request & { user?: any }, res: Response) {
  const store = await prisma.store.findFirst({ where: { ownerId: String(req.user?.id) }, select: { id: true } });
  if (!store) throw new AppError('Loja não encontrada', 404, true, 'STORE_NOT_FOUND');
  const r = await prisma.storeSubscription.updateMany({
    where: { storeId: store.id, planChangeStatus: 'pending' },
    data: { planChangeStatus: 'none', requestedPlan: null, requestedAt: null },
  });
  if (r.count !== 1) throw new AppError('Não há troca de plano pendente.', 409, true, 'NO_PENDING_PLAN_CHANGE');
  logger.info('[plan] loja cancelou o pedido de troca de plano', { storeId: store.id });
  return res.json({ success: true, data: await findSubByStoreId(store.id) });
}

// ✅ GET Pending Plan Changes (CEO vê requisições)
export const getPendingPlanChanges = async (req: Request & { user?: any }, res: Response) => {
  try {
    const pending = await listPendingSubs();
    return res.json(pending);
  } catch (err) {
    console.error('❌ Error getting pending changes:', err);
    return res.status(500).json({ error: 'Erro ao buscar requisições pendentes' });
  }
};

/** Troca de plano que não está mais em `pending`: as rotas do CEO respondem { error: string, code } (a tela lê `error` como texto). */
class PlanChangeNotPending extends Error {
  static readonly MESSAGE = 'Esta troca de plano não está mais pendente.';
  constructor() { super(PlanChangeNotPending.MESSAGE); }
}

// ✅ APPROVE Plan Change (CEO aprova)
export const approvePlanChange = async (req: Request & { user?: any }, res: Response) => {
  try {
    const userId = req.user?.id || (req as any).userId;
    const { subscriptionId } = req.body;

    const subscription = await findSubById(subscriptionId);
    if (!subscription) {
      return res.status(404).json({ error: 'Solicitação não encontrada' });
    }

    if (subscription.planChangeStatus !== 'pending') {
      throw new PlanChangeNotPending();
    }

    const newPlan = subscription.requestedPlan as string;

    // Atualizar comissão baseado no novo plano
    const config = await loadPlatformConfig();
    const planMap: any = config
      ? { plan1: config.commissionPlan1, plan2: config.commissionPlan2, plan3: config.commissionPlan3 }
      : {};
    const commissionRate = planMap[newPlan] ?? 10;

    // Transição condicional: a loja pode ter desistido (DELETE request-change) depois da leitura acima.
    // Só aplica o plano quem consegue sair de `pending` com o plano que o CEO viu.
    const planNumberMap: Record<string, number> = { plan1: 1, plan2: 2, plan3: 3 };
    const planNumber = planNumberMap[newPlan] ?? 1;
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.storeSubscription.updateMany({
        where: { id: String(subscription.id), planChangeStatus: 'pending', requestedPlan: newPlan as any },
        data: { currentPlan: newPlan as any, planChangeStatus: 'none', approvedAt: new Date(), approvedBy: userId, commissionRate },
      });
      if (count !== 1) throw new PlanChangeNotPending();
      // Sincronizar Store.plan com o plano aprovado
      await tx.store.update({ where: { id: String(subscription.storeId) }, data: { plan: planNumber } });
    });
    const updated = await findSubById(subscription.id);

    logger.debug('✅ Plan change approved:', { subscriptionId, newPlan, planNumber });
    return res.json({
      message: 'Plano alterado com sucesso',
      subscription: updated,
    });
  } catch (err) {
    if (err instanceof PlanChangeNotPending) return res.status(409).json({ error: PlanChangeNotPending.MESSAGE, code: 'PLAN_CHANGE_NOT_PENDING' });
    console.error('❌ Error approving plan change:', err);
    return res.status(500).json({ error: 'Erro ao aprovar mudança' });
  }
};

// ✅ REJECT Plan Change (CEO rejeita)
export const rejectPlanChange = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { subscriptionId, reason } = req.body;

    const subscription = await findSubById(subscriptionId);
    if (!subscription) {
      return res.status(404).json({ error: 'Solicitação não encontrada' });
    }

    // Transição condicional: se a loja já desistiu (ou o CEO já decidiu), não vira `rejected`.
    const { count } = await prisma.storeSubscription.updateMany({
      where: { id: String(subscription.id), planChangeStatus: 'pending' },
      data: { planChangeStatus: 'rejected', rejectionReason: reason || 'Rejeitado pelo CEO' },
    });
    if (count !== 1) throw new PlanChangeNotPending();
    const updated = await findSubById(subscription.id);

    logger.debug('✅ Plan change rejected:', { subscriptionId, reason });
    return res.json({
      message: 'Solicitação rejeitada',
      subscription: updated,
    });
  } catch (err) {
    if (err instanceof PlanChangeNotPending) return res.status(409).json({ error: PlanChangeNotPending.MESSAGE, code: 'PLAN_CHANGE_NOT_PENDING' });
    console.error('❌ Error rejecting plan change:', err);
    return res.status(500).json({ error: 'Erro ao rejeitar mudança' });
  }
};

// ✅ UPDATE Store Plan Directly (CEO altera plano diretamente + comissão)
export const updateStorePlan = async (req: Request & { user?: any }, res: Response) => {
  try {
    const userId = req.user?.id || (req as any).userId;
    const { subscriptionId, newPlan } = req.body;

    if (!['plan1', 'plan2', 'plan3'].includes(newPlan)) {
      return res.status(400).json({ error: 'Plano inválido' });
    }

    const subscription = await findSubById(subscriptionId);
    if (!subscription) {
      return res.status(404).json({ error: 'Assinatura não encontrada' });
    }

    const oldPlan = subscription.currentPlan;

    // 🔴 IMPORTANTE: Atualizar comissão baseado no novo plano
    const config = await loadPlatformConfig();
    const planMap: any = config
      ? { plan1: config.commissionPlan1, plan2: config.commissionPlan2, plan3: config.commissionPlan3 }
      : {};
    const commissionRate = planMap[newPlan] ?? 10;

    const updated = await updateSub(subscription.id, {
      currentPlan: newPlan,
      planChangeStatus: 'none',
      approvedAt: new Date(),
      approvedBy: userId,
      commissionRate,
    });
    logger.debug(`💰 [updateStorePlan] ${updated.storeName}: ${oldPlan} → ${newPlan} (${commissionRate}%)`);

    // Sincronizar Store.plan com o novo plano
    const planNumberMap: Record<string, number> = { plan1: 1, plan2: 2, plan3: 3 };
    await prisma.store.update({ where: { id: String(updated.storeId) }, data: { plan: planNumberMap[newPlan] ?? 1 } });

    return res.json({
      message: `Plano alterado de ${oldPlan} para ${newPlan}`,
      subscription: updated,
    });
  } catch (err) {
    console.error('❌ Error updating store plan:', err);
    return res.status(500).json({ error: 'Erro ao alterar plano' });
  }
};

// ✅ GET All Stores Subscriptions (CEO vê todos os planos)
export const getAllStoreSubscriptions = async (req: Request & { user?: any }, res: Response) => {
  try {
    const subscriptions = await listAllSubs();
    return res.json(subscriptions);
  } catch (err) {
    console.error('❌ Error getting all subscriptions:', err);
    return res.status(500).json({ error: 'Erro ao buscar planos' });
  }
};
