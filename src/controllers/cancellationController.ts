import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../types';
import Cancellation, { ICancellation } from '../models/Cancellation';
import Order from '../models/Order';
import Delivery from '../models/Delivery';
import User from '../models/User';
import Store from '../models/Store';
import Product from '../models/Product';
import Wallet from '../models/Wallet';
import AppCashbox from '../models/AppCashbox';
import PlatformConfig from '../models/PlatformConfig';
import notifier from '../services/notifier';
import { calculateDeliveryFeeWithConfig, calculateOrderDistribution, calculateLateCancellationFee } from '../utils/walletCalculations';
import {
  emitOrderCancelled,
  emitDeliveryRejected,
  emitOrderRejectedByStore,
  emitOrderAcceptedByStore,
  emitDeliveryCancelled,
  emitDeliveryCreated,
  emitToRoom,
  emitWalletRefund,
} from '../utils/socketEmitter';
import { addCommissionToAppCashbox } from './appCashboxController';
import walletService from '../services/wallet.service';
import payoutService from '../services/payout.service';
import logger from '../config/logger';
import StoreSubscription from '../models/StoreSubscription';
import { emitOrderStatusChanged } from '../utils/socketEmitter';
import CustomerDebt from '../models/CustomerDebt';
import env from '../config/env';
import { refundOrderCharge } from '../services/asaas/refund';

// Validações de permissão
const validateOrderOwnership = async (orderId: string, userId: string) => {
  const order = await Order.findById(orderId);
  if (!order) throw new Error('Pedido não encontrado');
  if (order.customerId.toString() !== userId) throw new Error('Permissão negada');
  return order;
};

const validateStoreOwnership = async (storeId: string, userId: string) => {
  const store = await Store.findById(storeId);
  if (!store) throw new Error('Loja não encontrada');
  if (store.ownerId.toString() !== userId) throw new Error('Permissão negada');
  return store;
};

const validateMotoboyDelivery = async (deliveryId: string, motoboyId: string) => {
  const delivery = await Delivery.findById(deliveryId);
  if (!delivery) throw new Error('Entrega não encontrada');
  if (delivery.motoboyId?.toString() !== motoboyId) throw new Error('Permissão negada');
  return delivery;
};

// ========== CANCELAMENTOS INICIADOS POR CLIENTE ==========

/**
 * Cliente cancela pedido
 * Transição: 'pago' ou 'enviado' → 'cancelado'
 * Refund: Processado automaticamente
 */
