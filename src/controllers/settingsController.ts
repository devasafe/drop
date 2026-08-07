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
} from '../repositories/storeSubscription.repository';

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

// ✅ UPDATE Platform Config (Only CEO)
export const updatePlatformConfig = async (req: Request & { user?: any }, res: Response) => {
  try {
    const userId = req.user?.id || (req as any).userId;

    const {
      commissionPlan1,
      commissionPlan2,
      commissionPlan3,
      motoboyCutPerDelivery,
      motoboyCutPerKm,
      motoboyMinimumWithdraw,
      motoboyCommissionPercent,
      lateCancellationFeePercent,
      lateCancellationMotoboyShare,
      cancelFeeCustomerPercent, cancelFeeStorePercent, cancelFeeMotoboyPercent,
      storeAcceptTimeoutMin, poolTimeoutMin, customerAbsentWaitMin,
      seasonalTheme,
      cardFeePercent, cardFeeFixed, cardAnticipationMonthlyRate, cardInstallmentMaxCount, cardInstallmentMinValue,
    } = req.body;

    // Só grava os campos enviados (patch parcial), preservando o resto da config.
    const patch: Record<string, any> = {};
    if (commissionPlan1 !== undefined) patch.commissionPlan1 = commissionPlan1;
    if (commissionPlan2 !== undefined) patch.commissionPlan2 = commissionPlan2;
    if (commissionPlan3 !== undefined) patch.commissionPlan3 = commissionPlan3;
    if (motoboyCutPerDelivery !== undefined) patch.motoboyCutPerDelivery = motoboyCutPerDelivery;
    if (motoboyCutPerKm !== undefined) patch.motoboyCutPerKm = motoboyCutPerKm;
    if (motoboyMinimumWithdraw !== undefined) patch.motoboyMinimumWithdraw = motoboyMinimumWithdraw;
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

    const config = await savePlatformConfig(patch, userId);

    // Notificar todos os clientes sobre mudança de tema sazonal
    if (seasonalTheme !== undefined) {
      emitToAll('theme:updated', { seasonalTheme: config.seasonalTheme });
    }

    // 🔴 IMPORTANTE: Sincronizar comissões em todas as StoreSubscriptions
    const [c1, c2, c3] = await Promise.all([
      syncCommissionForPlan('plan1', commissionPlan1),
      syncCommissionForPlan('plan2', commissionPlan2),
      syncCommissionForPlan('plan3', commissionPlan3),
    ]);
    const synced = c1 + c2 + c3;

    console.log('✅ Platform config updated:', config);
    console.log(`📊 Sincronizadas ${synced} lojas com novas comissões`);

    return res.json({
      config,
      message: `Configurações salvas e ${synced} lojas sincronizadas`,
    });
  } catch (err) {
    console.error('❌ Error updating platform config:', err);
    return res.status(500).json({ error: 'Erro ao atualizar configurações' });
  }
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

    console.log('✅ Plan change requested:', { storeId: store.id, newPlan });
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
      return res.status(400).json({ error: 'Solicitação não está pendente' });
    }

    const newPlan = subscription.requestedPlan as string;

    // Atualizar comissão baseado no novo plano
    const config = await loadPlatformConfig();
    const planMap: any = config
      ? { plan1: config.commissionPlan1, plan2: config.commissionPlan2, plan3: config.commissionPlan3 }
      : {};
    const commissionRate = planMap[newPlan] ?? 10;

    const updated = await updateSub(subscription.id, {
      currentPlan: newPlan,
      // Volta para none após aprovar
      planChangeStatus: 'none',
      approvedAt: new Date(),
      approvedBy: userId,
      commissionRate,
    });

    // Sincronizar Store.plan com o plano aprovado
    const planNumberMap: Record<string, number> = { plan1: 1, plan2: 2, plan3: 3 };
    const planNumber = planNumberMap[newPlan] ?? 1;
    await prisma.store.update({ where: { id: String(updated.storeId) }, data: { plan: planNumber } });

    console.log('✅ Plan change approved:', { subscriptionId, newPlan, planNumber });
    return res.json({
      message: 'Plano alterado com sucesso',
      subscription: updated,
    });
  } catch (err) {
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

    const updated = await updateSub(subscription.id, {
      planChangeStatus: 'rejected',
      rejectionReason: reason || 'Rejeitado pelo CEO',
    });

    console.log('✅ Plan change rejected:', { subscriptionId, reason });
    return res.json({
      message: 'Solicitação rejeitada',
      subscription: updated,
    });
  } catch (err) {
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
    console.log(`💰 [updateStorePlan] ${updated.storeName}: ${oldPlan} → ${newPlan} (${commissionRate}%)`);

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
