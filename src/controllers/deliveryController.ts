import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import mongoose, { Types } from 'mongoose';
import AppCashbox from '../models/AppCashbox';
import Delivery from '../models/Delivery';
import Order from '../models/Order';
import User from '../models/User';
import Store from '../models/Store';
import Wallet from '../models/Wallet';
import PlatformConfig from '../models/PlatformConfig';
import Gamification from '../models/Gamification';
import { getLevel, checkAndAwardBadges } from './gamificationController';
import notifier from '../services/notifier';
import { calculateDeliveryFeeWithConfig, calculateMotoboyEarningsWithConfig, calculateOrderDistribution } from '../utils/walletCalculations';
import { addCommissionToAppCashbox } from './appCashboxController';
import { emitDeliveryStatusChanged, emitDeliveryUpdated, emitGamificationPointsEarned, emitGamificationBadgeUnlocked, emitToRoom, emitDeliveryCompleted, emitOrderStatusChanged, emitDeliveryAssigned } from '../utils/socketEmitter';
import { getDefaultAddress } from '../utils/userHelpers';
import { isMotoboyVerified, missingMotoboyVerifications } from '../utils/courierVerification';
import walletService from '../services/wallet.service';
import payoutService from '../services/payout.service';
import env from '../config/env';
import { releaseOrderViaAsaas } from '../services/asaas/release';
import deliveryInvoiceService from '../services/deliveryInvoice.service';

// Loja valida PIN de retirada informado pelo motoboy
export const validarPinRetirada = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params; // delivery id
    const { pinRetirada } = req.body;
    const userId = req.user?.id;
    // Apenas a loja pode validar
    const delivery = await Delivery.findById(id).populate('motoboyId');
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    const order = await Order.findById(delivery.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const store = await Store.findById(order.storeId);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    if (!userId || store.ownerId.toString() !== userId) {
      return res.status(403).json({ error: 'Forbidden - only store owner can validate PIN'});
    }
    if (!pinRetirada || pinRetirada !== delivery.pinRetirada) return res.status(400).json({ error: 'PIN de retirada inválido' });
    if (delivery.status !== 'assigned') return res.status(400).json({ error: 'Entrega não está aguardando retirada' });
    delivery.status = 'picked';
    await delivery.save();

    // Get motoboy name
    const motoboy = delivery.motoboyId as any;
    const motoboyName = motoboy?.name || 'Motoboy';

    // ✅ WORKFLOW 4: Notificar CLIENTE que pedido foi retirado
    emitToRoom(
      `user:${order.customerId}`,
      'delivery:picked',
      {
        orderId: order._id,
        deliveryId: delivery._id,
        status: '🚗 Motoboy retirou seu pedido',
        message: `${motoboyName} retirou seu pedido da loja e está a caminho!`,
        eta: '20-30 minutos',
        pickedAt: new Date()
      }
    );

    // ✅ WORKFLOW 4: Notificar LOJA que pedido foi retirado
    emitToRoom(
      `store:${order.storeId}`,
      'order:picked_up',
      {
        orderId: order._id,
        deliveryId: delivery._id,
        motoboyName: motoboyName,
        message: `Pedido retirado por ${motoboyName}`,
        pickedAt: new Date()
      }
    );

    // ✅ WORKFLOW 4: Notificar MOTOBOY que PIN foi validado
    emitToRoom(
      `user:${delivery.motoboyId}`,
      'delivery:pin_validated',
      {
        deliveryId: delivery._id,
        orderId: order._id,
        message: 'PIN validado com sucesso! Entrega confirmada',
        status: '✅ Pedido retirado - Siga para o endereço de entrega'
      }
    );

    // Broadcast delivery status change via socket
    emitDeliveryStatusChanged(delivery.toObject());

    return res.json({ success: true });
  } catch (err) {
    console.error('[validarPinRetirada] error:', err);
    return res.status(500).json({ error: 'Erro ao validar PIN de retirada' });
  }
};
// Listar entregas finalizadas (histórico) para o motoboy logado
export const listHistoryDeliveries = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.user.role !== 'motoboy') return res.status(403).json({ error: 'Forbidden: not motoboy' });
    const deliveries = await Delivery.find({ motoboyId: req.user.id, status: { $in: ['delivered', 'cancelled'] } }).sort({ updatedAt: -1 }).lean();
    return res.json(deliveries);
  } catch (err) {
    console.error('[listHistoryDeliveries] error:', err);
    return res.status(500).json({ error: 'Failed to list history deliveries' });
  }
};
// Listar avaliações recebidas pelo motoboy
export const listarAvaliacoesMotoboy = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params; // motoboyId
    // Só o próprio motoboy ou admin pode ver
    if (!req.user || (req.user.role !== 'motoboy' && req.user.role !== 'admin' && req.user.id !== id)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const avaliacoes = await Delivery.find({ motoboyId: id, rating: { $exists: true, $ne: null } }, { rating: 1, comment: 1, createdAt: 1 }).sort({ createdAt: -1 }).lean();
    return res.json(avaliacoes);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao buscar avaliações do motoboy' });
  }
};