export const cancelOrderByCustomer = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: orderId } = req.params as any;
    const { reason, reasonCode } = req.body;
    const customerId = req.user?.id;

    if (!customerId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    // Validações
    const order = await validateOrderOwnership(orderId, customerId);

    // Apenas pedidos em estados 'criado', 'pago' ou 'enviado' podem ser cancelados
    const cancellableStatuses = ['criado', 'pago', 'enviado'];
    if (!cancellableStatuses.includes(order.status)) {
      return res.status(400).json({
        error: `Pedido não pode ser cancelado no estado: ${order.status}`,
        currentStatus: order.status,
      });
    }

    if (order.status === 'entregue') {
      return res.status(400).json({ error: 'Pedido já foi entregue. Devolução deve ser solicitada.' });
    }

    const isLate = order.status === 'enviado';
    const isCashOnDelivery = order.paymentMethod === 'cash_on_delivery';
    const useAsaas = env.PAYMENT_GATEWAY === 'asaas';
    const refundAmount = order.totalValue || 0;
    let refundStatus: 'pending' | 'processed' | 'failed' = 'pending';

    // ✅ IDEMPOTÊNCIA/ATÔMICO: "reivindica" o cancelamento de forma atômica.
    // Só UM request consegue mudar de um status cancelável → 'cancelado'.
    // Bloqueia duplo-reembolso por requisições concorrentes.
    const claimed = await Order.findOneAndUpdate(
      { _id: orderId, status: { $in: cancellableStatuses } },
      { $set: { status: 'cancelado', cancelledAt: new Date() } },
      { new: true }
    );
    if (!claimed) {
      return res.status(409).json({ error: 'Pedido já foi cancelado ou está em processamento' });
    }

    // ✅ Devolver estoque (createOrder decrementa sempre, COD ou não).
    // Roda uma única vez graças à trava atômica acima.
    for (const it of (order.products || [])) {
      if ((it as any).productId && (it as any).quantity) {
        await Product.findByIdAndUpdate((it as any).productId, { $inc: { quantity: (it as any).quantity } });
      }
    }

    // --- NOVO FLUXO: Cancelar payouts + reembolsar cliente + debitar AppCashbox ---
    if (!isCashOnDelivery) {
      const refundSession = await mongoose.startSession();
      try {
        await refundSession.withTransaction(async () => {
          // Cancelar todos os payouts do pedido
          const result = await payoutService.cancelPayoutsForOrder(orderId, 'order_cancelled', refundSession);
          if (result.errors.length > 0) {
            // #3: há payout já requested/paid — o dinheiro pode já ter saído pra loja/motoboy.
            // NÃO reembolsar o cliente automaticamente (risco de gasto duplo). Aborta a
            // transação e escala pro admin resolver manualmente.
            throw Object.assign(new Error('PAYOUT_ALREADY_SETTLED'), {
              needsManualReview: true,
              payoutErrors: result.errors,
            });
          }

          // Fluxo legado (carteira virtual): credita cliente + debita AppCashbox.
          // Em modo Asaas, o estorno é REAL (fora da transação, abaixo) — não mexe aqui.
          if (!useAsaas) {
            const clientWallet = await Wallet.findOne({ owner: customerId, ownerType: 'user' }).session(refundSession);
            if (clientWallet) {
              clientWallet.balance += refundAmount;
              clientWallet.totalIncome += refundAmount;
              clientWallet.history.push({
                date: new Date(),
                type: 'credit',
                category: 'refund',
                amount: refundAmount,
                reason: 'Reembolso - Pedido cancelado pelo cliente',
                relatedId: orderId,
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
                orderId,
                reason: 'Reembolso - Pedido cancelado pelo cliente',
                date: new Date(),
              });
              await appCashbox.save({ session: refundSession });
            }
          }
        });

        if (useAsaas) {
          // Devolve o saldo da carteira que foi usado no pedido (se houve).
          if (order.walletApplied && order.walletApplied > 0) {
            await Wallet.updateOne({ owner: customerId, ownerType: 'user' }, { $inc: { balance: order.walletApplied, totalIncome: order.walletApplied } });
          }
          // Estorno REAL no Asaas (devolve pro PIX/cartão do cliente). Só se a parte PIX foi paga.
          if (order.paymentStatus === 'paid' && order.asaasPaymentId) {
            try {
              await refundOrderCharge(order.asaasPaymentId);
              order.asaasChargeStatus = 'refunded';
              order.paymentStatus = 'refunded';
              await order.save();
              refundStatus = 'processed';
            } catch (refundErr) {
              logger.error('Falha no estorno Asaas — escala pro admin', refundErr as Error, { orderId });
              refundStatus = 'pending';
            }
          } else {
            // Não pago via PIX (não pago ainda, ou 100% saldo já devolvido acima).
            refundStatus = 'processed';
          }
        } else {
          refundStatus = 'processed';
          emitWalletRefund(customerId, 'user', refundAmount, `Reembolso do pedido ${orderId}`);
        }
      } catch (walletError: any) {
        if (walletError?.needsManualReview) {
          logger.warn('Reembolso retido para revisão manual — payout já liquidado', { orderId, payoutErrors: walletError.payoutErrors });
          refundStatus = 'pending';
        } else {
          logger.error('Erro ao reverter pagamento no cancelamento pelo cliente', walletError as Error, { orderId });
          refundStatus = 'failed';
        }
      } finally {
        refundSession.endSession();
      }
    }

    // Taxa de cancelamento tardio (quando pedido já foi enviado)
    let lateCancellationFee = 0;
    if (isLate) {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const config = await PlatformConfig.findOne().session(session);
        const feeConfig = {
          lateCancellationFeePercent: config?.lateCancellationFeePercent ?? 10,
          lateCancellationMotoboyShare: config?.lateCancellationMotoboyShare ?? 50,
        };
        const { totalFee, motoboyShare, appShare } = calculateLateCancellationFee(
          order.totalValue || 0, feeConfig, 'customer'
        );
        lateCancellationFee = totalFee;

        if (isCashOnDelivery) {
          // Fee sai do blockedBalance da loja (cliente não pagou nada)
          const storeWallet = await Wallet.findOne({ owner: order.storeId.toString(), ownerType: 'store' }).session(session);
          if (storeWallet) {
            storeWallet.blockedBalance = Math.max(0, (storeWallet.blockedBalance || 0) - totalFee);
            storeWallet.totalSpent += totalFee;
            storeWallet.history.push({
              date: new Date(),
              type: 'debit',
              category: 'penalty',
              amount: totalFee,
              reason: 'Garantia executada - cancelamento tardio pelo cliente (COD)',
              reference: `LATE_CANCEL_COD_${orderId}`,
            });
            await storeWallet.save({ session });
          }

          // Criar dívida no cliente
          await new CustomerDebt({
            customerId,
            amount: totalFee,
            sourceOrderId: order._id,
            status: 'pending',
            reason: 'Multa de cancelamento tardio em pedido pagar na entrega',
          }).save({ session });
        } else {
          // Fluxo normal: debitar da wallet do cliente
          const customerWallet = await Wallet.findOne({ owner: customerId, ownerType: 'user' }).session(session);
          if (customerWallet) {
            customerWallet.balance -= totalFee;
            customerWallet.totalSpent += totalFee;
            customerWallet.history.push({
              type: 'debit',
              category: 'penalty',
              amount: totalFee,
              reason: 'Taxa de cancelamento tardio',
              date: new Date(),
              reference: `LATE_CANCEL_${orderId}`,
            });
            await customerWallet.save({ session });
          }
        }

        // Creditar motoboy share como Payout released (#1). Crédito cru em
        // motoboyWallet.balance é sobrescrito pela reconciliação em getMotoboyWallet
        // e não é sacável (o saque consome só Payouts). Um Payout released é reconciliável.
        if (motoboyShare > 0 && order.deliveryId) {
          const delivery = await Delivery.findById(order.deliveryId).session(session);
          if (delivery?.motoboyId) {
            const compPayout = await payoutService.createPendingPayout({
              recipientType: 'motoboy',
              recipientId: String(delivery.motoboyId),
              orderId: String(order._id),
              deliveryId: String(delivery._id),
              amount: motoboyShare,
              session,
            });
            await payoutService.releasePayout(String(compPayout._id), session);
          }
        }

        // Creditar a multa INTEIRA no AppCashbox (#1). O motoboyShare é pago depois como
        // Payout (debita o cashbox no saque), restando appShare de lucro líquido. Creditar
        // só appShare deixaria o Payout do motoboy sem lastro no cofre.
        if (totalFee > 0) {
          const appCashbox = await AppCashbox.findOne().session(session);
          if (appCashbox) {
            appCashbox.balance += totalFee;
            appCashbox.totalIncome += totalFee;
            appCashbox.history.push({
              type: 'income',
              source: 'cancelled_order',
              amount: totalFee,
              reason: `Taxa cancelamento tardio (inclui compensação do motoboy a repassar) - Pedido ${orderId}`,
              date: new Date(),
              orderId: orderId,
            });
            await appCashbox.save({ session });
          }
        }

        await session.commitTransaction();
        session.endSession();
      } catch (feeErr) {
        await session.abortTransaction();
        session.endSession();
        logger.error('Erro ao cobrar taxa de cancelamento tardio', feeErr as Error, { orderId });
      }
    }

    // Cria documento de cancelamento
    const cancellation = await Cancellation.create({
      orderId: order._id,
      deliveryId: order.deliveryId || undefined,
      cancelledBy: 'customer',
      reason: reason || 'Solicitado pelo cliente',
      reasonCode: isLate ? 'late_cancellation' : (reasonCode || 'customer_request'),
      refundAmount,
      refundStatus,
      isLateCancellation: isLate,
      lateCancellationFee: isLate ? lateCancellationFee : undefined,
    });

    // Atualiza status do pedido
    order.status = 'cancelado';
    order.cancelledAt = new Date();
    order.cancellationId = cancellation._id;
    await order.save();

    // Para COD antes do pickup: liberar reserva da loja se existir
    if (isCashOnDelivery && !isLate) {
      const config = await PlatformConfig.findOne();
      const feePercent = config?.lateCancellationFeePercent ?? 10;
      const blockAmount = (order.totalValue || 0) * feePercent / 100;
      const storeWalletCOD = await Wallet.findOne({ owner: order.storeId.toString(), ownerType: 'store' });
      if (storeWalletCOD && storeWalletCOD.blockedBalance > 0) {
        const release = Math.min(blockAmount, storeWalletCOD.blockedBalance);
        storeWalletCOD.blockedBalance -= release;
        storeWalletCOD.balance += release;
        storeWalletCOD.history.push({
          date: new Date(),
          type: 'credit',
          category: 'transfer',
          amount: release,
          reason: `Liberação de reserva COD - pedido cancelado antes do pickup ${orderId}`,
          reference: `COD_UNBLOCK_${orderId}`,
        });
        await storeWalletCOD.save();
      }
    }

    // Se há entrega associada, cancela também
    if (order.deliveryId) {
      const delivery = await Delivery.findById(order.deliveryId);
      if (delivery && delivery.status !== 'delivered') {
        delivery.status = 'cancelled';
        delivery.cancelledAt = new Date();
        await delivery.save();
        emitDeliveryCancelled(delivery.toObject(), cancellation.toObject());
      }
    }

    // Emite evento de cancelamento
    emitOrderCancelled(order.toObject(), cancellation.toObject());

    return res.json({
      success: true,
      orderId: order._id,
      status: 'cancelado',
      refundAmount,
      refundStatus,
      cancellationId: cancellation._id,
      isLateCancellation: isLate,
      lateCancellationFee: isLate ? lateCancellationFee : undefined,
    });
  } catch (error: any) {
    logger.error('Erro ao cancelar pedido', error as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// ========== REJEIÇÕES INICIADAS POR MOTOBOY ==========

/**
 * Motoboy rejeita entrega
 * Valida que motoboy é o responsável
 * Devolve a entrega ao pool para reatribuição (único comportamento permitido)
 */
export const rejectDeliveryByMotoboy = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: deliveryId } = req.params as any;
    const { reason, reasonCode } = req.body;
    const motoboyId = req.user?.id;

    if (!motoboyId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const delivery = await validateMotoboyDelivery(deliveryId, motoboyId);

    // Apenas deliveries atribuídas ou em pickup podem ser rejeitadas
    const rejectable = ['assigned', 'picked'];
    if (!rejectable.includes(delivery.status)) {
      return res.status(400).json({
        error: `Entrega não pode ser rejeitada no estado: ${delivery.status}`,
      });
    }

    // Cria documento de cancelamento
    const cancellation = await Cancellation.create({
      deliveryId: delivery._id,
      orderId: delivery.orderId,
      cancelledBy: 'motoboy',
      reason: reason || 'Rejeitado por motoboy',
      reasonCode: reasonCode || 'motoboy_rejected',
    });

    // Se produto já foi retirado (picked), precisa devolver à loja com PIN antes de reassignar
    if (delivery.status === 'picked') {
      if (!delivery.pinDevolucao) {
        const pinDevolucao = Math.floor(100000 + Math.random() * 900000).toString();
        delivery.pinDevolucao = pinDevolucao;
        delivery.statusDevolucao = 'aguardando_confirmacao';
        delivery.pendingReturnAction = 'reassign';
        await delivery.save();

        const orderForReturn = await Order.findById(delivery.orderId);
        if (orderForReturn) {
          emitToRoom(`store:${orderForReturn.storeId}`, 'delivery:return_requested', {
            deliveryId: delivery._id,
            orderId: orderForReturn._id,
            motoboyId: delivery.motoboyId,
            message: 'Motoboy precisa devolver o produto à loja antes da reatribuição',
            pinRequired: true,
            returnedAt: new Date(),
          });
          emitToRoom(`user:${orderForReturn.customerId}`, 'order:return_initiated', {
            orderId: orderForReturn._id,
            message: 'O motoboy está retornando seu produto à loja. Em breve um novo entregador será atribuído.',
          });
        }

        return res.status(202).json({
          success: true,
          statusDevolucao: 'aguardando_confirmacao',
          message: 'Produto precisa ser devolvido à loja antes da reatribuição. PIN gerado.',
          pinDevolucao,
          isPending: true,
        });
      }

      // PIN já gerado mas loja ainda não confirmou
      if (delivery.statusDevolucao !== 'confirmado') {
        const orderForReturn = await Order.findById(delivery.orderId);
        if (orderForReturn) {
          emitToRoom(`store:${orderForReturn.storeId}`, 'delivery:return_requested', {
            deliveryId: delivery._id,
            orderId: orderForReturn._id,
            motoboyId: delivery.motoboyId,
            message: 'Motoboy precisa devolver o produto à loja antes da reatribuição',
            pinRequired: true,
            returnedAt: new Date(),
            pinDevolucao: delivery.pinDevolucao,
          });
        }
        return res.status(202).json({
          success: true,
          currentStatus: delivery.statusDevolucao,
          message: 'Aguardando confirmação da loja com o PIN.',
          pinDevolucao: delivery.pinDevolucao,
          isPending: true,
        });
      }
    }

    // status === 'assigned' OU devolução já confirmada pela loja: reassign imediato
    delivery.status = 'pending';
    delivery.motoboyId = undefined;
    delivery.pendingReturnAction = undefined;
    delivery.updatedAt = new Date();
    await delivery.save();

    emitDeliveryRejected(delivery.toObject(), 'motoboy', reason);
    return res.json({
      success: true,
      deliveryId: delivery._id,
      status: 'pending',
      reason,
    });
  } catch (error: any) {
    logger.error('Erro ao rejeitar entrega', error as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// ========== ACEITAÇÃO/REJEIÇÃO POR LOJA ==========

/**
 * Loja aceita pedido
 * Transição: 'criado' → 'pago' (pronto para preparação)
 */
export const acceptOrderByStore = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: orderId } = req.params as any;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    // Validar que a loja pertence ao usuário
    const store = await Store.findOne({ _id: order.storeId, ownerId: userId });
    if (!store) {
      return res.status(403).json({ error: 'Permissão negada' });
    }

    // Apenas pedidos 'criado' ou 'pago' podem ser aceitos
    if (!['criado', 'pago'].includes(order.status)) {
      return res.status(400).json({
        error: `Pedido não pode ser aceito no estado: ${order.status}`,
      });
    }

    // Atualiza status para pago se ainda não foi
    if (order.status !== 'pago') {
      order.status = 'pago';
    }
    order.acceptedAt = new Date();

    // Se pedido COD: bloquear fee potencial na wallet da loja (atomicamente com order.save)
    if (order.paymentMethod === 'cash_on_delivery') {
      const codSession = await mongoose.startSession();
      codSession.startTransaction();
      try {
        const config = await PlatformConfig.findOne().session(codSession);
        const feePercent = config?.lateCancellationFeePercent ?? 10;
        const requiredBlock = (order.totalValue || 0) * feePercent / 100;

        const storeWalletCOD = await Wallet.findOne({ owner: order.storeId.toString(), ownerType: 'store' }).session(codSession);
        if (!storeWalletCOD || storeWalletCOD.balance < requiredBlock) {
          await codSession.abortTransaction();
          codSession.endSession();
          return res.status(400).json({
            error: 'Saldo insuficiente para garantir pedido de pagamento na entrega',
            required: requiredBlock,
            available: storeWalletCOD?.balance ?? 0,
          });
        }

        storeWalletCOD.balance -= requiredBlock;
        storeWalletCOD.blockedBalance = (storeWalletCOD.blockedBalance || 0) + requiredBlock;
        storeWalletCOD.history.push({
          date: new Date(),
          type: 'debit',
          category: 'transfer',
          amount: requiredBlock,
          reason: `Reserva de garantia - pedido COD ${order._id}`,
          reference: `COD_BLOCK_${order._id}`,
        });
        await storeWalletCOD.save({ session: codSession });
        await order.save({ session: codSession });
        await codSession.commitTransaction();
        codSession.endSession();
      } catch (codErr) {
        await codSession.abortTransaction();
        codSession.endSession();
        logger.error('Erro ao bloquear saldo para pedido COD', codErr as Error, { orderId: order._id });
        return res.status(500).json({ error: 'Erro ao processar garantia do pedido COD' });
      }
    } else {
      await order.save();
    }

    // Emite evento
    emitOrderAcceptedByStore(order.toObject());

    // [Plan1] Verificar plano da loja antes de criar Delivery
    const storeSub = await StoreSubscription.findOne({ storeId: store._id.toString() }).lean();
    const planMap: Record<string, number> = { plan1: 1, plan2: 2, plan3: 3 };
    const storePlan = storeSub ? (planMap[(storeSub as any).currentPlan] ?? 1) : (store.plan ?? 1);

    if (storePlan === 1) {
      // Plano 1: sem motoboy — emitir e retornar sem criar Delivery
      emitOrderStatusChanged(order);
      emitToRoom(`user:${order.customerId}`, 'order:accepted_by_store', {
        orderId: order._id.toString(),
        status: 'pago',
        requiresDelivery: false,
        message: 'Pedido aceito! A loja está preparando sua entrega.',
      });
      emitToRoom(`store:${order.storeId}`, 'order:accepted_confirmation', {
        orderId: order._id.toString(),
        status: 'pago',
        requiresDelivery: false,
      });
      return res.json({
        success: true,
        orderId: order._id,
        status: 'pago',
        acceptedAt: order.acceptedAt,
        requiresDelivery: false,
      });
    }

    // Plano 2/3: cria delivery se não existir
    let delivery = await Delivery.findOne({ orderId: order._id });
    if (!delivery) {
      // ✅ CORRIGIDO: Usar deliveryDistance armazenada no Order + fallback para req.body.distance
      const distance = req.body?.distance || order.deliveryDistance || 0;
      const fee = await calculateDeliveryFeeWithConfig(Number(distance || 0));
      
      delivery = new Delivery({ 
        orderId: order._id, 
        distance: Number(distance || 0), 
        fee, 
        status: 'pending',
        // ✅ NOVO: COPIAR dados de endereço do ORDER (é a fonte de verdade!)
        customerAddress: order.customerAddress,
        customerLatitude: order.customerLatitude,
        customerLongitude: order.customerLongitude,
        storeAddress: order.storeAddress,
        storeLatitude: order.storeLatitude,
        storeLongitude: order.storeLongitude
      });
      await delivery.save();

      // 🔴 REGISTRAR COMISSÃO DE ENTREGA NO APPCASHBOX
      try {
        const productTotal = (order.products || []).reduce((sum: number, it: any) => sum + (it.price || 0) * (it.quantity || 1), 0);
        console.log(`\n🔍 [rejectOrder] REGISTRANDO COMISSÃO DE ENTREGA:`);
        console.log(`   📦 Produto total: R$ ${productTotal}`);
        console.log(`   🚗 Taxa de entrega: R$ ${fee}`);
        console.log(`   📍 Distância: ${distance}km`);
        console.log(`   🏪 Store ID: ${order.storeId.toString()}`);
        
        const distribution = await calculateOrderDistribution(productTotal, fee, order.storeId.toString(), Number(distance || 0));
        
        console.log(`\n✅ DISTRIBUIÇÃO CALCULADA:`);
        console.log(`   💳 Produto App Commission: R$ ${distribution.product.appCommission}`);
        console.log(`   🚗 Entrega App Commission: R$ ${distribution.delivery?.appCommission}`);
        console.log(`   👤 Motoboy Amount (líquido): R$ ${distribution.delivery?.motoboyAmount}`);

        if (order.paymentMethod === 'cash_on_delivery' && distribution.delivery) {
          await addCommissionToAppCashbox('delivery_commission', distribution.delivery.appCommission, order._id.toString(), delivery._id.toString(), 'Comissão de entrega');
        }

        console.log(`✅ COMISSÃO REGISTRADA COM SUCESSO!\n`);
      } catch (err) {
        console.error('\n❌ ERRO ao registrar comissão de entrega no caixa do app:', err);
        console.error(`   Pedido: ${order._id}`);
        console.error(`   Entrega: ${delivery._id}\n`);
      }

      // Emit socket event for delivery creation
      emitDeliveryCreated(delivery);
      
      // notify motoboys of new delivery
      try {
        notifier.notifyMotoboys({ type: 'new_delivery', delivery: { id: delivery._id, orderId: delivery.orderId, fee: delivery.fee, distance: delivery.distance } });
      } catch (e) {
        // ignore
      }

      // Salva deliveryId no pedido
      order.deliveryId = delivery._id;
      await order.save();
    }

    return res.json({
      success: true,
      orderId: order._id,
      status: 'pago',
      acceptedAt: order.acceptedAt,
      delivery: delivery?._id,
    });
  } catch (error: any) {
    logger.error('Erro ao aceitar pedido', error as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * Loja rejeita pedido
 * Transição: 'criado' → 'cancelado'
 * Refund: Processado automaticamente se pagamento foi capturado
 */
export const rejectOrderByStore = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: orderId } = req.params as any;
    const { reason, reasonCode } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    // Validar que a loja pertence ao usuário
    const store = await Store.findOne({ _id: order.storeId, ownerId: userId });
    if (!store) {
      return res.status(403).json({ error: 'Permissão negada' });
    }

    // Pedidos 'criado', 'pago' ou 'enviado' podem ser rejeitados pela loja
    if (!['criado', 'pago', 'enviado'].includes(order.status)) {
      return res.status(400).json({
        error: `Pedido não pode ser rejeitado no estado: ${order.status}`,
      });
    }

    const isLate = order.status === 'enviado';
    const isCashOnDelivery = order.paymentMethod === 'cash_on_delivery';
    const useAsaas = env.PAYMENT_GATEWAY === 'asaas';
    const refundAmount = order.totalValue || 0;
    let refundStatus: 'pending' | 'processed' | 'failed' = 'processed';

    // ✅ IDEMPOTÊNCIA/ATÔMICO: só UM request consegue mover para 'rejeitado'.
    // Bloqueia duplo-reembolso por requisições concorrentes.
    const claimed = await Order.findOneAndUpdate(
      { _id: orderId, status: { $in: ['criado', 'pago', 'enviado'] } },
      { $set: { status: 'rejeitado', cancelledAt: new Date() } },
      { new: true }
    );
    if (!claimed) {
      return res.status(409).json({ error: 'Pedido já foi rejeitado/cancelado ou está em processamento' });
    }

    // ✅ Devolver estoque (uma única vez, graças à trava atômica acima)
    for (const it of (order.products || [])) {
      if ((it as any).productId && (it as any).quantity) {
        await Product.findByIdAndUpdate((it as any).productId, { $inc: { quantity: (it as any).quantity } });
      }
    }

    // --- NOVO FLUXO: Cancelar payouts + reembolsar cliente + debitar AppCashbox ---
    if (!isCashOnDelivery) {
      const rejectSession = await mongoose.startSession();
      try {
        await rejectSession.withTransaction(async () => {
          const result = await payoutService.cancelPayoutsForOrder(orderId, 'order_rejected_by_store', rejectSession);
          if (result.errors.length > 0) {
            // #3: payout já liquidado — não reembolsar cego; escala pro admin.
            throw Object.assign(new Error('PAYOUT_ALREADY_SETTLED'), {
              needsManualReview: true,
              payoutErrors: result.errors,
            });
          }

          // Fluxo legado (carteira virtual). Em modo Asaas o estorno é REAL (abaixo).
          if (!useAsaas) {
            const clientWallet = await Wallet.findOne({ owner: order.customerId.toString(), ownerType: 'user' }).session(rejectSession);
            if (clientWallet) {
              clientWallet.balance += refundAmount;
              clientWallet.totalIncome += refundAmount;
              clientWallet.history.push({
                date: new Date(),
                type: 'credit',
                category: 'refund',
                amount: refundAmount,
                reason: 'Reembolso - Pedido rejeitado pela loja',
                relatedId: orderId,
              });
              await clientWallet.save({ session: rejectSession });
            }

            const appCashbox = await AppCashbox.findOne().session(rejectSession);
            if (appCashbox) {
              appCashbox.balance -= refundAmount;
              appCashbox.totalExpenses += refundAmount;
              appCashbox.history.push({
                type: 'expense',
                source: 'order_refund',
                amount: refundAmount,
                orderId,
                reason: 'Reembolso - Pedido rejeitado pela loja',
                date: new Date(),
              });
              await appCashbox.save({ session: rejectSession });
            }
          }
        });

        if (useAsaas) {
          // Devolve o saldo da carteira usado no pedido (se houve).
          if (order.walletApplied && order.walletApplied > 0) {
            await Wallet.updateOne({ owner: order.customerId.toString(), ownerType: 'user' }, { $inc: { balance: order.walletApplied, totalIncome: order.walletApplied } });
          }
          if (order.paymentStatus === 'paid' && order.asaasPaymentId) {
            try {
              await refundOrderCharge(order.asaasPaymentId);
              order.asaasChargeStatus = 'refunded';
              order.paymentStatus = 'refunded';
              await order.save();
            } catch (refundErr) {
              logger.error('Falha no estorno Asaas (rejeição da loja) — escala pro admin', refundErr as Error, { orderId });
              refundStatus = 'pending';
            }
          }
        } else {
          emitWalletRefund(order.customerId.toString(), 'user', refundAmount, `Reembolso do pedido ${orderId}`);
        }
      } catch (walletError: any) {
        if (walletError?.needsManualReview) {
          logger.warn('Reembolso retido para revisão manual — payout já liquidado', { orderId, payoutErrors: walletError.payoutErrors });
          refundStatus = 'pending';
        } else {
          logger.error('Erro ao reverter pagamento na rejeição pela loja', walletError as Error, { orderId });
          refundStatus = 'failed';
        }
      } finally {
        rejectSession.endSession();
      }
    }

    // Taxa de cancelamento tardio cobrada da loja (quando pedido já foi enviado)
    let lateCancellationFee = 0;
    if (isLate) {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const config = await PlatformConfig.findOne().session(session);
        const feeConfig = {
          lateCancellationFeePercent: config?.lateCancellationFeePercent ?? 10,
          lateCancellationMotoboyShare: config?.lateCancellationMotoboyShare ?? 50,
        };
        const { totalFee, motoboyShare, appShare } = calculateLateCancellationFee(
          order.totalValue || 0, feeConfig, 'store'
        );
        lateCancellationFee = totalFee;

        // Debitar taxa da wallet da loja
        const storeWallet = await Wallet.findOne({ owner: order.storeId.toString(), ownerType: 'store' }).session(session);
        if (storeWallet) {
          if (isCashOnDelivery) {
            storeWallet.blockedBalance = Math.max(0, (storeWallet.blockedBalance || 0) - totalFee);
            storeWallet.totalSpent += totalFee;
          } else {
            storeWallet.balance -= totalFee;
            storeWallet.totalSpent += totalFee;
          }
          storeWallet.history.push({
            type: 'debit',
            category: 'penalty',
            amount: totalFee,
            reason: 'Taxa de cancelamento tardio - rejeição pela loja',
            date: new Date(),
            reference: `LATE_CANCEL_STORE_${orderId}`,
          });
          await storeWallet.save({ session });
        }

        // Creditar motoboy share como Payout released (#1) — ver explicação no fluxo do cliente.
        if (motoboyShare > 0 && order.deliveryId) {
          const delivery = await Delivery.findById(order.deliveryId).session(session);
          if (delivery?.motoboyId) {
            const compPayout = await payoutService.createPendingPayout({
              recipientType: 'motoboy',
              recipientId: String(delivery.motoboyId),
              orderId: String(order._id),
              deliveryId: String(delivery._id),
              amount: motoboyShare,
              session,
            });
            await payoutService.releasePayout(String(compPayout._id), session);
          }
        }

        // Creditar a multa INTEIRA no AppCashbox (#1) — dá lastro ao Payout do motoboy.
        if (totalFee > 0) {
          const appCashbox = await AppCashbox.findOne().session(session);
          if (appCashbox) {
            appCashbox.balance += totalFee;
            appCashbox.totalIncome += totalFee;
            appCashbox.history.push({
              type: 'income',
              source: 'cancelled_order',
              amount: totalFee,
              reason: `Taxa cancelamento tardio loja (inclui compensação do motoboy a repassar) - Pedido ${orderId}`,
              date: new Date(),
              orderId: orderId,
            });
            await appCashbox.save({ session });
          }
        }

        await session.commitTransaction();
        session.endSession();
      } catch (feeErr) {
        await session.abortTransaction();
        session.endSession();
        logger.error('Erro ao cobrar taxa de cancelamento tardio da loja', feeErr as Error, { orderId });
      }
    }

    // Cria documento de cancelamento
    const cancellation = await Cancellation.create({
      orderId: order._id,
      deliveryId: order.deliveryId || undefined,
      cancelledBy: 'store',
      reason: reason || 'Rejeitado pela loja',
      reasonCode: isLate ? 'late_cancellation' : (reasonCode || 'store_rejected'),
      refundAmount,
      refundStatus,
      isLateCancellation: isLate,
      lateCancellationFee: isLate ? lateCancellationFee : undefined,
    });

    // Atualiza status
    order.status = 'rejeitado';
    order.cancelledAt = new Date();
    order.cancellationId = cancellation._id;
    await order.save();

    // Para COD antes do pickup: liberar reserva da loja
    if (isCashOnDelivery && !isLate) {
      const config = await PlatformConfig.findOne();
      const feePercent = config?.lateCancellationFeePercent ?? 10;
      const blockAmount = (order.totalValue || 0) * feePercent / 100;
      const storeWalletCOD = await Wallet.findOne({ owner: order.storeId.toString(), ownerType: 'store' });
      if (storeWalletCOD && storeWalletCOD.blockedBalance > 0) {
        const release = Math.min(blockAmount, storeWalletCOD.blockedBalance);
        storeWalletCOD.blockedBalance -= release;
        storeWalletCOD.balance += release;
        storeWalletCOD.history.push({
          date: new Date(),
          type: 'credit',
          category: 'transfer',
          amount: release,
          reason: `Liberação de reserva COD - rejeição antes do pickup ${orderId}`,
          reference: `COD_UNBLOCK_${orderId}`,
        });
        await storeWalletCOD.save();
      }
    }

    // Cancela entrega associada
    if (order.deliveryId) {
      const delivery = await Delivery.findById(order.deliveryId);
      if (delivery && delivery.status !== 'delivered') {
        delivery.status = 'cancelled';
        delivery.cancelledAt = new Date();
        await delivery.save();
        emitDeliveryCancelled(delivery.toObject(), cancellation.toObject());
      }
    }

    // Emite eventos
    emitOrderRejectedByStore(order.toObject(), reason);
    emitOrderCancelled(order.toObject(), cancellation.toObject());

    return res.json({
      success: true,
      orderId: order._id,
      status: 'cancelado',
      reason,
      refundAmount,
      refundStatus,
      cancellationId: cancellation._id,
      isLateCancellation: isLate,
      lateCancellationFee: isLate ? lateCancellationFee : undefined,
    });
  } catch (error: any) {
    logger.error('Erro ao rejeitar pedido', error as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// ========== CONSULTAS DE CANCELAMENTOS ==========

/**
 * Obter histórico de cancelamentos de um pedido
 */
export const getCancellationHistory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: orderId } = req.params as any;

    // ✅ SEGURANÇA (IDOR): só o cliente dono, o dono da loja ou um admin podem ver.
    const userId = req.user?.id;
    const role = (req.user as any)?.activeRole || (req.user as any)?.role;
    const order = await Order.findById(orderId).lean();
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
    const isCustomer = String(order.customerId) === String(userId);
    let isStoreOwner = false;
    if (!isCustomer) {
      const store = await Store.findById(order.storeId).select('ownerId').lean();
      isStoreOwner = !!store && String(store.ownerId) === String(userId);
    }
    const isAdmin = ['ceo', 'gerente_geral'].includes(role);
    if (!isCustomer && !isStoreOwner && !isAdmin) {
      return res.status(403).json({ error: 'Sem permissão para ver este histórico' });
    }

    const cancellations = await Cancellation.find({ orderId })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      count: cancellations.length,
      history: cancellations,
    });
  } catch (error: any) {
    logger.error('Erro ao buscar histórico de cancelamentos', error as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * Obter estatísticas de cancelamentos
 */
export const getCancellationStats = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    // Buscar a loja do usuário
    const store = await Store.findOne({ ownerId: userId });
    if (!store) {
      return res.status(403).json({ error: 'Usuário não é lojista' });
    }

    // Busca todos os pedidos da loja para contar cancelamentos
    const orders = await Order.find({ storeId: store._id }).select('_id status');
    const orderIds = orders.map(o => o._id);

    const stats = await Cancellation.aggregate([
      { $match: { orderId: { $in: orderIds } } },
      {
        $group: {
          _id: '$reasonCode',
          count: { $sum: 1 },
          totalRefund: { $sum: '$refundAmount' },
        },
      },
      { $sort: { count: -1 } },
    ]);

    const refundStats = await Cancellation.aggregate([
      { $match: { orderId: { $in: orderIds } } },
      {
        $group: {
          _id: '$refundStatus',
          count: { $sum: 1 },
          total: { $sum: '$refundAmount' },
        },
      },
    ]);

    return res.json({
      success: true,
      byReason: stats,
      byRefundStatus: refundStats,
      totalCancellations: stats.reduce((sum, s) => sum + s.count, 0),
    });
  } catch (error: any) {
    logger.error('Erro ao buscar estatísticas de cancelamentos', error as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
