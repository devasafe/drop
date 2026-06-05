import { Request, Response } from 'express';
import payoutService from '../services/payout.service';
import Payout from '../models/Payout';
import mongoose from 'mongoose';

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

// Admin/CEO - Ver todos os payouts
export const getAdminPayouts = async (req: Request & { user?: any }, res: Response) => {
  try {
    const role = req.user?.activeRole || req.user?.role;
    if (role !== 'ceo') {
      return res.status(403).json({ error: 'Apenas CEO pode acessar' });
    }

    const { status, recipientType, recipientId, orderId, page, limit } = req.query;

    const result = await payoutService.listPayouts({
      status: status as string,
      recipientType: recipientType as string,
      recipientId: recipientId as string,
      orderId: orderId as string,
      page: Number(page) || 1,
      limit: Number(limit) || 50,
    });

    // Enriquecer cada payout com dados do destinatario e do pedido (origem/destino)
    const Store = (await import('../models/Store')).default;
    const User = (await import('../models/User')).default;
    const Order = (await import('../models/Order')).default;

    const storeIds = result.payouts
      .filter((p: any) => p.recipientType === 'store')
      .map((p: any) => p.recipientId);
    const userIds = result.payouts
      .filter((p: any) => p.recipientType === 'motoboy')
      .map((p: any) => p.recipientId);
    const orderIds = result.payouts.map((p: any) => p.orderId);

    const [stores, users, orders] = await Promise.all([
      storeIds.length ? Store.find({ _id: { $in: storeIds } }).select('_id name ownerId').lean() : [],
      userIds.length ? User.find({ _id: { $in: userIds } }).select('_id name email').lean() : [],
      orderIds.length ? Order.find({ _id: { $in: orderIds } }).select('_id customerId totalValue').lean() : [],
    ]);

    const storeMap = new Map<string, any>((stores as any[]).map((s) => [String(s._id), s] as [string, any]));
    const userMap = new Map<string, any>((users as any[]).map((u) => [String(u._id), u] as [string, any]));
    const orderMap = new Map<string, any>((orders as any[]).map((o) => [String(o._id), o] as [string, any]));

    // Para lojas, buscar tambem o dono (user por tras da store)
    const ownerIds = stores.map((s: any) => s.ownerId).filter(Boolean);
    const owners = ownerIds.length
      ? await User.find({ _id: { $in: ownerIds } }).select('_id name email').lean()
      : [];
    const ownerMap = new Map<string, any>((owners as any[]).map((u) => [String(u._id), u] as [string, any]));

    // Buscar quem comprou (customer) dos pedidos
    const buyerIds = orders
      .map((o: any) => o.customerId)
      .filter(Boolean);
    const buyers = buyerIds.length
      ? await User.find({ _id: { $in: buyerIds } }).select('_id name email').lean()
      : [];
    const buyerMap = new Map<string, any>((buyers as any[]).map((u) => [String(u._id), u] as [string, any]));

    const enriched = result.payouts.map((p: any) => {
      const obj: any = p.toObject ? p.toObject() : p;
      const recipientId = String(obj.recipientId);
      const orderId = String(obj.orderId);

      let recipient: any = null;
      if (obj.recipientType === 'store') {
        const store = storeMap.get(recipientId);
        if (store) {
          const owner = store.ownerId ? ownerMap.get(String(store.ownerId)) : null;
          recipient = {
            id: String(store._id),
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
          recipient = { id: String(user._id), name: user.name, email: user.email, type: 'motoboy' };
        }
      }

      const order = orderMap.get(orderId);
      const buyerId = order ? order.customerId : null;
      const buyer = buyerId ? buyerMap.get(String(buyerId)) : null;

      obj.recipient = recipient;
      obj.order = order
        ? {
            id: String(order._id),
            total: order.totalValue,
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

// Admin/CEO - Bloquear payout (fraude, inconsistência)
export const blockPayout = async (req: Request & { user?: any }, res: Response) => {
  try {
    const role = req.user?.activeRole || req.user?.role;
    if (role !== 'ceo') {
      return res.status(403).json({ error: 'Apenas CEO pode bloquear payouts' });
    }

    const Payout = (await import('../models/Payout')).default;
    const { id } = req.params;
    const { reason } = req.body;

    const payout = await Payout.findById(id);
    if (!payout) return res.status(404).json({ error: 'Payout não encontrado' });
    if (payout.status !== 'pending') {
      return res.status(400).json({ error: 'Apenas payouts pendentes podem ser bloqueados' });
    }

    payout.blocked = true;
    payout.blockReason = reason || 'Sem motivo informado';
    payout.blockedAt = new Date();
    payout.blockedBy = req.user?.id;
    await payout.save();

    return res.json({ message: 'Payout bloqueado', payout });
  } catch (err: any) {
    console.error('Erro ao bloquear payout:', err);
    return res.status(500).json({ error: err.message || 'Erro ao bloquear' });
  }
};

// Admin/CEO - Desbloquear payout
export const unblockPayout = async (req: Request & { user?: any }, res: Response) => {
  try {
    const role = req.user?.activeRole || req.user?.role;
    if (role !== 'ceo') {
      return res.status(403).json({ error: 'Apenas CEO pode desbloquear payouts' });
    }

    const Payout = (await import('../models/Payout')).default;
    const { id } = req.params;

    const payout = await Payout.findById(id);
    if (!payout) return res.status(404).json({ error: 'Payout não encontrado' });

    payout.blocked = false;
    payout.blockReason = undefined;
    payout.blockedAt = null;
    payout.blockedBy = undefined;
    await payout.save();

    return res.json({ message: 'Payout desbloqueado', payout });
  } catch (err: any) {
    console.error('Erro ao desbloquear payout:', err);
    return res.status(500).json({ error: err.message || 'Erro ao desbloquear' });
  }
};

// Admin/CEO - Toggle auto-aprovação
export const toggleAutoApprove = async (req: Request & { user?: any }, res: Response) => {
  try {
    const role = req.user?.activeRole || req.user?.role;
    if (role !== 'ceo') {
      return res.status(403).json({ error: 'Apenas CEO pode alterar a configuração' });
    }

    const PlatformConfig = (await import('../models/PlatformConfig')).default;
    const { enabled } = req.body;

    let config = await PlatformConfig.findOne();
    if (!config) {
      config = new PlatformConfig({ updatedBy: req.user?.id });
    }
    config.autoApprovePayouts = !!enabled;
    config.updatedAt = new Date();
    config.updatedBy = req.user?.id;
    await config.save();

    return res.json({ autoApprovePayouts: config.autoApprovePayouts });
  } catch (err: any) {
    console.error('Erro ao toggle auto-approve:', err);
    return res.status(500).json({ error: err.message || 'Erro' });
  }
};

// Admin/CEO - Ler configuração atual (auto-approve)
export const getPayoutConfig = async (req: Request & { user?: any }, res: Response) => {
  try {
    const PlatformConfig = (await import('../models/PlatformConfig')).default;
    const config = await PlatformConfig.findOne();
    return res.json({ autoApprovePayouts: config?.autoApprovePayouts ?? false });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Erro' });
  }
};

// Admin/CEO - Liberar payout manualmente
export const releasePayoutManually = async (req: Request & { user?: any }, res: Response) => {
  try {
    const role = req.user?.activeRole || req.user?.role;
    if (role !== 'ceo') {
      return res.status(403).json({ error: 'Apenas CEO pode liberar payouts' });
    }

    const { id } = req.params;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await payoutService.releasePayout(id, session);
      });
    } finally {
      session.endSession();
    }

    return res.json({ message: 'Payout liberado com sucesso' });
  } catch (err: any) {
    console.error('Erro ao liberar payout:', err);
    return res.status(400).json({ error: err.message || 'Erro ao liberar payout' });
  }
};

// Admin/CEO - Marcar payouts como pagos
export const markPayoutsPaid = async (req: Request & { user?: any }, res: Response) => {
  try {
    const role = req.user?.activeRole || req.user?.role;
    if (role !== 'ceo') {
      return res.status(403).json({ error: 'Apenas CEO pode marcar payouts como pagos' });
    }

    const { payoutIds, gatewayTransferId } = req.body;
    if (!payoutIds?.length) {
      return res.status(400).json({ error: 'payoutIds obrigatório' });
    }

    const session = await mongoose.startSession();
    try {
      let totalPaid = 0;
      await session.withTransaction(async () => {
        totalPaid = await payoutService.markPayoutsPaid(
          payoutIds,
          gatewayTransferId || `manual_paid_${Date.now()}`,
          session,
        );
      });

      return res.json({ message: 'Payouts marcados como pagos', totalPaid });
    } finally {
      session.endSession();
    }
  } catch (err: any) {
    console.error('Erro ao marcar payouts como pagos:', err);
    return res.status(400).json({ error: err.message || 'Erro ao marcar payouts como pagos' });
  }
};

// Obrigações pendentes (usado pelo admin/app-cashbox)
export const getPendingObligations = async (req: Request & { user?: any }, res: Response) => {
  try {
    const role = req.user?.activeRole || req.user?.role;
    if (role !== 'ceo') {
      return res.status(403).json({ error: 'Apenas CEO pode acessar' });
    }

    const total = await payoutService.getPendingObligations();
    return res.json({ pendingObligations: total });
  } catch (err) {
    console.error('Erro ao buscar obrigações:', err);
    return res.status(500).json({ error: 'Erro ao buscar obrigações' });
  }
};