// Cliente avalia o motoboy após entrega
export const avaliarMotoboy = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params; // delivery id
    const { rating, comment } = req.body;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Nota inválida' });
    const delivery = await Delivery.findById(id);
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    // Só o cliente do pedido pode avaliar
    const order = await Order.findById(delivery.orderId);
    if (!order || order.customerId.toString() !== userId) return res.status(403).json({ error: 'Apenas o cliente pode avaliar' });
    if (delivery.status !== 'delivered') return res.status(400).json({ error: 'Entrega ainda não finalizada' });
    if (delivery.rating) return res.status(409).json({ error: 'Entrega já avaliada' });
    delivery.rating = rating;
    delivery.comment = comment;
    await delivery.save();

    // --- Gamificação ---
    if (delivery.motoboyId) {
      let gamification = await Gamification.findOne({ user_id: delivery.motoboyId.toString() });
      if (!gamification) {
        gamification = new Gamification({ user_id: delivery.motoboyId.toString(), points: 0, totalPoints: 0, level: 'Bronze', badges: [], history: [] });
      }
      // Pontuação base por entrega avaliada
      let pontos = 10;
      let acao = 'Entrega avaliada';
      // Bônus por avaliação positiva
      if (rating >= 4) {
        pontos += 5;
        acao = 'Entrega avaliada (nota alta)';
      }
      // Penalidade por avaliação negativa
      if (rating <= 2) {
        pontos -= 2;
        acao = 'Entrega avaliada (nota baixa)';
      }
      gamification.points += pontos;
      gamification.totalPoints += Math.max(0, pontos);
      gamification.level = getLevel(gamification.totalPoints);
      gamification.history.push({ date: new Date().toISOString(), action: acao, points: pontos });

      const newBadges = await checkAndAwardBadges(delivery.motoboyId, gamification);
      await gamification.save();

      newBadges.forEach(b => emitGamificationBadgeUnlocked(delivery.motoboyId!.toString(), b));
      emitGamificationPointsEarned(delivery.motoboyId.toString(), {
        points: pontos,
        totalPoints: gamification.totalPoints,
        level: gamification.level,
      });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao avaliar motoboy' });
  }
};
// Listar entregas em andamento para o motoboy logado
export const listOngoingDeliveries = async (req: AuthenticatedRequest, res: Response) => {
  try {
    console.log('[listOngoingDeliveries] req.user:', req.user);
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.user.role !== 'motoboy') return res.status(403).json({ error: 'Forbidden: not motoboy' });

    // ✅ SEGURANÇA: Paginação
    const page = Math.max(1, Number((req.query as any).page) || 1);
    const limit = Math.min(100, Number((req.query as any).limit) || 20);
    const skip = (page - 1) * limit;

    const deliveries = await Delivery.find({
      motoboyId: req.user.id,
      status: { $in: ['assigned', 'picked'] }
    })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Delivery.countDocuments({
      motoboyId: req.user.id,
      status: { $in: ['assigned', 'picked'] }
    });

    console.log('[listOngoingDeliveries] found:', deliveries.length, 'deliveries');
    
    return res.json({
      deliveries,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('[listOngoingDeliveries] error:', err);
    return res.status(500).json({ error: 'Failed to list ongoing deliveries' });
  }
};
// Motoboy finaliza entrega informando o PIN
export const finalizarEntrega = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { pin } = req.body;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const delivery = await Delivery.findById(id);
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    if (String(delivery.motoboyId) !== String(userId)) return res.status(403).json({ error: 'Not your delivery' });
    if (delivery.status === 'delivered') return res.status(409).json({ error: 'Already delivered' });
    if (!pin || pin !== delivery.pin) return res.status(400).json({ error: 'PIN inválido' });
    delivery.status = 'delivered';
    await delivery.save();

    // Atualiza o status do pedido para 'delivered'
    const order = await Order.findById(delivery.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    order.status = 'entregue';
    await order.save();
    console.log(`✅ [finalizarEntrega] Order ${order._id} marked as 'entregue'`);

    // Distribuição financeira para pedidos COD (pagamento acontece na entrega)
    if (order.paymentMethod === 'cash_on_delivery') {
      try {
        const config = await PlatformConfig.findOne();
        const feePercent = config?.lateCancellationFeePercent ?? 10;
        const requiredBlock = (order.totalValue || 0) * feePercent / 100;

        const distribution = await calculateOrderDistribution(
          (order.totalValue || 0) - (order.deliveryFee || 0),
          order.deliveryFee || 0,
          order.storeId.toString(),
          order.deliveryDistance || 0
        );

        const codSession = await mongoose.startSession();
        codSession.startTransaction();
        try {
          // Creditar loja e liberar bloqueio
          const storeWallet = await Wallet.findOne({ owner: order.storeId.toString(), ownerType: 'store' }).session(codSession);
          if (storeWallet) {
            storeWallet.balance += distribution.storeAmount + requiredBlock;
            storeWallet.totalIncome += distribution.storeAmount;
            storeWallet.blockedBalance = Math.max(0, (storeWallet.blockedBalance || 0) - requiredBlock);
            storeWallet.history.push({
              date: new Date(),
              type: 'credit',
              category: 'payment',
              amount: distribution.storeAmount,
              reason: `Venda COD - pedido ${order._id}`,
              relatedId: order._id.toString(),
            });
            storeWallet.history.push({
              date: new Date(),
              type: 'credit',
              category: 'transfer',
              amount: requiredBlock,
              reason: `Liberação de reserva COD - pedido ${order._id}`,
              reference: `COD_UNBLOCK_${order._id}`,
            });
            await storeWallet.save({ session: codSession });
          }

          // Registrar comissão no AppCashbox
          const appCashbox = await AppCashbox.findOne().session(codSession);
          if (appCashbox) {
            appCashbox.balance += distribution.product.appCommission;
            appCashbox.totalIncome += distribution.product.appCommission;
            appCashbox.history.push({
              type: 'income',
              source: 'product_commission',
              amount: distribution.product.appCommission,
              reason: `Comissão COD - pedido ${order._id}`,
              date: new Date(),
              orderId: order._id.toString(),
            });
            await appCashbox.save({ session: codSession });
          }

          await codSession.commitTransaction();
          codSession.endSession();
        } catch (txErr) {
          await codSession.abortTransaction();
          codSession.endSession();
          console.error('Erro na distribuição financeira COD:', txErr);
        }
      } catch (err) {
        console.error('Erro ao processar pagamento COD na entrega:', err);
      }
    }

    // --- NOVO FLUXO: Criar payout do motoboy + release de todos os payouts do pedido ---
    try {
      const config = await PlatformConfig.findOne();
      const motoboyCommissionPercent = config?.motoboyCommissionPercent || 20;
      const motoboyCommissionDecimal = motoboyCommissionPercent / 100;
      const motoboyAmount = delivery.fee * (1 - motoboyCommissionDecimal);

      // Garantir que a wallet do motoboy exista
      let motoboyWallet = await Wallet.findOne({ owner: userId, ownerType: 'motoboy' });
      if (!motoboyWallet) {
        motoboyWallet = await Wallet.create({
          owner: userId,
          ownerType: 'motoboy',
          balance: 0,
          totalIncome: 0,
          totalSpent: 0,
          availableBalance: 0,
          pendingBalance: 0,
          history: [],
        });
      }

      const useAsaas = env.PAYMENT_GATEWAY === 'asaas';
      if (useAsaas) {
        // Cria o Payout do motoboy (pending). A liberação (transferência real conta-mãe
        // → subcontas) só acontece automaticamente se a plataforma estiver com
        // autoApprovePayouts. Caso contrário, os payouts ficam PENDING e o admin libera
        // manualmente no painel de Payouts (que dispara a transferência no Asaas).
        if (motoboyAmount > 0) {
          await payoutService.createPendingPayout({
            recipientType: 'motoboy',
            recipientId: userId,
            orderId: order._id.toString(),
            deliveryId: delivery._id.toString(),
            amount: motoboyAmount,
          });
        }
        const cfg = await PlatformConfig.findOne();
        if (cfg?.autoApprovePayouts === true) {
          await releaseOrderViaAsaas(order._id.toString());
        } else {
          console.log(`⏸️ [finalizarEntrega] autoApprovePayouts OFF — payouts do pedido ${order._id} ficam PENDING para liberação manual do admin`);
        }
      } else {
        const payoutSession = await mongoose.startSession();
        try {
          await payoutSession.withTransaction(async () => {
            // Criar payout do motoboy (já released — entrega concluída)
            if (motoboyAmount > 0) {
              await payoutService.createPendingPayout({
                recipientType: 'motoboy',
                recipientId: userId,
                orderId: order._id.toString(),
                deliveryId: delivery._id.toString(),
                amount: motoboyAmount,
                session: payoutSession,
              });
            }

            // Liberar TODOS os payouts do pedido (loja pending→released + motoboy pending→released)
            await payoutService.releasePayoutsForOrder(order._id.toString(), payoutSession);
          });
        } finally {
          payoutSession.endSession();
        }
      }

      console.log(`✅ [finalizarEntrega] Payouts released for order ${order._id}. Motoboy: R$ ${motoboyAmount.toFixed(2)}`);

      // --- Gerar nota de servico (idempotente) ---
      try {
        const appCommission = delivery.fee - motoboyAmount;
        const invoice = await deliveryInvoiceService.generateInvoice({
          orderId: order._id.toString(),
          deliveryId: delivery._id.toString(),
          motoboyAmount,
          appCommission,
          commissionPercent: motoboyCommissionPercent,
        });
        console.log(`📄 [finalizarEntrega] Nota de servico gerada: ${invoice.invoiceNumber}`);
      } catch (invoiceErr) {
        console.error('❌ Erro ao gerar nota de servico:', invoiceErr);
      }
    } catch (walletErr) {
      console.error('❌ Erro ao processar payouts na entrega:', walletErr);
    }

    // 🎉 BROADCAST 1: Notificar TODAS as partes que entrega foi completada
    emitDeliveryCompleted(delivery.toObject(), order.toObject());
    
    // 🎉 BROADCAST 2: Status geral da delivery
    emitDeliveryStatusChanged(delivery.toObject());

    // 🎉 BROADCAST 3: ATUALIZAR O PEDIDO TAMBÉM - remove de 'andamento', entra em 'histórico'
    emitOrderStatusChanged(order.toObject());
    console.log(`✅ [finalizarEntrega] Order status changed emitted for client to update history`);

    // --- Gamificação: pontos por entrega finalizada ---
    if (delivery.motoboyId) {
      const mid = delivery.motoboyId.toString();
      let gamification = await Gamification.findOne({ user_id: mid });
      if (!gamification) {
        gamification = new Gamification({ user_id: mid, points: 0, totalPoints: 0, level: 'Bronze', badges: [], history: [] });
      }
      const pontos = 10;
      gamification.points += pontos;
      gamification.totalPoints += pontos;
      gamification.level = getLevel(gamification.totalPoints);
      gamification.history.push({ date: new Date().toISOString(), action: 'Entrega finalizada', points: pontos });

      const newBadges = await checkAndAwardBadges(delivery.motoboyId, gamification);
      await gamification.save();

      newBadges.forEach(b => emitGamificationBadgeUnlocked(mid, b));
      emitGamificationPointsEarned(mid, { points: pontos, totalPoints: gamification.totalPoints, level: gamification.level });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao finalizar entrega' });
  }
};

// create a delivery for an order (store owner or system)
export const createDelivery = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { orderId, distance } = req.body;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // only store owner can create a delivery for this order
    const store = await Store.findById(order.storeId);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    const userId = req.user?.id;
    if (!userId || store.ownerId.toString() !== userId) {
      return res.status(403).json({ error: 'Forbidden - only store owner can create delivery' });
    }

    // ✅ CORRIGIDO: Usar calculateDeliveryFeeWithConfig ao invés de hardcoded
    const fee = await calculateDeliveryFeeWithConfig(Number(distance || 0));

  // Gera PIN de retirada (motoboy) e PIN de entrega (cliente)
  const pinRetirada = Math.floor(100000 + Math.random() * 900000).toString();
  const pin = Math.floor(100000 + Math.random() * 900000).toString();
  const delivery = new Delivery({
    orderId,
    distance: Number(distance || 0),
    fee,
    status: 'pending',
    pinRetirada,
    pin,
    // ✅ NOVO: Copiar endereços e coordenadas do Order para garantir dados originais
    storeAddress: order.storeAddress,
    storeLatitude: order.storeLatitude,
    storeLongitude: order.storeLongitude,
    customerAddress: order.customerAddress,
    customerLatitude: order.customerLatitude,
    customerLongitude: order.customerLongitude,
    routePolyline: order.routePolyline
  });
  await delivery.save();

  // Registrar comissão de entrega no caixa do app (usar distribuição calculada)
  let motoboyAmount: number | undefined = undefined;
  try {
    const productTotal = (order.products || []).reduce((sum: number, it: any) => sum + (it.price || 0) * (it.quantity || 1), 0);
    console.log(`\n🔍 [createDelivery] INICIANDO REGISTRO DE COMISSÃO:`);
    console.log(`   📦 Produto total: R$ ${productTotal}`);
    console.log(`   🚗 Taxa de entrega: R$ ${fee}`);
    console.log(`   📍 Distância: ${distance || 0}km`);
    console.log(`   🏪 Store ID: ${order.storeId.toString()}`);
    
    const distribution = await calculateOrderDistribution(productTotal, fee, order.storeId.toString(), Number(distance || 0));
    
    console.log(`\n✅ DISTRIBUIÇÃO CALCULADA:`);
    console.log(`   💳 Produto App Commission: R$ ${distribution.product.appCommission}`);
    console.log(`   🚗 Entrega App Commission: R$ ${distribution.delivery?.appCommission}`);
    console.log(`   👤 Motoboy Amount (líquido): R$ ${distribution.delivery?.motoboyAmount}`);

    if (distribution.delivery) {
      motoboyAmount = distribution.delivery.motoboyAmount;
      if (order.paymentMethod === 'cash_on_delivery') {
        await addCommissionToAppCashbox('delivery_commission', distribution.delivery.appCommission, order._id.toString(), delivery._id.toString(), 'Comissão de entrega');
      }
    }
    
    console.log(`✅ COMISSÃO DE ENTREGA REGISTRADA COM SUCESSO!\n`);
  } catch (err) {
    console.error('\n❌ ERRO ao registrar comissão de entrega no caixa do app:', err);
    console.error(`   Pedido: ${order._id}`);
    console.error(`   Entrega: ${delivery._id}\n`);
  }

  // notify motoboys of new delivery (incluir valor líquido para motoboy quando disponível)
  try {
    notifier.notifyMotoboys({ type: 'new_delivery', delivery: { id: delivery._id, orderId: delivery.orderId, fee: delivery.fee, distance: delivery.distance, motoboyAmount: motoboyAmount } });
  } catch (e) {
    // ignore notifier errors
  }
  return res.status(201).json(delivery);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Failed to create delivery' });
  }
};

