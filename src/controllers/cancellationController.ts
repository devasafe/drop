import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../lib/prisma';

import { toApiOrder, orderInclude } from '../repositories/order.repository';
import { toApiDelivery, persistDelivery } from '../repositories/delivery.repository';


import { recordCashboxEntry } from '../repositories/appCashbox.repository';
import { getPlatformConfig } from '../repositories/platformConfig.repository';
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
import walletService from '../services/wallet.prisma.service';
import payoutService from '../services/payout.service';
import logger from '../config/logger';
import { findSubByStoreId } from '../repositories/storeSubscription.repository';
import { emitOrderStatusChanged } from '../utils/socketEmitter';
import { createDebt } from '../repositories/customerDebt.repository';
import env from '../config/env';
import { refundOrderCharge } from '../services/asaas/refund';

// Validações de permissão
const validateOrderOwnership = async (orderId: string, userId: string) => {
  // Devolve a forma de API (products[], _id, dinheiro em number) — os call sites
  // dependem desses campos.
  const order = toApiOrder(await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude }));
  if (!order) throw new Error('Pedido não encontrado');
  if (String(order.customerId) !== userId) throw new Error('Permissão negada');
  return order;
};

const validateStoreOwnership = async (storeId: string, userId: string) => {
  const store = await prisma.store.findUnique({ where: { id: String(storeId) } }) as any;
  if (!store) throw new Error('Loja não encontrada');
  if (store.ownerId.toString() !== userId) throw new Error('Permissão negada');
  return store;
};

