import { Request, Response } from 'express';
import payoutService from '../services/payout.service';
import { prisma } from '../lib/prisma';
import { isStoreOwner } from '../utils/storeOwnership';
import logger from '../config/logger';
import { actorFromRequest, sendMoneyActionError, MoneyActionError, recordAdminMoneyAction } from '../services/adminMoneyAction.service';
import { releasePayoutAsAdmin, resolveUncertainPayout, ResolvePayoutInput, payoutNotPendingError } from '../services/payoutRelease.service';

// Lojista/Motoboy - Ver meus payouts
export const getMyPayouts = async (req: Request & { user?: any }, res: Response) => {
  try {
    const userId = req.user?.id;
    const role = req.user?.activeRole || req.user?.role;
    const { storeId, status, page, limit } = req.query;

    let recipientType: 'store' | 'motoboy';
    let recipientId: string;

    if (role === 'lojista' || role === 'seller') {
      recipientType = 'store';
      recipientId = storeId as string || userId;
      if (storeId && !(await isStoreOwner(storeId, userId))) return res.status(403).json({ error: 'Acesso negado: esta loja não é sua' });
    } else if (role === 'motoboy') {
      recipientType = 'motoboy';
      recipientId = userId;
    } else {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const result = await payoutService.listPayouts({
      recipientType,
      recipientId,
      status: status as string,
      page: Number(page) || 1,
      limit: Number(limit) || 50,
    });

    return res.json(result);
  } catch (err) {
    console.error('Erro ao buscar payouts:', err);
    return res.status(500).json({ error: 'Erro ao buscar payouts' });
  }
};

// Lojista/Motoboy - Resumo financeiro agregado (buckets + mês/hoje)
export const getMyPayoutSummary = async (req: Request & { user?: any }, res: Response) => {
  try {
    const userId = req.user?.id;
    const role = req.user?.activeRole || req.user?.role;
    const { storeId } = req.query;

    let recipientType: 'store' | 'motoboy';
    let recipientId: string;
    if (role === 'lojista' || role === 'seller') {
      recipientType = 'store';
      recipientId = (storeId as string) || userId;
      if (storeId && !(await isStoreOwner(storeId, userId))) return res.status(403).json({ error: 'Acesso negado: esta loja não é sua' });
    } else if (role === 'motoboy') {
      recipientType = 'motoboy';
      recipientId = userId;
    } else {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const summary = await payoutService.getEarningsSummary(recipientType, recipientId);
    return res.json(summary);
  } catch (err) {
    console.error('Erro ao buscar resumo de payouts:', err);
    return res.status(500).json({ error: 'Erro ao buscar resumo financeiro' });
  }
};

// Admin/CEO - Ver todos os payouts
export const getAdminPayouts = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { status, recipientType, recipientId, orderId, page, limit, uncertain } = req.query;

    const result = await payoutService.listPayouts({
      status: status as string,
      recipientType: recipientType as string,
      recipientId: recipientId as string,
      orderId: orderId as string,
      page: Number(page) || 1,
      limit: Number(limit) || 50,
      uncertain: uncertain === '1' || uncertain === 'true',
    });

    // Enriquecer cada payout com dados do destinatario e do pedido (origem/destino)

    const storeIds = result.payouts
      .filter((p: any) => p.recipientType === 'store')
      .map((p: any) => p.recipientId);
    const userIds = result.payouts
      .filter((p: any) => p.recipientType === 'motoboy')
      .map((p: any) => p.recipientId);
    const orderIds = result.payouts.map((p: any) => p.orderId);

    const [stores, users, orders] = await Promise.all([
      storeIds.length ? prisma.store.findMany({ where: { id: { in: storeIds.map(String) } }, select: { id: true, name: true, ownerId: true } }) : [],
      userIds.length ? prisma.user.findMany({ where: { id: { in: userIds.map(String) } }, select: { id: true, name: true, email: true } }) : [],
      orderIds.length ? prisma.order.findMany({ where: { id: { in: orderIds.map(String) } }, select: { id: true, customerId: true, totalValue: true } }) : [],
    ]);

    const storeMap = new Map<string, any>((stores as any[]).map((s) => [String(s.id), s] as [string, any]));
    const userMap = new Map<string, any>((users as any[]).map((u) => [String(u.id), u] as [string, any]));
    const orderMap = new Map<string, any>((orders as any[]).map((o) => [String(o.id), o] as [string, any]));

    // Para lojas, buscar tambem o dono (user por tras da store)
    const ownerIds = stores.map((s: any) => s.ownerId).filter(Boolean);
    const owners = ownerIds.length
      ? await prisma.user.findMany({ where: { id: { in: ownerIds.map(String) } }, select: { id: true, name: true, email: true } })
      : [];
    const ownerMap = new Map<string, any>((owners as any[]).map((u) => [String(u.id), u] as [string, any]));

    // Buscar quem comprou (customer) dos pedidos
    const buyerIds = orders
      .map((o: any) => o.customerId)
      .filter(Boolean);
    const buyers = buyerIds.length
      ? await prisma.user.findMany({ where: { id: { in: buyerIds.map(String) } }, select: { id: true, name: true, email: true } })
      : [];
    const buyerMap = new Map<string, any>((buyers as any[]).map((u) => [String(u.id), u] as [string, any]));

    const enriched = result.payouts.map((p: any) => {
      const obj: any = p.toObject ? p.toObject() : { ...p };
      const recipientId = String(obj.recipientId);
      const orderId = String(obj.orderId);

      let recipient: any = null;
      if (obj.recipientType === 'store') {
        const store = storeMap.get(recipientId);
        if (store) {
          const owner = store.ownerId ? ownerMap.get(String(store.ownerId)) : null;
          recipient = {
            id: String(store.id),
            name: store.name,
            type: 'store',
            ownerId: store.ownerId ? String(store.ownerId) : undefined,
            ownerName: owner?.name,
            ownerEmail: owner?.email,
          };
        }
      } else if (obj.recipientType === 'motoboy') {
        const user = userMap.get(recipientId);
        if (user) {
          recipient = { id: String(user.id), name: user.name, email: user.email, type: 'motoboy' };
        }
      }

      const order = orderMap.get(orderId);
      const buyerId = order ? order.customerId : null;
      const buyer = buyerId ? buyerMap.get(String(buyerId)) : null;

      obj.recipient = recipient;
      obj.order = order
        ? {
            id: String(order.id),
            total: order.totalValue != null ? Number(order.totalValue) : order.totalValue,
            buyerId: buyerId ? String(buyerId) : undefined,
            buyerName: buyer?.name,
            buyerEmail: buyer?.email,
          }
        : null;

      return obj;
    });

    return res.json({ payouts: enriched, total: result.total });
  } catch (err) {
    console.error('Erro ao buscar payouts admin:', err);
    return res.status(500).json({ error: 'Erro ao buscar payouts' });
  }
};