// assign a motoboy to a delivery (store owner or system)
export const assignDelivery = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params; // delivery id
    const { motoboyId } = req.body;
    const delivery = await Delivery.findById(id);
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });

    const motoboy = await User.findById(motoboyId);
    if (!motoboy) return res.status(404).json({ error: 'Motoboy not found' });
    if (motoboy.role !== 'motoboy') return res.status(400).json({ error: 'User is not a motoboy' });

    // Bloquear atribuição se motoboy tem devolução pendente
    const pendingReturn = await Delivery.findOne({
      motoboyId: motoboyId,
      statusDevolucao: 'aguardando_confirmacao',
    });
    if (pendingReturn) {
      return res.status(400).json({
        error: 'Este motoboy possui uma devolução pendente e não pode aceitar novas entregas até confirmar o retorno na loja.',
        pendingReturnDeliveryId: pendingReturn._id,
      });
    }

    // only store owner can assign motoboy for this delivery
    const order = await Order.findById(delivery.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const store = await Store.findById(order.storeId);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    const userId = req.user?.id;
    if (!userId || store.ownerId.toString() !== userId) {
      return res.status(403).json({ error: 'Forbidden - only store owner can assign motoboy' });
    }

    delivery.motoboyId = motoboyId;
    delivery.status = 'assigned';
    await delivery.save();
    
    // ✅ Broadcast delivery assignment to relevant parties
    emitDeliveryStatusChanged(delivery.toObject());
    
    // 👤 Notificar cliente que motoboy foi atribuído
    emitToRoom(`user:${order.customerId}`, 'motoboy:assigned', {
      orderId: order._id,
      deliveryId: delivery._id,
      motoboyId: motoboy._id,
      motoboyName: motoboy.name,
      status: '🏍️ Motoboy a caminho para a loja',
      message: `${motoboy.name} está a caminho para buscar seu pedido!`,
      timestamp: new Date().toISOString()
    });
    
    // 🏪 Notificar loja que motoboy foi atribuído
    emitToRoom(`store:${order.storeId}`, 'motoboy:assigned_to_order', {
      orderId: order._id,
      deliveryId: delivery._id,
      motoboyId: motoboy._id,
      motoboyName: motoboy.name,
      message: `${motoboy.name} foi atribuído para essa entrega`
    });
    
    // 🏍️ Notificar motoboy que foi atribuído a uma entrega
    emitToRoom(`user:${motoboyId}`, 'delivery:assigned_to_you', {
      deliveryId: delivery._id,
      orderId: order._id,
      fee: delivery.fee,
      distance: delivery.distance,
      message: `Você foi atribuído a uma nova entrega`,
      timestamp: new Date().toISOString()
    });
    
    return res.json(delivery);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Failed to assign delivery' });
  }
};