const validateMotoboyDelivery = async (deliveryId: string, motoboyId: string) => {
  const delivery: any = toApiDelivery(await prisma.delivery.findUnique({ where: { id: String(deliveryId) } }));
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
    // A trava vira um UPDATE condicional: `WHERE status IN (canceláveis)`. Sob
    // concorrência o Postgres serializa a linha e só um request muda o status,
    // então `count === 1` é a reivindicação exclusiva (bloqueia duplo-reembolso).
    const claim = await prisma.order.updateMany({
      where: { id: orderId, status: { in: cancellableStatuses as any } },
      data: { status: 'cancelado', cancelledAt: new Date() },
    });
    if (claim.count === 0) {
      return res.status(409).json({ error: 'Pedido já foi cancelado ou está em processamento' });
    }

    // ✅ Devolver estoque (createOrder decrementa sempre, COD ou não).
    // Roda uma única vez graças à trava atômica acima.
    for (const it of (order.products || [])) {
      if ((it as any).productId && (it as any).quantity) {
        await prisma.product.updateMany({ where: { id: String((it as any).productId) }, data: { quantity: { increment: (it as any).quantity } } });
      }
    }

    // --- NOVO FLUXO: Cancelar payouts + reembolsar cliente + debitar AppCashbox ---
    if (!isCashOnDelivery) {
      try {
        // Tudo no Postgres numa única transação (Payout+Wallet+AppCashbox).
        await prisma.$transaction(async (tx) => {
          // Cancelar todos os payouts do pedido
          const result = await payoutService.cancelPayoutsForOrder(orderId, 'order_cancelled', tx);
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
            await walletService.credit(
              { owner: customerId, ownerType: 'user', amount: refundAmount, reason: 'Reembolso - Pedido cancelado pelo cliente', category: 'refund', relatedId: orderId },
              tx,
            );
            await recordCashboxEntry(tx, {
              type: 'expense', source: 'order_refund', amount: refundAmount, orderId,
              reason: 'Reembolso - Pedido cancelado pelo cliente',
            });
          }
        });

        if (useAsaas) {
          // Devolve o saldo da carteira que foi usado no pedido (se houve).
          if (order.walletApplied && order.walletApplied > 0) {
            await walletService.credit({ owner: customerId, ownerType: 'user', amount: order.walletApplied, reason: 'Devolução de saldo — pedido cancelado', category: 'refund', relatedId: orderId });
          }
          // Estorno REAL no Asaas (devolve pro PIX/cartão do cliente). Só se a parte PIX foi paga.
          if (order.paymentStatus === 'paid' && order.asaasPaymentId) {
            try {
              await refundOrderCharge(order.asaasPaymentId);
              order.asaasChargeStatus = 'refunded';
              order.paymentStatus = 'refunded';
              await prisma.order.update({ where: { id: order.id }, data: { asaasChargeStatus: 'refunded', paymentStatus: 'refunded' } });
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
      }
    }

    // Taxa de cancelamento tardio (quando pedido já foi enviado)
    let lateCancellationFee = 0;
    if (isLate) {
      try {
        const config = await getPlatformConfig();
        const feeConfig = {
          lateCancellationFeePercent: config?.lateCancellationFeePercent ?? 10,
          lateCancellationMotoboyShare: config?.lateCancellationMotoboyShare ?? 50,
        };
        const { totalFee, motoboyShare, appShare } = calculateLateCancellationFee(
          order.totalValue || 0, feeConfig, 'customer'
        );
        lateCancellationFee = totalFee;

        // Resolve o motoboy antes da transação (Delivery é leitura).
        let compMotoboyId: string | null = null;
        if (motoboyShare > 0 && order.deliveryId) {
          const delivery = await prisma.delivery.findUnique({ where: { id: String(order.deliveryId) }, select: { motoboyId: true } });
          compMotoboyId = delivery?.motoboyId ?? null;
        }
        // CustomerDebt é criado após a transação (best-effort, mesmo padrão de antes).
        const debtToCreate = isCashOnDelivery
          ? { customerId, amount: totalFee, sourceOrderId: order.id, status: 'pending', reason: 'Multa de cancelamento tardio em pedido pagar na entrega' }
          : null;

        await prisma.$transaction(async (tx) => {
          if (isCashOnDelivery) {
            // Fee sai do blockedBalance da loja (cliente não pagou nada).
            const w = await walletService.getOrCreate(String(order.storeId), 'store', tx);
            const newBlocked = Math.max(0, Number(w.blockedBalance) - totalFee);
            await tx.wallet.update({
              where: { id: w.id },
              data: { blockedBalance: newBlocked, totalSpent: { increment: totalFee } },
            });
          } else {
            // Fluxo normal: debita a multa da carteira do cliente.
            await walletService.debit(
              { owner: customerId, ownerType: 'user', amount: totalFee, reason: 'Taxa de cancelamento tardio', category: 'penalty', reference: `LATE_CANCEL_${orderId}` },
              tx,
            );
          }

          // Compensação do motoboy: Payout released (reconciliável e sacável).
          if (compMotoboyId) {
            const compPayout = await payoutService.createPendingPayout({
              recipientType: 'motoboy', recipientId: compMotoboyId,
              orderId: order.id, deliveryId: String(order.deliveryId), amount: motoboyShare, tx,
            });
            await payoutService.releasePayout(compPayout.id, tx);
          }

          // Multa INTEIRA no AppCashbox (dá lastro ao Payout do motoboy).
          if (totalFee > 0) {
            await recordCashboxEntry(tx, {
              type: 'income', source: 'cancelled_order', amount: totalFee, orderId,
              reason: `Taxa cancelamento tardio (inclui compensação do motoboy a repassar) - Pedido ${orderId}`,
            });
          }
        });

        if (debtToCreate) {
          await createDebt(debtToCreate);
        }
      } catch (feeErr) {
        logger.error('Erro ao cobrar taxa de cancelamento tardio', feeErr as Error, { orderId });
      }
    }

    // Cria documento de cancelamento
    const cancellation = await prisma.cancellation.create({ data: {
      orderId: order.id,
      deliveryId: order.deliveryId || undefined,
      cancelledBy: 'customer',
      reason: reason || 'Solicitado pelo cliente',
      reasonCode: isLate ? 'late_cancellation' : (reasonCode || 'customer_request'),
      refundAmount,
      refundStatus,
      isLateCancellation: isLate,
      lateCancellationFee: isLate ? lateCancellationFee : undefined,
    } });

    // Status já foi para 'cancelado' na trava atômica; grava o vínculo do cancelamento.
    order.status = 'cancelado';
    order.cancellationId = String(cancellation.id);
    await prisma.order.update({ where: { id: order.id }, data: { cancellationId: String(cancellation.id) } });

    // Para COD antes do pickup: liberar reserva da loja se existir
    if (isCashOnDelivery && !isLate) {
      const config = await getPlatformConfig();
      const feePercent = config?.lateCancellationFeePercent ?? 10;
      const blockAmount = (order.totalValue || 0) * feePercent / 100;
      const storeWalletCOD = await walletService.getOrCreate(String(order.storeId), 'store');
      if (Number(storeWalletCOD.blockedBalance) > 0) {
        const release = Math.min(blockAmount, Number(storeWalletCOD.blockedBalance));
        await prisma.$transaction(async (tx) => {
          await tx.wallet.update({
            where: { id: storeWalletCOD.id },
            data: { blockedBalance: { decrement: release }, balance: { increment: release } },
          });
          await tx.walletEntry.create({
            data: {
              walletId: storeWalletCOD.id, type: 'credit', category: 'transfer', amount: release,
              reason: `Liberação de reserva COD - pedido cancelado antes do pickup ${orderId}`,
              reference: `COD_UNBLOCK_${orderId}`,
            },
          });
        });
      }
    }

    // Se há entrega associada, cancela também
    if (order.deliveryId) {
      const delivery: any = toApiDelivery(await prisma.delivery.findUnique({ where: { id: String(order.deliveryId) } }));
      if (delivery && delivery.status !== 'delivered') {
        delivery.status = 'cancelled';
        delivery.cancelledAt = new Date();
        await persistDelivery(delivery);
        emitDeliveryCancelled(delivery, cancellation);
      }
    }

    // Emite evento de cancelamento
    emitOrderCancelled(order, cancellation);

    return res.json({
      success: true,
      orderId: order.id,
      status: 'cancelado',
      refundAmount,
      refundStatus,
      cancellationId: cancellation.id,
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
    const cancellation = await prisma.cancellation.create({ data: {
      deliveryId: delivery.id,
      orderId: delivery.orderId,
      cancelledBy: 'motoboy',
      reason: reason || 'Rejeitado por motoboy',
      reasonCode: reasonCode || 'motoboy_rejected',
    } });

    // Se produto já foi retirado (picked), precisa devolver à loja com PIN antes de reassignar
    if (delivery.status === 'picked') {
      if (!delivery.pinDevolucao) {
        const pinDevolucao = Math.floor(100000 + Math.random() * 900000).toString();
        delivery.pinDevolucao = pinDevolucao;
        delivery.statusDevolucao = 'aguardando_confirmacao';
        delivery.pendingReturnAction = 'reassign';
        await persistDelivery(delivery);

        const orderForReturn = await prisma.order.findUnique({ where: { id: String(delivery.orderId) } });
        if (orderForReturn) {
          emitToRoom(`store:${orderForReturn.storeId}`, 'delivery:return_requested', {
            deliveryId: delivery._id,
            orderId: orderForReturn.id,
            motoboyId: delivery.motoboyId,
            message: 'Motoboy precisa devolver o produto à loja antes da reatribuição',
            pinRequired: true,
            returnedAt: new Date(),
          });
          emitToRoom(`user:${orderForReturn.customerId}`, 'order:return_initiated', {
            orderId: orderForReturn.id,
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
        const orderForReturn = await prisma.order.findUnique({ where: { id: String(delivery.orderId) } });
        if (orderForReturn) {
          emitToRoom(`store:${orderForReturn.storeId}`, 'delivery:return_requested', {
            deliveryId: delivery._id,
            orderId: orderForReturn.id,
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
    await persistDelivery(delivery);

    emitDeliveryRejected(delivery, 'motoboy', reason);
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

    const order: any = toApiOrder(await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude }));
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    // Validar que a loja pertence ao usuário
    const store = await prisma.store.findFirst({ where: { id: String(order.storeId), ownerId: userId } }) as any;
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
    // `order` vive no Postgres — a persistência acontece via prisma.order.update
    // (não participa das transações Mongo de carteira, COD legado).
    const persistOrder = () => prisma.order.update({
      where: { id: order.id },
      data: { status: order.status, acceptedAt: order.acceptedAt },
    });

    // Se pedido COD: bloquear fee potencial na wallet da loja (atomicamente com o status).
    if (order.paymentMethod === 'cash_on_delivery') {
      try {
        const config = await getPlatformConfig();
        const feePercent = config?.lateCancellationFeePercent ?? 10;
        const requiredBlock = (order.totalValue || 0) * feePercent / 100;

        const storeWalletCOD = await walletService.getOrCreate(String(order.storeId), 'store');
        if (Number(storeWalletCOD.balance) < requiredBlock) {
          return res.status(400).json({
            error: 'Saldo insuficiente para garantir pedido de pagamento na entrega',
            required: requiredBlock,
            available: Number(storeWalletCOD.balance),
          });
        }

        await prisma.$transaction(async (tx) => {
          await tx.wallet.update({
            where: { id: storeWalletCOD.id },
            data: { balance: { decrement: requiredBlock }, blockedBalance: { increment: requiredBlock } },
          });
          await tx.walletEntry.create({
            data: { walletId: storeWalletCOD.id, type: 'debit', category: 'transfer', amount: requiredBlock, reason: `Reserva de garantia - pedido COD ${order.id}`, reference: `COD_BLOCK_${order.id}` },
          });
        });
        await persistOrder();
      } catch (codErr) {
        logger.error('Erro ao bloquear saldo para pedido COD', codErr as Error, { orderId: order.id });
        return res.status(500).json({ error: 'Erro ao processar garantia do pedido COD' });
      }
    } else {
      await persistOrder();
    }

    // Emite evento
    emitOrderAcceptedByStore(order);

    // [Plan1] Verificar plano da loja antes de criar Delivery
    const storeSub = await findSubByStoreId(String(store.id)); // store vem do Prisma (sem _id)
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
    let delivery: any = toApiDelivery(await prisma.delivery.findFirst({ where: { orderId: order.id } }));
    if (!delivery) {
      // ✅ CORRIGIDO: Usar deliveryDistance armazenada no Order + fallback para req.body.distance
      const distance = req.body?.distance || order.deliveryDistance || 0;
      const fee = await calculateDeliveryFeeWithConfig(Number(distance || 0));
      
      delivery = toApiDelivery(await prisma.delivery.create({
        data: {
          orderId: order.id,
          distance: Number(distance || 0),
          fee,
          status: 'pending',
          // ✅ NOVO: COPIAR dados de endereço do ORDER (é a fonte de verdade!)
          customerAddress: order.customerAddress,
          customerLatitude: order.customerLatitude,
          customerLongitude: order.customerLongitude,
          storeAddress: order.storeAddress,
          storeLatitude: order.storeLatitude,
          storeLongitude: order.storeLongitude,
        },
      }));

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
      order.deliveryId = String(delivery._id);
      await prisma.order.update({ where: { id: order.id }, data: { deliveryId: String(delivery._id) } });
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

    const order: any = toApiOrder(await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude }));
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    // Validar que a loja pertence ao usuário
    const store = await prisma.store.findFirst({ where: { id: String(order.storeId), ownerId: userId } }) as any;
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
    // UPDATE condicional por status — bloqueia duplo-reembolso concorrente.
    const claim = await prisma.order.updateMany({
      where: { id: orderId, status: { in: ['criado', 'pago', 'enviado'] as any } },
      data: { status: 'rejeitado', cancelledAt: new Date() },
    });
    if (claim.count === 0) {
      return res.status(409).json({ error: 'Pedido já foi rejeitado/cancelado ou está em processamento' });
    }

    // ✅ Devolver estoque (uma única vez, graças à trava atômica acima)
    for (const it of (order.products || [])) {
      if ((it as any).productId && (it as any).quantity) {
        await prisma.product.updateMany({ where: { id: String((it as any).productId) }, data: { quantity: { increment: (it as any).quantity } } });
      }
    }

    // --- NOVO FLUXO: Cancelar payouts + reembolsar cliente + debitar AppCashbox ---
    if (!isCashOnDelivery) {
      try {
        await prisma.$transaction(async (tx) => {
          const result = await payoutService.cancelPayoutsForOrder(orderId, 'order_rejected_by_store', tx);
          if (result.errors.length > 0) {
            // #3: payout já liquidado — não reembolsar cego; escala pro admin.
            throw Object.assign(new Error('PAYOUT_ALREADY_SETTLED'), {
              needsManualReview: true,
              payoutErrors: result.errors,
            });
          }

          // Fluxo legado (carteira virtual). Em modo Asaas o estorno é REAL (abaixo).
          if (!useAsaas) {
            await walletService.credit(
              { owner: String(order.customerId), ownerType: 'user', amount: refundAmount, reason: 'Reembolso - Pedido rejeitado pela loja', category: 'refund', relatedId: orderId },
              tx,
            );
            await recordCashboxEntry(tx, {
              type: 'expense', source: 'order_refund', amount: refundAmount, orderId,
              reason: 'Reembolso - Pedido rejeitado pela loja',
            });
          }
        });

        if (useAsaas) {
          // Devolve o saldo da carteira usado no pedido (se houve).
          if (order.walletApplied && order.walletApplied > 0) {
            await walletService.credit({ owner: String(order.customerId), ownerType: 'user', amount: order.walletApplied, reason: 'Devolução de saldo — pedido rejeitado', category: 'refund', relatedId: orderId });
          }
          if (order.paymentStatus === 'paid' && order.asaasPaymentId) {
            try {
              await refundOrderCharge(order.asaasPaymentId);
              order.asaasChargeStatus = 'refunded';
              order.paymentStatus = 'refunded';
              await prisma.order.update({ where: { id: order.id }, data: { asaasChargeStatus: 'refunded', paymentStatus: 'refunded' } });
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
      }
    }

    // Taxa de cancelamento tardio cobrada da loja (quando pedido já foi enviado)
    let lateCancellationFee = 0;
    if (isLate) {
      try {
        const config = await getPlatformConfig();
        const feeConfig = {
          lateCancellationFeePercent: config?.lateCancellationFeePercent ?? 10,
          lateCancellationMotoboyShare: config?.lateCancellationMotoboyShare ?? 50,
        };
        const { totalFee, motoboyShare, appShare } = calculateLateCancellationFee(
          order.totalValue || 0, feeConfig, 'store'
        );
        lateCancellationFee = totalFee;

        let compMotoboyId: string | null = null;
        if (motoboyShare > 0 && order.deliveryId) {
          const delivery = await prisma.delivery.findUnique({ where: { id: String(order.deliveryId) }, select: { motoboyId: true } });
          compMotoboyId = delivery?.motoboyId ?? null;
        }

        await prisma.$transaction(async (tx) => {
          // Debita a taxa da carteira da loja (do bucket bloqueado no COD, do saldo senão).
          const w = await walletService.getOrCreate(String(order.storeId), 'store', tx);
          if (isCashOnDelivery) {
            const newBlocked = Math.max(0, Number(w.blockedBalance) - totalFee);
            await tx.wallet.update({ where: { id: w.id }, data: { blockedBalance: newBlocked, totalSpent: { increment: totalFee } } });
            await tx.walletEntry.create({ data: { walletId: w.id, type: 'debit', category: 'penalty', amount: totalFee, reason: 'Taxa de cancelamento tardio - rejeição pela loja', reference: `LATE_CANCEL_STORE_${orderId}` } });
          } else {
            await walletService.debit(
              { owner: String(order.storeId), ownerType: 'store', amount: totalFee, reason: 'Taxa de cancelamento tardio - rejeição pela loja', category: 'penalty', reference: `LATE_CANCEL_STORE_${orderId}` },
              tx,
            );
          }

          // Compensação do motoboy: Payout released.
          if (compMotoboyId) {
            const compPayout = await payoutService.createPendingPayout({
              recipientType: 'motoboy', recipientId: compMotoboyId,
              orderId: order.id, deliveryId: String(order.deliveryId), amount: motoboyShare, tx,
            });
            await payoutService.releasePayout(compPayout.id, tx);
          }

          // Multa INTEIRA no AppCashbox (lastro do Payout do motoboy).
          if (totalFee > 0) {
            await recordCashboxEntry(tx, {
              type: 'income', source: 'cancelled_order', amount: totalFee, orderId,
              reason: `Taxa cancelamento tardio loja (inclui compensação do motoboy a repassar) - Pedido ${orderId}`,
            });
          }
        });
      } catch (feeErr) {
        logger.error('Erro ao cobrar taxa de cancelamento tardio da loja', feeErr as Error, { orderId });
      }
    }

    // Cria documento de cancelamento
    const cancellation = await prisma.cancellation.create({ data: {
      orderId: order.id,
      deliveryId: order.deliveryId || undefined,
      cancelledBy: 'store',
      reason: reason || 'Rejeitado pela loja',
      reasonCode: isLate ? 'late_cancellation' : (reasonCode || 'store_rejected'),
      refundAmount,
      refundStatus,
      isLateCancellation: isLate,
      lateCancellationFee: isLate ? lateCancellationFee : undefined,
    } });

    // Status já foi para 'rejeitado' na trava atômica; grava o vínculo do cancelamento.
    order.status = 'rejeitado';
    order.cancellationId = String(cancellation.id);
    await prisma.order.update({ where: { id: order.id }, data: { cancellationId: String(cancellation.id) } });

    // Para COD antes do pickup: liberar reserva da loja
    if (isCashOnDelivery && !isLate) {
      const config = await getPlatformConfig();
      const feePercent = config?.lateCancellationFeePercent ?? 10;
      const blockAmount = (order.totalValue || 0) * feePercent / 100;
      const storeWalletCOD = await walletService.getOrCreate(String(order.storeId), 'store');
      if (Number(storeWalletCOD.blockedBalance) > 0) {
        const release = Math.min(blockAmount, Number(storeWalletCOD.blockedBalance));
        await prisma.$transaction(async (tx) => {
          await tx.wallet.update({ where: { id: storeWalletCOD.id }, data: { blockedBalance: { decrement: release }, balance: { increment: release } } });
          await tx.walletEntry.create({ data: { walletId: storeWalletCOD.id, type: 'credit', category: 'transfer', amount: release, reason: `Liberação de reserva COD - rejeição antes do pickup ${orderId}`, reference: `COD_UNBLOCK_${orderId}` } });
        });
      }
    }

    // Cancela entrega associada
    if (order.deliveryId) {
      const delivery: any = toApiDelivery(await prisma.delivery.findUnique({ where: { id: String(order.deliveryId) } }));
      if (delivery && delivery.status !== 'delivered') {
        delivery.status = 'cancelled';
        delivery.cancelledAt = new Date();
        await persistDelivery(delivery);
        emitDeliveryCancelled(delivery, cancellation);
      }
    }

    // Emite eventos
    emitOrderRejectedByStore(order, reason);
    emitOrderCancelled(order, cancellation);

    return res.json({
      success: true,
      orderId: order._id,
      status: 'cancelado',
      reason,
      refundAmount,
      refundStatus,
      cancellationId: cancellation.id,
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
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
    const isCustomer = String(order.customerId) === String(userId);
    let isStoreOwner = false;
    if (!isCustomer) {
      const store = await prisma.store.findUnique({ where: { id: String(order.storeId) } }) as any;
      isStoreOwner = !!store && String(store.ownerId) === String(userId);
    }
    const isAdmin = ['ceo', 'gerente_geral'].includes(role);
    if (!isCustomer && !isStoreOwner && !isAdmin) {
      return res.status(403).json({ error: 'Sem permissão para ver este histórico' });
    }

    const cancellations = await prisma.cancellation.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });

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
    const store = await prisma.store.findFirst({ where: { ownerId: userId } }) as any;
    if (!store) {
      return res.status(403).json({ error: 'Usuário não é lojista' });
    }

    // Busca todos os pedidos da loja para contar cancelamentos
    const orders = await prisma.order.findMany({ where: { storeId: store.id }, select: { id: true, status: true } });
    const orderIds = orders.map(o => o.id);

    const cancellations = await prisma.cancellation.findMany({
      where: { orderId: { in: orderIds } },
      select: { reasonCode: true, refundStatus: true, refundAmount: true },
    });

    const byReasonMap = new Map<string, { count: number; totalRefund: number }>();
    const byRefundMap = new Map<string, { count: number; total: number }>();
    for (const c of cancellations) {
      const refund = c.refundAmount ? Number(c.refundAmount) : 0;
      const r = byReasonMap.get(c.reasonCode) || { count: 0, totalRefund: 0 };
      r.count += 1; r.totalRefund += refund;
      byReasonMap.set(c.reasonCode, r);

      const rs = String(c.refundStatus ?? 'null');
      const f = byRefundMap.get(rs) || { count: 0, total: 0 };
      f.count += 1; f.total += refund;
      byRefundMap.set(rs, f);
    }
    const stats = [...byReasonMap.entries()].map(([_id, v]) => ({ _id, count: v.count, totalRefund: v.totalRefund })).sort((a, b) => b.count - a.count);
    const refundStats = [...byRefundMap.entries()].map(([_id, v]) => ({ _id: _id === 'null' ? null : _id, count: v.count, total: v.total }));

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
