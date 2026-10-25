import { Response } from 'express';
import { motoboyCancellationCompensationSafe } from '../services/motoboyCompensation';
import { generatePin } from '../services/pinGuard';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../lib/prisma';

import { toApiOrder, orderInclude } from '../repositories/order.repository';
import { toApiDelivery, persistDelivery, clearDeliveryPins } from '../repositories/delivery.repository';


import { recordCashboxEntry } from '../repositories/appCashbox.repository';
import { getPlatformConfig } from '../repositories/platformConfig.repository';
import notifier from '../services/notifier';
import { calculateDeliveryFeeWithConfig, calculateOrderDistribution } from '../utils/walletCalculations';
import { calculateCancellationFee } from '../utils/cancellationFee';
import {
  emitOrderCancelled,
  emitDeliveryRejected,
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
import { notifyCustomerOrder } from '../services/customerNotify';
import { findSubByStoreId } from '../repositories/storeSubscription.repository';
import { emitOrderStatusChanged } from '../utils/socketEmitter';
import env from '../config/env';
import { refundOrderCharge } from '../services/asaas/refund';
import { isDirectOrder } from '../utils/settlement';
import { customerAbsentWaitMinutes, customerAbsentWaitStart } from '../utils/customerAbsent';
import {
  directCustomerRefund, settleDirectRefund, recordCancellationWithCompensation, CancellationClaimLostError,
} from '../services/asaasLoja/directCancellation';
import { storeHasOverdueTransfer } from '../services/asaasLoja/motoboyTransfer';
import { staffRolesOf } from './rolePermissionsController';
import { round2, directRefundStatus } from '../services/cancellation/shared';
import { cancelOrderAsCustomerRule } from '../services/cancellation/customerRule';
import { cancelOrderAsStoreRule } from '../services/cancellation/storeRule';
import { cancelOrderWithFullRefund } from '../services/cancellation/fullRefund';
import { customerCancelPreview } from '../services/cancellation/customerPreview';
import { countsAgainstWhere } from '../services/cancellation/faultStats';

// Reexport: storeAcceptTimeout.job e os testes antigos importam daqui.
export { cancelOrderWithFullRefund };

/** Pedido encerrado: nada de reembolso/reentrega/reatribuição depois disso. */
const CLOSED_ORDER_STATUSES = ['cancelado', 'rejeitado'];

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
 * GET /orders/:id/cancel-preview — quanto volta se o cliente cancelar AGORA.
 * Só leitura; o cálculo está em services/cancellation/customerPreview.
 */
export const getCancelPreview = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const customerId = req.user?.id;
    if (!customerId) return res.status(401).json({ error: 'Não autenticado' });
    const order: any = toApiOrder(await prisma.order.findUnique({ where: { id: String(req.params.id) }, include: orderInclude }));
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (String(order.customerId) !== customerId) return res.status(403).json({ error: 'Permissão negada' });
    return res.json({ success: true, data: await customerCancelPreview(order) });
  } catch (err) {
    logger.error('[cancelPreview] erro', err as Error);
    return res.status(500).json({ error: 'Erro ao calcular a prévia do cancelamento' });
  }
};

/**
 * Cliente cancela pedido. A regra (taxa, trava, estorno, compensação) está em
 * services/cancellation/customerRule.
 */