// motoboy updates status (picked, delivered, cancelled)
export const updateDeliveryStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const allowed = ['picked', 'delivered', 'cancelled'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const delivery = await Delivery.findById(id);
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });

    // only assigned motoboy can update
    const userId = req.user?.id;
    if (!userId || !delivery.motoboyId || delivery.motoboyId.toString() !== userId) {
      return res.status(403).json({ error: 'Forbidden - not assigned motoboy' });
    }

    delivery.status = status;
    await delivery.save();
    
    // Broadcast delivery status change
    emitDeliveryStatusChanged(delivery.toObject());
    
    // if delivered, optionally update order status
    if (status === 'delivered') {
      const order = await Order.findById(delivery.orderId);
      if (order) {
        order.status = 'entregue';
        await order.save();
        emitOrderStatusChanged(order.toObject());
      }
    }

    return res.json(delivery);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Failed to update delivery' });
  }
};

// get delivery details (customer, store owner or assigned motoboy)
export const getDelivery = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    let delivery = await Delivery.findById(id);
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    // Fallback: se pinRetirada ausente, gera e salva
    if (!delivery.pinRetirada) {
      delivery.pinRetirada = Math.floor(100000 + Math.random() * 900000).toString();
      await delivery.save();
    }
    delivery = delivery.toObject();

    // Busca pedido completo
    const order = await Order.findById(delivery.orderId).lean();
    // Busca dados completos da loja e do usuário dono da loja
    let storeObj = null;
    let storeOwner = null;
    if (order && order.storeId) {
      storeObj = await Store.findById(order.storeId).lean();
      if (storeObj && storeObj.ownerId) {
        storeOwner = await User.findById(storeObj.ownerId).lean();
      }
    }
    // Busca dados completos do cliente
    let customerObj = null;
    if (order && order.customerId) {
      customerObj = await User.findById(order.customerId).lean();
      // ✅ NOVO: Computar mainAddress dinamicamente
    }

    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    
    // ✅ NOVO: Obter endereço padrão para fallback
    const defaultAddress = customerObj ? getDefaultAddress(customerObj) : null;

    // Monta objeto de resposta com campos de texto e coordenadas para retirada e entrega
    const response = {
      ...delivery,
      order,
      storeObj: storeObj ? {
        _id: storeObj._id,
        name: storeObj.name,
        address: storeObj.address,
        latitude: storeObj.latitude,
        longitude: storeObj.longitude,
        cnpj: storeObj.cnpj,
        email: storeOwner?.email || '-',
        telefone: storeOwner?.telefone || '-'
      } : null,
      customerObj: customerObj ? {
        _id: customerObj._id,
        name: customerObj.name,
        email: customerObj.email,
        telefone: customerObj.telefone,
        mainAddress: defaultAddress,
        addresses: customerObj.addresses
      } : null,
      // Campos para frontend
      pickupAddress: storeObj ? `${storeObj.name || ''} - ${storeObj.address || ''}` : '-',
      pickupLat: storeObj?.latitude ? parseFloat(storeObj.latitude) : null,
      pickupLng: storeObj?.longitude ? parseFloat(storeObj.longitude) : null,
      // ✅ FIXO: Usar delivery.customerAddress primeiro (snapshot), fallback para defaultAddress
      deliveryAddress: delivery.customerAddress || (defaultAddress ? `${defaultAddress.label || ''} - ${defaultAddress.street}, ${defaultAddress.number}, ${defaultAddress.neighborhood}, ${defaultAddress.city} - ${defaultAddress.state}` : '-'),
      deliveryLat: (delivery.customerLatitude !== undefined && delivery.customerLatitude !== null) ? parseFloat(String(delivery.customerLatitude)) : (defaultAddress?.latitude ? parseFloat(String(defaultAddress.latitude)) : null),
      deliveryLng: (delivery.customerLongitude !== undefined && delivery.customerLongitude !== null) ? parseFloat(String(delivery.customerLongitude)) : (defaultAddress?.longitude ? parseFloat(String(defaultAddress.longitude)) : null)
    };

    // allow assigned motoboy
    if (delivery.motoboyId && delivery.motoboyId.toString() === user.id) return res.json(response);

    // allow customer
    if (order && order.customerId.toString() === user.id) return res.json(response);

    // allow store owner
    if (storeObj && storeObj.ownerId.toString() === user.id) return res.json(response);

    return res.status(403).json({ error: 'Forbidden - cannot access this delivery' });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Failed to get delivery' });
  }
};