// Admin/CEO - Bloquear payout (fraude, inconsistência). D3b-3: condicional (pending e livre),
// motivo obrigatório (validado na rota), linha payout_block na mesma transação.
export const blockPayout = async (req: Request & { user?: any }, res: Response) => {
  try {
    const id = String(req.params.id);
    const reason = String(req.body.reason);
    const actor = actorFromRequest(req);

    const updated = await prisma.$transaction(async (tx) => {
      const { count } = await tx.payout.updateMany({
        where: { id, status: 'pending', blocked: false },
        data: { blocked: true, blockReason: reason, blockedAt: new Date(), blockedBy: actor.id },
      });
      if (count !== 1) throw await payoutNotPendingError(id, tx);
      const payout = await tx.payout.findUniqueOrThrow({ where: { id } });
      await recordAdminMoneyAction(tx, {
        actor,
        type: 'payout_block',
        targetType: 'payout',
        targetId: id,
        amount: payout.amount,
        reason,
        before: { status: 'pending', blocked: false },
        after: { status: 'pending', blocked: true },
      });
      return payout;
    });

    return res.json({ message: 'Payout bloqueado', payout: { ...updated, _id: updated.id, amount: Number(updated.amount) } });
  } catch (err: any) {
    if (sendMoneyActionError(res, err)) return;
    logger.error('Erro ao bloquear payout', err as Error, { payoutId: req.params.id });
    return res.status(500).json({ error: 'Erro ao bloquear o repasse' });
  }
};