export const cancelOrderByCustomer = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: orderId } = req.params as any;
    const { reason, reasonCode } = req.body;
    const customerId = req.user?.id;

    if (!customerId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const order = await validateOrderOwnership(orderId, customerId);
    const result = await cancelOrderAsCustomerRule({ order, requestedBy: customerId, reason, reasonCode });
    return res.status(result.status).json(result.body);
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

    // Se produto já foi retirado (picked): motoboy é o culpado (spec §3.2 "MTB já pegou").
    // Cobra a taxa do MOTOBOY (base=entrega, 100% app), inicia a devolução do produto à loja
    // (pinDevolucao) e AGUARDA a decisão do cliente (reembolso/reentrega) — NÃO reatribui
    // automaticamente ao pool. `pendingReturnAction` fica indefinido: só o endpoint
    // `pos-devolucao` (reentrega) o define como 'reassign' quando o cliente escolhe.
    if (delivery.status === 'picked') {
      if (!delivery.pinDevolucao) {
        const orderForReturn = await prisma.order.findUnique({ where: { id: String(delivery.orderId) } });

        // Taxa do motoboy (spec §3.2 "MTB já pegou"): base = entrega, 100% app.
        const cfg = await getPlatformConfig();
        const feeConfig = {
          cancelFeeCustomerPercent: cfg?.cancelFeeCustomerPercent ?? 10,
          cancelFeeStorePercent: cfg?.cancelFeeStorePercent ?? 10,
          cancelFeeMotoboyPercent: cfg?.cancelFeeMotoboyPercent ?? 10,
          lateCancellationMotoboyShare: cfg?.lateCancellationMotoboyShare ?? 50,
        };
        const fee = calculateCancellationFee({
          actor: 'motoboy',
          motoboyInvolved: true,
          orderTotal: orderForReturn?.totalValue ? Number(orderForReturn.totalValue) : 0,
          deliveryFee: orderForReturn?.deliveryFee ? Number(orderForReturn.deliveryFee) : Number(delivery.fee || 0),
          config: feeConfig,
        });

        const pin = generatePin(6);
        const feeRef = `CANCEL_MTB_${delivery._id}`;

        // ── IDEMPOTÊNCIA CONCURRENCY-SAFE (review #2) ──
        // Reivindica a devolução de forma atômica na própria Delivery: o UPDATE condicional
        // `WHERE pinDevolucao IS NULL` (estado pré-taxa) é serializado pelo lock de linha do
        // Postgres, então dois `reject` simultâneos (double-tap) só têm UM vencedor — e só o
        // vencedor cobra a taxa. Espelha a trava de status do pedido (updateMany + count).
        const claim = await prisma.delivery.updateMany({
          where: { id: String(delivery._id), status: 'picked', pinDevolucao: null },
          data: { statusDevolucao: 'aguardando_confirmacao', pinDevolucao: pin, pendingReturnAction: null },
        });

        if (claim.count === 0) {
          // Outro request concorrente já reivindicou a devolução — NÃO cobra de novo.
          const fresh: any = toApiDelivery(await prisma.delivery.findUnique({ where: { id: String(delivery._id) } }));
          return res.status(202).json({
            success: true,
            statusDevolucao: fresh?.statusDevolucao ?? 'aguardando_confirmacao',
            message: 'Devolução já em andamento. Aguardando decisão do cliente / confirmação da loja.',
            pinDevolucao: fresh?.pinDevolucao,
            awaitingCustomerDecision: true,
            isPending: true,
          });
        }

        // Vencemos a reivindicação → somos o ÚNICO a cobrar a taxa (idempotência garantida).
        // Modo direto: sem carteira/AppCashbox — a taxa do motoboy não é cobrada aqui (Fase 2).
        const directReturn = isDirectOrder(orderForReturn);
        let feeStatus: 'charged' | 'pending' | 'none' = fee.totalFee > 0 && !directReturn ? 'pending' : 'none';
        if (fee.totalFee > 0 && !directReturn) {
          try {
            await prisma.$transaction(async (tx) => {
              // Debita a taxa da carteira do MOTOBOY (mesmo padrão de penalty da loja).
              await walletService.debit(
                { owner: String(delivery.motoboyId), ownerType: 'motoboy', amount: fee.totalFee, reason: 'Taxa de cancelamento pós-retirada - motoboy', category: 'penalty', reference: feeRef },
                tx,
              );
              // Taxa cheia (= appShare, 100% app) como income no AppCashbox. Aqui usamos
              // fee.appShare em vez de fee.totalFee (convenção dos demais pontos deste
              // arquivo) porque para o ator 'motoboy' motoboyShare=0 → appShare === totalFee;
              // é o mesmo valor, não há divergência contábil real.
              await recordCashboxEntry(tx, {
                type: 'income', source: 'cancelled_order', amount: fee.appShare, orderId: String(delivery.orderId),
                reason: `Taxa de cancelamento do motoboy pós-retirada - Pedido ${delivery.orderId}`,
              });
            });
            feeStatus = 'charged';
          } catch (feeErr) {
            // review #3: saldo insuficiente (ou outra falha do débito) → NÃO fingimos sucesso.
            // A devolução prossegue (o produto precisa voltar à loja de qualquer forma), mas a
            // taxa fica PENDENTE e recuperável: como NENHUM walletEntry `feeRef` foi criado, uma
            // cobrança futura pode reprocessá-la sem risco de duplicidade (idempotência por ref).
            feeStatus = 'pending';
            logger.warn('Taxa do motoboy não debitada (saldo insuficiente?) — fica PENDENTE p/ cobrança futura', { deliveryId: delivery._id, motoboyId: delivery.motoboyId, amount: fee.totalFee, error: (feeErr as Error)?.message });
          }
        }

        if (orderForReturn) {
          emitToRoom(`store:${orderForReturn.storeId}`, 'delivery:return_requested', {
            deliveryId: delivery._id,
            orderId: orderForReturn.id,
            motoboyId: delivery.motoboyId,
            message: 'Motoboy cancelou após retirar; precisa devolver o produto à loja',
            pinRequired: true,
            returnedAt: new Date(),
          });
          // Cliente decide: reembolso (100%) ou reentrega (novo entregador).
          void notifyCustomerOrder(String(orderForReturn.id), 'return_decision');
          emitToRoom(`user:${orderForReturn.customerId}`, 'order:aguardando_decisao_devolucao', {
            orderId: orderForReturn.id,
            deliveryId: delivery._id,
            message: 'O motoboy cancelou após retirar seu produto. Escolha: reembolso ou reentrega.',
            opcoes: ['reembolso', 'reentrega'],
          });
        }

        // review #5: a mensagem reflete o resultado REAL do débito (não um sucesso presumido).
        return res.status(202).json({
          success: true,
          statusDevolucao: 'aguardando_confirmacao',
          feeStatus,
          message: feeStatus === 'charged'
            ? 'Taxa cobrada do motoboy. Produto será devolvido à loja; aguardando decisão do cliente.'
            : feeStatus === 'pending'
              ? 'Produto será devolvido à loja; aguardando decisão do cliente. Taxa do motoboy ficou PENDENTE (sem saldo) e será cobrada posteriormente.'
              : 'Produto será devolvido à loja; aguardando decisão do cliente.',
          pinDevolucao: pin,
          awaitingCustomerDecision: true,
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
            // Sem pinDevolucao: a loja DIGITA o PIN que o motoboy mostra.
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

    // status === 'assigned' OU devolução já confirmada pela loja: reassign imediato.
    // motoboyId precisa ser `null` (não `undefined`) — Prisma ignora undefined no update.
    delivery.status = 'pending';
    delivery.motoboyId = null;
    delivery.pendingReturnAction = null;
    clearDeliveryPins(delivery);
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

// ========== CLIENTE AUSENTE (spec §3.2 / §6.3) ==========

/**
 * Motoboy marca "cliente ausente" no local, após a espera mínima cumprida.
 * POST /deliveries/:id/cliente-ausente
 *
 * Localização: fica aqui (não em `deliveryController.ts`, apesar do brief
 * apontar pra lá) porque TODA a infra financeira de refund/payout/AppCashbox já
 * está importada neste arquivo, e o fluxo reusa — não duplica — os MESMOS
 * primitivos atômicos de `cancelOrderByCustomer` (trava updateMany+count sobre
 * o pedido, devolução de estoque, cancelamento de payouts com guard
 * PAYOUT_ALREADY_SETTLED, refund parcial Asaas/legado). Duplicar esse código
 * financeiro em outro arquivo seria frágil (duas fontes de verdade para o
 * mesmo padrão de reembolso/idempotência).
 *
 * Taxa (helper `calculateCancellationFee`, actor='customer_absent'):
 *   base = orderTotal; totalFee = orderTotal * cancelFeeCustomerPercent/100 (payer=customer)
 *   motoboyShare = deliveryFee (entrega CHEIA, fixa — não é fração da taxa)
 *   appShare = totalFee - motoboyShare (pode ficar NEGATIVO se deliveryFee > totalFee)
 *   refundToCustomer = orderTotal - totalFee
 *
 * Edge appShare<0: NÃO lançamos `appShare` diretamente no AppCashbox (isso criaria
 * uma entrada de "income" negativa sem sentido contábil). Seguimos o MESMO padrão
 * dos outros atores (Task 5/6/7): lançamos `fee.totalFee` (sempre ≥ 0, é só
 * orderTotal * percent/100) como income — "dá lastro" ao Payout do motoboy — e o
 * "líquido" real da plataforma (appShare = totalFee - motoboyShare) fica implícito/
 * derivado (nunca é uma segunda entrada no caixa), exatamente como nas outras taxas
 * deste arquivo. Quando motoboyShare (entrega cheia) excede totalFee, a plataforma
 * paga ao motoboy mais do que arrecadou de taxa — é a garantia de "entrega cheia"
 * da spec, um custo que a plataforma absorve; o refund ao cliente e o pagamento ao
 * motoboy permanecem corretos independentemente disso.
 */
export const marcarClienteAusente = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: deliveryId } = req.params as any;
    const { reason, reasonCode } = req.body || {};
    const motoboyId = req.user?.id;

    if (!motoboyId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    // Dono da entrega: checagem EXPLÍCITA (não via `validateMotoboyDelivery`, que
    // lança e cairia no catch genérico → 500; aqui precisamos de 403 de verdade).
    const deliveryRow = await prisma.delivery.findUnique({ where: { id: String(deliveryId) } });
    if (!deliveryRow) {
      return res.status(404).json({ error: 'Entrega não encontrada' });
    }
    if (String(deliveryRow.motoboyId) !== motoboyId) {
      return res.status(403).json({ error: 'Apenas o motoboy designado pode marcar cliente ausente' });
    }
    if (deliveryRow.status !== 'picked') {
      return res.status(400).json({
        error: `Cliente ausente só pode ser marcado com a entrega em 'picked' (atual: ${deliveryRow.status})`,
        currentStatus: deliveryRow.status,
      });
    }

    // Espera mínima a partir da retirada (`pickedAt ?? updatedAt`, ver utils/customerAbsent).
    // O mesmo cálculo alimenta `customerAbsentAvailableAt` no GET /deliveries/:id.
    const cfg = await getPlatformConfig();
    const waitMin = customerAbsentWaitMinutes(cfg);
    const waitMs = waitMin * 60 * 1000;
    const elapsedMs = Date.now() - customerAbsentWaitStart(deliveryRow).getTime();
    if (elapsedMs < waitMs) {
      return res.status(400).json({
        error: `Espera mínima de ${waitMin} min ainda não cumprida`,
        waitMinutesRequired: waitMin,
        remainingMs: waitMs - elapsedMs,
      });
    }

    const order: any = toApiOrder(await prisma.order.findUnique({ where: { id: String(deliveryRow.orderId) }, include: orderInclude }));
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    // Pedido real com a entrega retirada fica em 'aguardando_motoboy' (D3b-1 B2); 'pago' e o
    // 'enviado' antigo continuam aceitos. A mesma lista vale para a checagem e para as duas travas
    // (custódia e recordCancellationWithCompensation do direto). A entrega continua exigindo
    // 'picked' e a espera mínima, checadas acima.
    const cancellableStatuses = ['pago', 'aguardando_motoboy', 'enviado'];
    if (!cancellableStatuses.includes(order.status)) {
      return res.status(400).json({
        error: `Pedido não pode ser cancelado no estado: ${order.status}`,
        currentStatus: order.status,
      });
    }

    const isCashOnDelivery = order.paymentMethod === 'cash_on_delivery';
    const useAsaas = env.PAYMENT_GATEWAY === 'asaas';

    const feeConfig = {
      cancelFeeCustomerPercent: cfg?.cancelFeeCustomerPercent ?? 10,
      cancelFeeStorePercent: cfg?.cancelFeeStorePercent ?? 10,
      cancelFeeMotoboyPercent: cfg?.cancelFeeMotoboyPercent ?? 10,
      lateCancellationMotoboyShare: cfg?.lateCancellationMotoboyShare ?? 50,
    };
    const fee = calculateCancellationFee({
      actor: 'customer_absent',
      motoboyInvolved: true,
      orderTotal: order.totalValue || 0,
      deliveryFee: order.deliveryFee || 0,
      config: feeConfig,
    });
    // Modo direto (P1): o valor devolvido é total - taxa de entrega, o mesmo do DirectRefund.
    const refundAmount = isDirectOrder(order) ? directCustomerRefund(order, fee, 'customer_absent') : fee.refundToCustomer;
    let refundStatus: 'pending' | 'processed' | 'failed' = 'pending';

    // ✅ IDEMPOTÊNCIA/ATÔMICO: mesma trava de `cancelOrderByCustomer` — só UM
    // request consegue mover de um status cancelável → 'cancelado'.
    // Pedido direto (R19-a): trava + estoque dentro da transação do registro (abaixo).
    const direct = isDirectOrder(order);
    if (!direct) {
      const claim = await prisma.order.updateMany({
        where: { id: order.id, status: { in: cancellableStatuses as any } },
        data: { status: 'cancelado', cancelledAt: new Date() },
      });
      if (claim.count === 0) {
        return res.status(409).json({ error: 'Pedido já foi cancelado ou está em processamento' });
      }

      // ✅ Devolver estoque (uma única vez, graças à trava acima) — produto volta pra loja.
      for (const it of (order.products || [])) {
        if ((it as any).productId && (it as any).quantity) {
          await prisma.product.updateMany({ where: { id: String((it as any).productId) }, data: { quantity: { increment: (it as any).quantity } } });
        }
      }
    }

    // --- Refund PARCIAL ao cliente (mesmo padrão de cancelOrderByCustomer) ---
    const directAmount = direct ? refundAmount : 0;
    if (direct) {
      refundStatus = directRefundStatus(order, 'cliente ausente', directAmount);
    } else if (!isCashOnDelivery) {
      try {
        await prisma.$transaction(async (tx) => {
          const result = await payoutService.cancelPayoutsForOrder(order.id, 'customer_absent', tx);
          if (result.errors.length > 0) {
            throw Object.assign(new Error('PAYOUT_ALREADY_SETTLED'), {
              needsManualReview: true,
              payoutErrors: result.errors,
            });
          }

          if (!useAsaas) {
            await walletService.credit(
              { owner: String(order.customerId), ownerType: 'user', amount: refundAmount, reason: 'Reembolso parcial - Cliente ausente na entrega', category: 'refund', relatedId: order.id },
              tx,
            );
            await recordCashboxEntry(tx, {
              type: 'expense', source: 'order_refund', amount: refundAmount, orderId: order.id,
              reason: 'Reembolso parcial - Cliente ausente na entrega',
            });
          }
        });

        if (useAsaas) {
          if (order.walletApplied && order.walletApplied > 0) {
            await walletService.credit({ owner: String(order.customerId), ownerType: 'user', amount: order.walletApplied, reason: 'Devolução de saldo — cliente ausente', category: 'refund', relatedId: order.id });
          }
          const asaasRefundValue = round2(refundAmount - (order.walletApplied || 0));
          if (order.paymentStatus === 'paid' && order.asaasPaymentId && asaasRefundValue > 0) {
            try {
              await refundOrderCharge(order.asaasPaymentId, asaasRefundValue);
              await prisma.order.update({ where: { id: order.id }, data: { asaasChargeStatus: 'refunded', paymentStatus: 'refunded' } });
              refundStatus = 'processed';
            } catch (refundErr) {
              logger.error('Falha no estorno Asaas (cliente ausente) — escala pro admin', refundErr as Error, { orderId: order.id });
              refundStatus = 'pending';
            }
          } else {
            refundStatus = 'processed';
          }
        } else {
          refundStatus = 'processed';
          emitWalletRefund(String(order.customerId), 'user', refundAmount, `Reembolso parcial do pedido ${order.id} - cliente ausente`);
        }
      } catch (walletError: any) {
        if (walletError?.needsManualReview) {
          logger.warn('Reembolso retido para revisão manual — payout já liquidado', { orderId: order.id, payoutErrors: walletError.payoutErrors });
          refundStatus = 'pending';
        } else {
          logger.error('Erro ao reverter pagamento no fluxo cliente ausente', walletError as Error, { orderId: order.id });
          refundStatus = 'failed';
        }
      }
    } else {
      // COD: cliente nunca pagou online — nada a estornar via gateway/carteira.
      refundStatus = 'processed';
    }

    // --- Compensação do motoboy (entrega CHEIA) + AppCashbox (taxa cheia = lastro) ---
    let cancellationFeeCharged = 0;
    // Modo direto: sem Payout/AppCashbox da custódia; a compensação do motoboy é uma
    // MotoboyTransfer gravada junto com o cancelamento (abaixo).
    try {
      if (!direct) await prisma.$transaction(async (tx) => {
        if (fee.motoboyShare > 0) {
          const compPayout = await payoutService.createPendingPayout({
            recipientType: 'motoboy', recipientId: motoboyId,
            orderId: order.id, deliveryId: deliveryRow.id, amount: fee.motoboyShare, tx,
          });
          await payoutService.releasePayout(compPayout.id, tx);
        }
        // Taxa cheia como income — nunca negativa (ver nota de edge no topo da função).
        if (fee.totalFee > 0) {
          cancellationFeeCharged = fee.totalFee;
          await recordCashboxEntry(tx, {
            type: 'income', source: 'cancelled_order', amount: fee.totalFee, orderId: order.id,
            reason: `Taxa de cliente ausente (inclui compensação integral do motoboy a repassar) - Pedido ${order.id}`,
          });
        }
      });
    } catch (feeErr) {
      logger.error('Erro ao aplicar taxa/compensação de cliente ausente', feeErr as Error, { orderId: order.id });
    }

    // Documento de cancelamento. Modo direto (P1): a entrega cheia (fee.motoboyShare) vira
    // MotoboyTransfer ao motoboy na MESMA transação.
    // Pedido direto: a trava do pedido e o estoque entram na mesma transação (R19-a).
    let cancellation: any;
    try {
      ({ cancellation } = await recordCancellationWithCompensation({
        orderId: order.id,
        deliveryId: deliveryRow.id,
        cancelledBy: 'motoboy',
        reason: reason || 'Cliente ausente no momento da entrega',
        reasonCode: (reasonCode as any) || 'customer_unreachable',
        refundAmount,
        refundStatus,
        lateCancellationFee: cancellationFeeCharged > 0 ? cancellationFeeCharged : undefined,
      },
      direct ? { order, deliveryId: deliveryRow.id, motoboyId, motoboyShare: fee.motoboyShare } : null,
      direct ? { orderId: order.id, from: cancellableStatuses, to: 'cancelado', restock: order.products || [] } : undefined));
    } catch (err) {
      if (err instanceof CancellationClaimLostError) {
        return res.status(409).json({ error: 'Pedido já foi cancelado ou está em processamento' });
      }
      throw err;
    }

    // Status já foi para 'cancelado' na trava atômica; grava o vínculo do cancelamento.
    order.status = 'cancelado';
    order.cancellationId = String(cancellation.id);
    // Pedido direto: o vínculo já foi gravado na transação da trava (M4a) — um update aqui só
    // poderia falhar depois do commit e impedir o estorno abaixo.
    if (!direct) await prisma.order.update({ where: { id: order.id }, data: { cancellationId: String(cancellation.id) } });

    // Modo direto: estorno (total - taxa de entrega, P1) pela chave da loja, depois do cancelamento gravado.
    if (direct && refundStatus === 'pending') {
      refundStatus = await settleDirectRefund({ orderId: order.id, cancellationId: String(cancellation.id), amount: directAmount, requestedBy: String(motoboyId) });
    }

    // Produto volta pra loja: mesmo fluxo de devolução com PIN das outras tasks
    // (statusDevolucao='aguardando_confirmacao' + pinDevolucao). Diferente do fluxo
    // do Task 7 (motoboy cancela após pegar), aqui NÃO há decisão pendente do cliente
    // — o pedido já foi definitivamente cancelado acima — então a entrega já vai
    // direto pra 'cancelled' (mesmo estado final usado por `cancelOrderWithFullRefund`).
    const pinDevolucao = generatePin(6);
    const deliveryApi: any = toApiDelivery(await prisma.delivery.findUnique({ where: { id: deliveryRow.id } }));
    if (deliveryApi) {
      deliveryApi.status = 'cancelled';
      deliveryApi.cancelledAt = new Date();
      deliveryApi.statusDevolucao = 'aguardando_confirmacao';
      deliveryApi.pinDevolucao = pinDevolucao;
      deliveryApi.pendingReturnAction = null;
      await persistDelivery(deliveryApi);
      emitDeliveryCancelled(deliveryApi, cancellation, await motoboyCancellationCompensationSafe(String(deliveryApi._id), deliveryApi.motoboyId));

      emitToRoom(`store:${order.storeId}`, 'delivery:return_requested', {
        deliveryId: deliveryApi._id,
        orderId: order.id,
        motoboyId,
        message: 'Cliente ausente na entrega; motoboy vai devolver o produto à loja',
        pinRequired: true,
        returnedAt: new Date(),
      });
    }

    emitOrderCancelled(order, cancellation);

    return res.json({
      success: true,
      orderId: order.id,
      deliveryId: deliveryRow.id,
      status: 'cancelado',
      statusDevolucao: 'aguardando_confirmacao',
      pinDevolucao,
      refundAmount,
      refundStatus,
      cancellationId: cancellation.id,
      motoboyCompensation: fee.motoboyShare,
      appShare: fee.appShare,
    });
  } catch (error: any) {
    logger.error('Erro ao marcar cliente ausente', error as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * Cliente decide após o motoboy cancelar tendo já retirado o produto (spec §3.2).
 * POST /orders/:id/pos-devolucao  body: { escolha: 'reembolso' | 'reentrega' }
 * - reembolso → refund 100% + encerra o pedido (padrão atômico compartilhado).
 * - reentrega → marca pendingReturnAction='reassign'; quando a loja confirmar a
 *   devolução (confirmReturn com PIN), a entrega volta ao pool.
 */
export const posDevolucaoDecision = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: orderId } = req.params as any;
    const { escolha } = req.body;
    const customerId = req.user?.id;

    if (!customerId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    if (!['reembolso', 'reentrega'].includes(escolha)) {
      return res.status(400).json({ error: "escolha inválida — use 'reembolso' ou 'reentrega'" });
    }

    const order: any = toApiOrder(await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude }));
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (String(order.customerId) !== customerId) return res.status(403).json({ error: 'Permissão negada' });

    const delivery: any = order.deliveryId
      ? toApiDelivery(await prisma.delivery.findUnique({ where: { id: String(order.deliveryId) } }))
      : null;
    // Pedido já encerrado: nenhuma decisão pós-devolução vale (nada é gravado).
    if (CLOSED_ORDER_STATUSES.includes(order.status)) {
      return res.status(409).json({ error: 'Pedido já foi encerrado', code: 'ORDER_CLOSED' });
    }
    if (!delivery || delivery.statusDevolucao !== 'aguardando_confirmacao') {
      return res.status(400).json({ error: 'Não há devolução aguardando decisão para este pedido' });
    }

    if (escolha === 'reembolso') {
      const result = await cancelOrderWithFullRefund(order, {
        reason: 'Motoboy cancelou após retirada; cliente optou por reembolso',
        reasonCode: 'motoboy_rejected',
        cancelledBy: 'customer',
      });
      if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
      return res.json({
        success: true,
        escolha,
        orderId: order.id,
        status: 'cancelado',
        refundAmount: result.refundAmount,
        refundStatus: result.refundStatus,
      });
    }

    // reentrega → produto volta à loja (confirmReturn) e daí ao pool via 'reassign'.
    // Pedido travado: um cancelamento concorrente não deixa 'reassign' num pedido encerrado.
    const marked = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM "Order" WHERE id = ${order.id} FOR UPDATE`;
      if (!rows.length || CLOSED_ORDER_STATUSES.includes(rows[0].status)) return 'closed';
      const { count } = await tx.delivery.updateMany({
        where: { id: String(delivery._id), statusDevolucao: 'aguardando_confirmacao' },
        data: { pendingReturnAction: 'reassign' },
      });
      return count === 1 ? 'ok' : 'no_return';
    });
    if (marked === 'closed') return res.status(409).json({ error: 'Pedido já foi encerrado', code: 'ORDER_CLOSED' });
    if (marked === 'no_return') return res.status(400).json({ error: 'Não há devolução aguardando decisão para este pedido' });

    emitToRoom(`store:${order.storeId}`, 'delivery:return_requested', {
      deliveryId: delivery._id,
      orderId: order.id,
      motoboyId: delivery.motoboyId,
      message: 'Cliente optou por reentrega; confirme a devolução com o PIN para reatribuir',
      pinRequired: true,
    });
    emitToRoom(`user:${order.customerId}`, 'order:reentrega_escolhida', {
      orderId: order.id,
      deliveryId: delivery._id,
      message: 'Assim que a loja receber o produto de volta, um novo entregador será atribuído.',
    });

    return res.json({
      success: true,
      escolha,
      orderId: order.id,
      deliveryId: delivery._id,
      message: 'Reentrega escolhida. Aguardando a loja confirmar a devolução para reatribuir.',
    });
  } catch (error: any) {
    logger.error('Erro na decisão pós-devolução do cliente', error as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * Cliente decide após o timeout do pool sem motoboy (spec §6.1).
 * POST /orders/:id/pool-timeout  body: { escolha: 'seguir' | 'cancelar' }
 * - seguir → limpa `awaitingCustomerPoolDecision`; a entrega segue no pool
 *   (o matching existente continua tentando atribuir um motoboy).
 * - cancelar → refund 100% + encerra o pedido (padrão atômico compartilhado).
 * O job (`runPoolTimeout`) NUNCA cancela sozinho — só marca a flag e emite o
 * evento; a decisão de cancelar é sempre do cliente, aqui.
 */
export const poolTimeoutDecision = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: orderId } = req.params as any;
    const { escolha } = req.body;
    const customerId = req.user?.id;

    if (!customerId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    if (!['seguir', 'cancelar'].includes(escolha)) {
      return res.status(400).json({ error: "escolha inválida — use 'seguir' ou 'cancelar'" });
    }

    const order: any = toApiOrder(await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude }));
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (String(order.customerId) !== customerId) return res.status(403).json({ error: 'Permissão negada' });

    if (!order.awaitingCustomerPoolDecision) {
      return res.status(409).json({ error: 'Não há decisão de timeout do pool pendente para este pedido' });
    }

    if (escolha === 'cancelar') {
      const result = await cancelOrderWithFullRefund(order, {
        reason: 'Cliente cancelou após timeout do pool',
        reasonCode: 'motoboy_unavailable',
        cancelledBy: 'customer',
      });
      if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
      await prisma.order.update({ where: { id: order.id }, data: { awaitingCustomerPoolDecision: false } });
      return res.json({
        success: true,
        escolha,
        orderId: order.id,
        status: 'cancelado',
        refundAmount: result.refundAmount,
        refundStatus: result.refundStatus,
      });
    }

    // seguir → limpa a flag; a entrega permanece 'pending' e o matching existente
    // segue tentando atribuir um motoboy normalmente.
    await prisma.order.update({ where: { id: order.id }, data: { awaitingCustomerPoolDecision: false } });

    emitToRoom(`user:${order.customerId}`, 'order:pool_timeout_resolved', {
      orderId: order.id,
      escolha,
      message: 'Continuamos tentando encontrar um entregador para o seu pedido.',
    });

    return res.json({
      success: true,
      escolha,
      orderId: order.id,
      message: 'Seguimos tentando encontrar um entregador.',
    });
  } catch (error: any) {
    logger.error('Erro na decisão de timeout do pool', error as Error);
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

    // Modo direto (decide pelo pedido, P15): loja com Pix ao motoboy falho há mais de
    // transferBlockHours não aceita novos pedidos diretos até regularizar. Custódia não é afetada.
    if (isDirectOrder(order) && (await storeHasOverdueTransfer(String(order.storeId)))) {
      return res.status(409).json({
        error: 'Há repasse Pix a motoboy pendente há muito tempo. Regularize para voltar a aceitar pedidos.',
        code: 'STORE_TRANSFER_PENDING',
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

    // [Plan1] Verificar plano da loja antes de criar Delivery.
    // Pedido do modo direto (asaas_loja): plano único, entrega sempre pelo pool de motoboys —
    // o plano da loja não é consultado. Decide pelo pedido, não pelo settlementMode atual:
    // o pedido termina no modo em que nasceu, mesmo que a plataforma tenha trocado de modo.
    const directFlow = isDirectOrder(order);
    let storePlan = 2;
    if (!directFlow) {
      const storeSub = await findSubByStoreId(String(store.id)); // store vem do Prisma (sem _id)
      const planMap: Record<string, number> = { plan1: 1, plan2: 2, plan3: 3 };
      storePlan = storeSub ? (planMap[(storeSub as any).currentPlan] ?? 1) : (store.plan ?? 1);
    }

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
      // ✅ FONTE ÚNICA: a taxa e a distância da entrega HERDAM do Order (calculados
      // por rota no createOrder via RouteService). NÃO confiar em req.body.distance —
      // era um vetor de divergência/manipulação (mudava a taxa do motoboy no aceite).
      // Só recalcula se, por algum motivo, o Order não tiver a taxa gravada.
      const distance = order.deliveryDistance || 0;
      const fee = order.deliveryFee != null
        ? Number(order.deliveryFee)
        : await calculateDeliveryFeeWithConfig(Number(distance || 0));

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
          routePolyline: order.routePolyline, // rota loja→cliente (p/ mapa do motoboy/cliente)
        },
      }));

      // 🔴 REGISTRAR COMISSÃO DE ENTREGA NO APPCASHBOX
      try {
        const productTotal = (order.products || []).reduce((sum: number, it: any) => sum + (it.price || 0) * (it.quantity || 1), 0);
        logger.debug(`\n🔍 [rejectOrder] REGISTRANDO COMISSÃO DE ENTREGA:`);
        logger.debug(`   📦 Produto total: R$ ${productTotal}`);
        logger.debug(`   🚗 Taxa de entrega: R$ ${fee}`);
        logger.debug(`   📍 Distância: ${distance}km`);
        logger.debug(`   🏪 Store ID: ${order.storeId.toString()}`);
        
        const distribution = await calculateOrderDistribution(productTotal, fee, order.storeId.toString(), Number(distance || 0));
        
        logger.debug(`\n✅ DISTRIBUIÇÃO CALCULADA:`);
        logger.debug(`   💳 Produto App Commission: R$ ${distribution.product.appCommission}`);
        logger.debug(`   🚗 Entrega App Commission: R$ ${distribution.delivery?.appCommission}`);
        logger.debug(`   👤 Motoboy Amount (líquido): R$ ${distribution.delivery?.motoboyAmount}`);

        if (order.paymentMethod === 'cash_on_delivery' && distribution.delivery) {
          await addCommissionToAppCashbox('delivery_commission', distribution.delivery.appCommission, order._id.toString(), delivery._id.toString(), 'Comissão de entrega');
        }

        logger.debug(`✅ COMISSÃO REGISTRADA COM SUCESSO!\n`);
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
 * Loja rejeita/cancela pedido. A regra (taxa pós-aceite, compensação, estorno) está em
 * services/cancellation/storeRule.
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

    const result = await cancelOrderAsStoreRule({ order, requestedBy: userId, reason, reasonCode });
    return res.status(result.status).json(result.body);
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
    // CEO pelo papel ativo; gerente_geral também como papel de equipe da conta (acréscimo).
    const isAdmin = role === 'ceo' || staffRolesOf(req.user as any).includes('gerente_geral');
    if (!isCustomer && !isStoreOwner && !isAdmin) {
      return res.status(403).json({ error: 'Sem permissão para ver este histórico' });
    }

    const cancellations = await prisma.cancellation.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });

    // D3b-1: culpa, autor e motivo interno do cancelamento do admin são só da equipe.
    const history = isAdmin
      ? cancellations
      : cancellations.map(({ faultParty: _fp, adminId: _ad, details, ...rest }) => {
        void _fp; void _ad;
        return rest.cancelledBy === 'admin' ? rest : { ...rest, details };
      });

    return res.json({
      success: true,
      count: history.length,
      history,
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

    // D3b-1: cancelamento do admin com culpa que não é da loja não conta para a loja.
    const cancellations = await prisma.cancellation.findMany({
      where: { orderId: { in: orderIds }, ...countsAgainstWhere('store') },
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