// list available deliveries for motoboys (pending and not assigned)
export const listAvailableDeliveries = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // DEBUG LOG
    // eslint-disable-next-line no-console
    console.log('[listAvailableDeliveries] user:', req.user);
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.user.role !== 'motoboy') return res.status(403).json({ error: 'Forbidden: not motoboy' });

    // ✅ GATE KYC Fase 3: motoboy não verificado não vê entregas disponíveis
    if (process.env.KYC_ENFORCED === 'true') {
      const me = await User.findById(req.user.id).select('verification');
      if (!isMotoboyVerified(me)) {
        return res.json({ deliveries: [], pagination: { page: 1, limit: 0, total: 0, pages: 0 }, requiresVerification: true });
      }
    }

    // ✅ SEGURANÇA: Paginação
    const page = Math.max(1, Number((req.query as any).page) || 1);
    const limit = Math.min(100, Number((req.query as any).limit) || 20);
    const skip = (page - 1) * limit;

    const deliveries = await Delivery.find({ 
      status: 'pending', 
      motoboyId: { $exists: false } 
    })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Delivery.countDocuments({
      status: 'pending',
      motoboyId: { $exists: false }
    });

    return res.json({
      deliveries,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[listAvailableDeliveries] error:', err);
    return res.status(500).json({ error: 'Failed to list available deliveries' });
  }
};