// Admin/CEO - Desbloquear payout. D3b-3: condicional (só bloqueado), linha payout_unblock
// guardando quem desbloqueou e o bloqueio anterior.
export const unblockPayout = async (req: Request & { user?: any }, res: Response) => {
  try {
    const id = String(req.params.id);
    const actor = actorFromRequest(req);

    const updated = await prisma.$transaction(async (tx) => {
      const before = await tx.payout.findUnique({ where: { id } });
      if (!before) throw new MoneyActionError(404, 'PAYOUT_NOT_FOUND', 'Payout não encontrado');
      const { count } = await tx.payout.updateMany({
        where: { id, blocked: true },
        data: { blocked: false, blockReason: null, blockedAt: null, blockedBy: null },
      });
      if (count !== 1) {
        const now = await tx.payout.findUnique({ where: { id }, select: { status: true } });
        throw new MoneyActionError(409, 'PAYOUT_NOT_BLOCKED', 'Repasse não está bloqueado', {
          currentStatus: now?.status ?? before.status,
          blocked: false,
        });
      }
      await recordAdminMoneyAction(tx, {
        actor,
        type: 'payout_unblock',
        targetType: 'payout',
        targetId: id,
        amount: before.amount,
        before: {
          blocked: true,
          blockReason: before.blockReason,
          blockedBy: before.blockedBy,
          blockedAt: before.blockedAt ? before.blockedAt.toISOString() : null,
        },
        after: { blocked: false },
      });
      return tx.payout.findUniqueOrThrow({ where: { id } });
    });

    return res.json({ message: 'Payout desbloqueado', payout: { ...updated, _id: updated.id, amount: Number(updated.amount) } });
  } catch (err: any) {
    if (sendMoneyActionError(res, err)) return;
    logger.error('Erro ao desbloquear payout', err as Error, { payoutId: req.params.id });
    return res.status(500).json({ error: 'Erro ao desbloquear o repasse' });
  }
};

// Admin/CEO - Toggle auto-aprovação
export const toggleAutoApprove = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { updatePlatformConfig } = await import('../repositories/platformConfig.repository');
    const { enabled } = req.body;

    const config = await updatePlatformConfig({ autoApprovePayouts: !!enabled }, req.user?.id);

    return res.json({ autoApprovePayouts: config.autoApprovePayouts });
  } catch (err: any) {
    console.error('Erro ao toggle auto-approve:', err);
    return res.status(500).json({ error: err.message || 'Erro' });
  }
};

// Admin/CEO - Ler configuração atual (auto-approve)
export const getPayoutConfig = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { getPlatformConfig } = await import('../repositories/platformConfig.repository');
    const config = await getPlatformConfig();
    return res.json({ autoApprovePayouts: config?.autoApprovePayouts ?? false });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Erro' });
  }
};

// Admin/CEO - Liberar payout manualmente (D3b-3, spec 4.1: reivindica antes do Asaas;
// 409 PAYOUT_NOT_PENDING, 502 PAYOUT_TRANSFER_REFUSED / PAYOUT_TRANSFER_UNCERTAIN).
// Libera SÓ o payout deste id (liberar a loja não libera o motoboy do mesmo pedido).
export const releasePayoutManually = async (req: Request & { user?: any }, res: Response) => {
  try {
    const payout = await releasePayoutAsAdmin(String(req.params.id), actorFromRequest(req));
    return res.json({ message: 'Payout liberado com sucesso', payout });
  } catch (err: any) {
    if (sendMoneyActionError(res, err)) return;
    logger.error('Erro ao liberar payout', err as Error, { payoutId: req.params.id });
    return res.status(500).json({ error: 'Erro ao liberar o repasse' });
  }
};

// Admin/CEO - Marcar payouts como pagos
export const markPayoutsPaid = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { payoutIds, gatewayTransferId } = req.body;
    if (!payoutIds?.length) {
      return res.status(400).json({ error: 'payoutIds obrigatório' });
    }

    const totalPaid = await payoutService.markPayoutsPaid(
      payoutIds,
      gatewayTransferId || `manual_paid_${Date.now()}`,
      undefined,
      { actor: actorFromRequest(req) },
    );

    return res.json({ message: 'Payouts marcados como pagos', totalPaid });
  } catch (err: any) {
    console.error('Erro ao marcar payouts como pagos:', err);
    return res.status(400).json({ error: err.message || 'Erro ao marcar payouts como pagos' });
  }
};

// Obrigações pendentes (usado pelo admin/app-cashbox)
export const getPendingObligations = async (req: Request & { user?: any }, res: Response) => {
  try {
    const total = await payoutService.getPendingObligations();
    return res.json({ pendingObligations: total });
  } catch (err) {
    console.error('Erro ao buscar obrigações:', err);
    return res.status(500).json({ error: 'Erro ao buscar obrigações' });
  }
};

// Admin - Resolver repasse incerto/travado em liberação (D3b-3, spec 4.1), depois de conferir no Asaas.
export const resolveUncertainPayoutHandler = async (req: Request & { user?: any }, res: Response) => {
  try {
    const payout = await resolveUncertainPayout(String(req.params.id), actorFromRequest(req), req.body as ResolvePayoutInput);
    return res.json({ message: 'Repasse resolvido', payout });
  } catch (err: any) {
    if (sendMoneyActionError(res, err)) return;
    logger.error('[repasse] falha ao resolver repasse incerto', err as Error, { payoutId: req.params.id });
    return res.status(500).json({ error: 'Erro ao resolver o repasse' });
  }
};
