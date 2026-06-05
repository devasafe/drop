import { Request, Response } from 'express';
import PlatformConfig from '../models/PlatformConfig';
import StoreSubscription from '../models/StoreSubscription';
import Store from '../models/Store';
import { emitToAll } from '../utils/socketEmitter';

// ✅ GET Current Platform Config
export const getPlatformConfig = async (req: Request, res: Response) => {
  try {
    let config = await PlatformConfig.findOne();
    
    // Se não existe, criar com valores default
    if (!config) {
      config = await PlatformConfig.create({
        commissionPlan1: 10,
        commissionPlan2: 15,
        commissionPlan3: 5,
        motoboyCutPerDelivery: 5,
        motoboyCutPerKm: 1,
        motoboyMinimumWithdraw: 50,
        motoboyCommissionPercent: 20, // ✨ NOVO
        updatedBy: 'system',
      });
    }

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
    const role = req.user?.role;

    if (role !== 'ceo') {
      return res.status(403).json({ error: 'Apenas CEO pode alterar configurações' });
    }

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
      seasonalTheme,
    } = req.body;

    let config = await PlatformConfig.findOne();
    if (!config) {
      config = new PlatformConfig({ updatedBy: userId });
    }

    if (commissionPlan1 !== undefined) config.commissionPlan1 = commissionPlan1;
    if (commissionPlan2 !== undefined) config.commissionPlan2 = commissionPlan2;
    if (commissionPlan3 !== undefined) config.commissionPlan3 = commissionPlan3;
    if (motoboyCutPerDelivery !== undefined) config.motoboyCutPerDelivery = motoboyCutPerDelivery;
    if (motoboyCutPerKm !== undefined) config.motoboyCutPerKm = motoboyCutPerKm;
    if (motoboyMinimumWithdraw !== undefined) config.motoboyMinimumWithdraw = motoboyMinimumWithdraw;
    if (motoboyCommissionPercent !== undefined) config.motoboyCommissionPercent = motoboyCommissionPercent;
    if (lateCancellationFeePercent !== undefined) config.lateCancellationFeePercent = lateCancellationFeePercent;
    if (lateCancellationMotoboyShare !== undefined) config.lateCancellationMotoboyShare = lateCancellationMotoboyShare;
    if (seasonalTheme !== undefined) config.seasonalTheme = seasonalTheme;

    config.updatedAt = new Date();
    config.updatedBy = userId;

    await config.save();

    // Notificar todos os clientes sobre mudança de tema sazonal
    if (seasonalTheme !== undefined) {
      emitToAll('theme:updated', { seasonalTheme: config.seasonalTheme });
    }

    // 🔴 IMPORTANTE: Sincronizar comissões em todas as StoreSubscriptions
    const planMap: any = {
      plan1: commissionPlan1,
      plan2: commissionPlan2,
      plan3: commissionPlan3,
    };

    const updateResults = await Promise.all([
      StoreSubscription.updateMany(
        { currentPlan: 'plan1' },
        { commissionRate: commissionPlan1 }
      ),
      StoreSubscription.updateMany(
        { currentPlan: 'plan2' },
        { commissionRate: commissionPlan2 }
      ),
      StoreSubscription.updateMany(
        { currentPlan: 'plan3' },
        { commissionRate: commissionPlan3 }
      ),
    ]);

    console.log('✅ Platform config updated:', config);
    console.log(`📊 Sincronizadas ${updateResults[0].modifiedCount + updateResults[1].modifiedCount + updateResults[2].modifiedCount} lojas com novas comissões`);
    
    return res.json({
      config,
      message: `Configurações salvas e ${updateResults[0].modifiedCount + updateResults[1].modifiedCount + updateResults[2].modifiedCount} lojas sincronizadas`,
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
    const store = await Store.findOne({ ownerId: userId });
    if (!store) {
      return res.status(404).json({ error: 'Loja não encontrada' });
    }

    let subscription = await StoreSubscription.findOne({ storeId: store._id });
    if (!subscription) {
      // Criar com valor default plan1
      subscription = await StoreSubscription.create({
        storeId: store._id.toString(),
        storeName: store.name,
        currentPlan: 'plan1',
      });
    }

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
    const store = await Store.findOne({ ownerId: userId });
    if (!store) {
      return res.status(404).json({ error: 'Loja não encontrada' });
    }

    let subscription = await StoreSubscription.findOne({ storeId: store._id });
    if (!subscription) {
      subscription = await StoreSubscription.create({
        storeId: store._id.toString(),
        storeName: store.name,
        currentPlan: 'plan1',
      });
    }

    // Se já tem uma requisição pendente, rejeita
    if (subscription.planChangeStatus === 'pending') {
      return res.status(400).json({ 
        error: 'Você já tem uma alteração de plano pendente de aprovação do CEO' 
      });
    }

    subscription.requestedPlan = newPlan;
    subscription.planChangeStatus = 'pending';
    subscription.requestedAt = new Date();
    await subscription.save();

    console.log('✅ Plan change requested:', { storeId: store._id, newPlan });
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
    const role = req.user?.role;

    if (role !== 'ceo') {
      return res.status(403).json({ error: 'Apenas CEO pode ver requisições' });
    }

    const pending = await StoreSubscription.find({ planChangeStatus: 'pending' });
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
    const role = req.user?.role;
    const { subscriptionId } = req.body;

    if (role !== 'ceo') {
      return res.status(403).json({ error: 'Apenas CEO pode aprovar' });
    }

    const subscription = await StoreSubscription.findById(subscriptionId);
    if (!subscription) {
      return res.status(404).json({ error: 'Solicitação não encontrada' });
    }

    if (subscription.planChangeStatus !== 'pending') {
      return res.status(400).json({ error: 'Solicitação não está pendente' });
    }

    // Atualizar plano
    subscription.currentPlan = subscription.requestedPlan as any;
    subscription.planChangeStatus = 'approved';
    subscription.approvedAt = new Date();
    subscription.approvedBy = userId;
    subscription.planChangeStatus = 'none'; // Volta para none após aprovar

    // Atualizar comissão baseado no novo plano
    const config = await PlatformConfig.findOne();
    if (config) {
      const planMap: any = {
        plan1: config.commissionPlan1,
        plan2: config.commissionPlan2,
        plan3: config.commissionPlan3,
      };
      subscription.commissionRate = planMap[subscription.currentPlan] || 10;
    }

    await subscription.save();

    // Sincronizar Store.plan com o plano aprovado
    const planNumberMap: Record<string, number> = { plan1: 1, plan2: 2, plan3: 3 };
    const planNumber = planNumberMap[subscription.currentPlan] ?? 1;
    await Store.findOneAndUpdate({ _id: subscription.storeId }, { plan: planNumber });

    console.log('✅ Plan change approved:', { subscriptionId, newPlan: subscription.currentPlan, planNumber });
    return res.json({
      message: 'Plano alterado com sucesso',
      subscription,
    });
  } catch (err) {
    console.error('❌ Error approving plan change:', err);
    return res.status(500).json({ error: 'Erro ao aprovar mudança' });
  }
};

// ✅ REJECT Plan Change (CEO rejeita)
export const rejectPlanChange = async (req: Request & { user?: any }, res: Response) => {
  try {
    const userId = req.user?.id || (req as any).userId;
    const role = req.user?.role;
    const { subscriptionId, reason } = req.body;

    if (role !== 'ceo') {
      return res.status(403).json({ error: 'Apenas CEO pode rejeitar' });
    }

    const subscription = await StoreSubscription.findById(subscriptionId);
    if (!subscription) {
      return res.status(404).json({ error: 'Solicitação não encontrada' });
    }

    subscription.planChangeStatus = 'rejected';
    subscription.rejectionReason = reason || 'Rejeitado pelo CEO';
    await subscription.save();

    console.log('✅ Plan change rejected:', { subscriptionId, reason });
    return res.json({
      message: 'Solicitação rejeitada',
      subscription,
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
    const role = req.user?.role;
    const { subscriptionId, newPlan } = req.body;

    if (role !== 'ceo') {
      return res.status(403).json({ error: 'Apenas CEO pode alterar planos' });
    }

    if (!['plan1', 'plan2', 'plan3'].includes(newPlan)) {
      return res.status(400).json({ error: 'Plano inválido' });
    }

    const subscription = await StoreSubscription.findById(subscriptionId);
    if (!subscription) {
      return res.status(404).json({ error: 'Assinatura não encontrada' });
    }

    // Atualizar plano
    const oldPlan = subscription.currentPlan;
    subscription.currentPlan = newPlan;
    subscription.planChangeStatus = 'none'; // Reseta status
    subscription.approvedAt = new Date();
    subscription.approvedBy = userId;

    // 🔴 IMPORTANTE: Atualizar comissão baseado no novo plano
    const config = await PlatformConfig.findOne();
    if (config) {
      const planMap: any = {
        plan1: config.commissionPlan1,
        plan2: config.commissionPlan2,
        plan3: config.commissionPlan3,
      };
      subscription.commissionRate = planMap[newPlan] || 10;
      console.log(`💰 [updateStorePlan] ${subscription.storeName}: ${oldPlan} → ${newPlan} (${subscription.commissionRate}%)`);
    }

    await subscription.save();

    // Sincronizar Store.plan com o novo plano
    const planNumberMap: Record<string, number> = { plan1: 1, plan2: 2, plan3: 3 };
    await Store.findOneAndUpdate({ _id: subscription.storeId }, { plan: planNumberMap[newPlan] ?? 1 });

    return res.json({
      message: `Plano alterado de ${oldPlan} para ${newPlan}`,
      subscription,
    });
  } catch (err) {
    console.error('❌ Error updating store plan:', err);
    return res.status(500).json({ error: 'Erro ao alterar plano' });
  }
};

// ✅ GET All Stores Subscriptions (CEO vê todos os planos)
export const getAllStoreSubscriptions = async (req: Request & { user?: any }, res: Response) => {
  try {
    const role = req.user?.role;

    if (role !== 'ceo') {
      return res.status(403).json({ error: 'Apenas CEO pode ver todos os planos' });
    }

    const subscriptions = await StoreSubscription.find().sort({ updatedAt: -1 });
    return res.json(subscriptions);
  } catch (err) {
    console.error('❌ Error getting all subscriptions:', err);
    return res.status(500).json({ error: 'Erro ao buscar planos' });
  }
};