// motoboy claims a delivery (first-claim-wins) — atomic update
export const claimDelivery = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    // ✅ GATE KYC Fase 3: motoboy só recebe entrega se estiver verificado
    if (process.env.KYC_ENFORCED === 'true') {
      const motoboyUser = await User.findById(userId).select('verification');
      if (!isMotoboyVerified(motoboyUser)) {
        return res.status(403).json({
          error: 'Conta de motoboy não verificada. Conclua a verificação para aceitar entregas.',
          code: 'COURIER_NOT_VERIFIED',
          missing: missingMotoboyVerifications(motoboyUser),
        });
      }
    }

    // Gerar 2 PINs: um para cliente (entrega final) e outro para loja (retirada)
    const pinEntrega = Math.floor(10000 + Math.random() * 90000).toString();
    const pinRetirada = Math.floor(10000 + Math.random() * 90000).toString();
    
    // atomic findOneAndUpdate: só seta motoboyId, pins se status for pending
    const delivery = await Delivery.findOneAndUpdate(
      { _id: id, status: 'pending', $or: [{ motoboyId: { $exists: false } }, { motoboyId: null }] },
      { $set: { motoboyId: userId, status: 'assigned', pin: pinEntrega, pinRetirada } },
      { new: true }
    );

    if (!delivery) return res.status(409).json({ error: 'Already claimed or not available' });

    // Buscar order para notificações
    const order = await Order.findById(delivery.orderId);
    if (!order) {
      console.error(`❌ [claimDelivery] Order not found: ${delivery.orderId}`);
      return res.status(404).json({ error: 'Order not found' });
    }

    // Buscar motoboy para nome
    const motoboy = await User.findById(userId);
    const motoboyName = motoboy?.name || 'Motoboy';

    // 🔴 BROADCAST 1: Notificar CLIENTE que motoboy aceitou + enviar PIN
    emitToRoom(`user:${order.customerId}`, 'motoboy:assigned', {
      orderId: order._id.toString(),
      deliveryId: delivery._id.toString(),
      motoboyId: userId.toString(),
      motoboyName: motoboyName,
      status: '🏍️ Motoboy a caminho para a loja',
      message: `${motoboyName} está a caminho para buscar seu pedido!`,
      pin: pinEntrega, // 🔑 PIN PARA O CLIENTE (entrega final)
      timestamp: new Date().toISOString()
    });
    console.log(`📡 [claimDelivery] Event 'motoboy:assigned' sent to client ${order.customerId} with PIN: ${pinEntrega}`);

    // 🔴 BROADCAST 2: Notificar LOJA que motoboy foi atribuído
    const store = await Store.findById(order.storeId);
    if (store) {
      // Emit to the room keyed by the store document ID (order.storeId)
      emitToRoom(`store:${order.storeId}`, 'motoboy:assigned_to_order', {
        orderId: order._id.toString(),
        deliveryId: delivery._id.toString(),
        motoboyId: userId.toString(),
        motoboyName: motoboyName,
        message: `${motoboyName} foi atribuído para essa entrega`
      });
      console.log(`📡 [claimDelivery] Event 'motoboy:assigned_to_order' sent to store ${order.storeId}`);
    }

    // 🔴 BROADCAST 3: Notificar MOTOBOY que foi atribuído
    emitToRoom(`user:${userId}`, 'delivery:assigned_to_you', {
      deliveryId: delivery._id.toString(),
      orderId: order._id.toString(),
      fee: delivery.fee,
      distance: delivery.distance,
      pinRetirada: delivery.pinRetirada, // 🔑 PIN para validação com loja
      message: `Você foi atribuído a uma nova entrega`,
      timestamp: new Date().toISOString()
    });
    console.log(`📡 [claimDelivery] Event 'delivery:assigned_to_you' sent to motoboy ${userId}`);

    // 🔴 BROADCAST 4: Status geral da delivery
    emitDeliveryStatusChanged(delivery.toObject());
    console.log(`📡 [claimDelivery] Event 'delivery:status_changed' broadcast`);

    // Notifica a loja em tempo real para atualizar a lista de pedidos
    try {
      if (notifier.io) {
        console.log('[SOCKET][BACKEND] Emitindo order_update para', `store:${order.storeId}`, 'orderId:', order._id);
        notifier.io.to(`store:${order.storeId}`).emit('order_update', {
          orderId: String(order._id),
          type: 'motoboy_assigned',
          deliveryId: String(delivery._id),
          status: 'assigned'
        });
      }
    } catch (e) {
      console.warn(`⚠️ [claimDelivery] Failed to notify store:`, e);
    }

    // Retornar delivery com pinRetirada para a loja confirmar
    const deliveryObj = delivery.toObject();
    return res.json({
      ...deliveryObj,
      pin: deliveryObj.pin,  // PIN para entrega final (cliente)
      pinRetirada: deliveryObj.pinRetirada  // PIN de retirada (loja)
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Failed to claim delivery' });
  }
};

// ========== FLUXO DE DEVOLUÇÃO COM PIN ==========

/**
 * ✅ FIX #6: Motoboy solicita devolução e sistema gera PIN
 * Neste ponto, delivery está 'picked' e motoboy quer cancelar
 * Sistema gera um PIN de 6 dígitos que loja deve confirmar
 */
export const requestReturn = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: deliveryId } = req.params as any;
    const motoboyId = req.user?.id;

    if (!motoboyId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    // Validar que é o motoboy da entrega
    const delivery = await Delivery.findById(deliveryId);
    if (!delivery) {
      return res.status(404).json({ error: 'Entrega não encontrada' });
    }

    if (delivery.motoboyId?.toString() !== motoboyId) {
      return res.status(403).json({ error: 'Apenas o motoboy designado pode solicitar devolução' });
    }

    // Só pode solicitar devolução em status 'picked'
    if (delivery.status !== 'picked') {
      return res.status(400).json({
        error: `Devolução só pode ser solicitada em status 'picked'`,
        currentStatus: delivery.status
      });
    }

    // Gerar PIN aleatório de 6 dígitos
    const pinDevolucao = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Atualizar delivery com PIN e status
    delivery.pinDevolucao = pinDevolucao;
    delivery.statusDevolucao = 'aguardando_confirmacao';
    await delivery.save();

    // Notificar loja que motoboy quer devolver
    const order = await Order.findById(delivery.orderId);
    if (order) {
      emitToRoom(
        `store:${order.storeId}`,
        'delivery:return_requested',
        {
          deliveryId: delivery._id,
          orderId: order._id,
          motoboyId: delivery.motoboyId,
          message: 'Motoboy solicitou devolução do produto',
          pinRequired: true,
          returnedAt: new Date()
        }
      );
      console.log(`📡 [requestReturn] Loja ${order.storeId} notificada sobre devolução`);
    }

    // Notificar motoboy que PIN foi gerado (não enviar o PIN para o cliente!)
    emitToRoom(
      `motoboy:${motoboyId}`,
      'delivery:return_initiated',
      {
        deliveryId: delivery._id,
        message: 'Devolução iniciada. Aguarde confirmação da loja.',
        status: 'aguardando_confirmacao'
      }
    );

    return res.json({
      message: 'Devolução solicitada. Aguarde confirmação da loja.',
      deliveryId,
      statusDevolucao: 'aguardando_confirmacao'
    });
  } catch (err) {
    console.error('[requestReturn] Erro:', err);
    return res.status(500).json({ error: 'Erro ao solicitar devolução' });
  }
};

/**
 * ✅ FIX #6: Loja confirma devolução inserindo o PIN
 * Apenas após confirmação com PIN correto, refund é processado
 */
export const confirmReturn = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: deliveryId } = req.params as any;
    const { pinDevolucao } = req.body;
    const userId = req.user?.id;

    if (!userId || !pinDevolucao) {
      return res.status(400).json({ error: 'Parâmetros inválidos' });
    }

    // Validar que é a loja
    const delivery = await Delivery.findById(deliveryId);
    if (!delivery) {
      return res.status(404).json({ error: 'Entrega não encontrada' });
    }

    const order = await Order.findById(delivery.orderId);
    if (!order) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    const store = await Store.findById(order.storeId);
    console.log(`📋 [confirmReturn] userId: ${userId}, store.ownerId: ${store?.ownerId}`);
    if (!store || store.ownerId.toString() !== userId) {
      console.error(`📋 [confirmReturn] ❌ AUTH FAIL - userId: ${userId}, storeOwnerId: ${store?.ownerId?.toString()}`);
      return res.status(403).json({ error: 'Apenas o proprietário da loja pode confirmar devolução' });
    }

    // Validar status
    if (delivery.statusDevolucao !== 'aguardando_confirmacao') {
      return res.status(400).json({
        error: 'Devolução não está aguardando confirmação',
        currentStatus: delivery.statusDevolucao
      });
    }

    // Validar PIN
    if (pinDevolucao !== delivery.pinDevolucao) {
      return res.status(400).json({ error: 'PIN de devolução inválido' });
    }

    // Confirmar devolução — limpar PIN e registrar data
    const returnAction = delivery.pendingReturnAction;
    delivery.statusDevolucao = 'confirmado';
    delivery.dataConfirmacaoDevolucao = new Date();
    delivery.pinDevolucao = undefined;
    delivery.pendingReturnAction = undefined;

    if (returnAction === 'reassign') {
      // ── REASSIGN: produto voltou à loja, entrega volta ao pool ──
      const motoboyIdNotify = delivery.motoboyId;
      delivery.status = 'pending';
      delivery.motoboyId = undefined;
      await delivery.save();
      console.log(`✅ [confirmReturn] Delivery ${delivery._id} voltou ao pool para reatribuição`);

      // Notificar motoboy: pode fechar a modal
      emitToRoom(`user:${motoboyIdNotify}`, 'delivery:return_confirmed', {
        deliveryId: delivery._id,
        message: 'Devolução confirmada! A entrega voltou ao pool para um novo entregador.',
        statusDevolucao: 'confirmado',
        reassigned: true,
      });

      // Notificar cliente: procurando novo entregador
      emitToRoom(`user:${order.customerId}`, 'order:reassigning', {
        orderId: order._id,
        deliveryId: delivery._id,
        message: 'Produto devolvido à loja. Estamos procurando um novo entregador para você.',
      });

      // Broadcast: delivery disponível no pool para outros motobikes
      emitDeliveryStatusChanged(delivery.toObject());

      return res.json({
        message: 'Devolução confirmada. Entrega voltou ao pool.',
        deliveryId,
        orderId: order._id,
        statusDevolucao: 'confirmado',
        action: 'reassign',
        dataConfirmacao: delivery.dataConfirmacaoDevolucao,
      });

    } else {
      // ── CANCEL (padrão): produto voltou à loja, pedido cancelado + reembolso ──
      delivery.status = 'cancelled';
      delivery.cancelledAt = new Date();
      await delivery.save();
      console.log(`📋 [confirmReturn] Cancelando Order para o cliente...`);
      order.status = 'cancelado';
      order.cancelledAt = new Date();
      await order.save();
      console.log(`✅ [confirmReturn] Order cancelado: ${order._id}`);

      // Novo fluxo: cancelar payouts + reembolsar cliente + debitar AppCashbox
      try {
        const refundSession = await mongoose.startSession();
        try {
          await refundSession.withTransaction(async () => {
            await payoutService.cancelPayoutsForOrder(order._id.toString(), 'product_returned', refundSession);

            const refundAmount = order.totalValue || 0;
            if (refundAmount > 0) {
              const clientWallet = await Wallet.findOne({ owner: order.customerId.toString(), ownerType: 'user' }).session(refundSession);
              if (clientWallet) {
                clientWallet.balance += refundAmount;
                clientWallet.totalIncome += refundAmount;
                clientWallet.history.push({
                  date: new Date(),
                  type: 'credit',
                  category: 'refund',
                  amount: refundAmount,
                  reason: 'Reembolso - Produto devolvido a loja pelo motoboy',
                  relatedId: order._id.toString(),
                });
                await clientWallet.save({ session: refundSession });
              }

              const appCashbox = await AppCashbox.findOne().session(refundSession);
              if (appCashbox) {
                appCashbox.balance -= refundAmount;
                appCashbox.totalExpenses += refundAmount;
                appCashbox.history.push({
                  type: 'expense',
                  source: 'order_refund',
                  amount: refundAmount,
                  orderId: order._id.toString(),
                  reason: 'Reembolso - Produto devolvido a loja',
                  date: new Date(),
                });
                await appCashbox.save({ session: refundSession });
              }
            }
          });
        } finally {
          refundSession.endSession();
        }
        console.log(`✅ [confirmReturn] Reembolso processado para cliente ${order.customerId}`);
      } catch (refundErr) {
        console.error('[confirmReturn] Erro ao processar reembolso:', refundErr);
      }

      emitToRoom(`user:${delivery.motoboyId}`, 'delivery:return_confirmed', {
        deliveryId: delivery._id,
        message: 'Devolução confirmada pela loja. Pedido cancelado.',
        statusDevolucao: 'confirmado',
      });

      emitToRoom(`user:${order.customerId}`, 'order:cancelled', {
        orderId: order._id,
        deliveryId: delivery._id,
        reason: 'Produto devolvido à loja',
        message: 'Seu pedido foi cancelado e o reembolso foi processado.',
        refundStatus: 'processed',
        cancelledAt: order.cancelledAt,
      });

      emitToRoom(`store:${order.storeId}`, 'order:cancelled', {
        orderId: order._id,
        deliveryId: delivery._id,
        reason: 'Produto devolvido à loja pelo motoboy',
        cancelledAt: order.cancelledAt,
      });

      emitToRoom(`user:${order.customerId}`, 'delivery:return_confirmed', {
        deliveryId: delivery._id,
        orderId: order._id,
        message: 'Produto foi devolvido à loja. Seu reembolso será processado em breve.',
        confirmedAt: new Date(),
      });

      return res.json({
        message: 'Devolução confirmada com sucesso. Pedido cancelado para cliente.',
        deliveryId,
        orderId: order._id,
        statusDevolucao: 'confirmado',
        action: 'cancel',
        orderStatus: 'cancelado',
        dataConfirmacao: delivery.dataConfirmacaoDevolucao,
      });
    }
  } catch (err) {
    console.error('[confirmReturn] Erro:', err);
    return res.status(500).json({ error: 'Erro ao confirmar devolução' });
  }
};

