import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import logger from '../../config/logger';
import env from '../../config/env';
import { emitStockChanged } from '../storeIntegration';
import { toApiDelivery, persistDelivery } from '../../repositories/delivery.repository';
import { recordCashboxEntry } from '../../repositories/appCashbox.repository';
import { getPlatformConfig } from '../../repositories/platformConfig.repository';
import { calculateCancellationFee } from '../../utils/cancellationFee';
import { emitOrderCancelled, emitDeliveryCancelled, emitWalletRefund } from '../../utils/socketEmitter';
import walletService from '../wallet.prisma.service';
import payoutService from '../payout.service';
import { notifyStore, STORE_LINKS } from '../storeNotify';
import { createDebt } from '../../repositories/customerDebt.repository';
import { getPaymentProvider } from '../paymentProvider';
import { isDirectOrder } from '../../utils/settlement';
import { motoboyCancellationCompensationSafe } from '../motoboyCompensation';
import {
  directCustomerRefund, settleDirectRefund, recordCancellationWithCompensation, CancellationClaimLostError,
} from '../asaasLoja/directCancellation';
import { cancelFeeConfigOf } from './feeConfig';
import { round2, directRefundStatus, motoboyOnTheWay } from './shared';
import { AdminCancelActor, CancelRuleResult, adminCancellationFields } from './types';

/** Estados em que o cliente pode cancelar — os MESMOS do cancelamento e da prévia. */
export const CUSTOMER_CANCELLABLE = ['criado', 'pago', 'aguardando_motoboy', 'enviado'];

/** Cancelamento do cliente (pedido direto): devolução em andamento descoberta depois da trava. */
class CancelReturnInProgressError extends Error {
  constructor() { super('RETURN_IN_PROGRESS'); this.name = 'CancelReturnInProgressError'; }
}
/** Cancelamento do cliente (pedido direto): o envolvimento do motoboy mudou depois da leitura. */
class CancelDeliveryChangedError extends Error {
  constructor() { super('DELIVERY_CHANGED'); this.name = 'CancelDeliveryChangedError'; }
}

const RETURN_IN_PROGRESS_BODY = { error: 'RETURN_IN_PROGRESS', message: 'Devolução em andamento; use a decisão pós-devolução.' };

export interface CustomerCancelInput {
  /** Pedido na forma de API (toApiOrder), com a posse já conferida por quem chama. */
  order: any;
  /** DirectRefund.requestedBy do modo direto: o cliente, ou o admin. */
  requestedBy: string;
  reason?: string;
  reasonCode?: string;
  /** Cancelamento do admin com culpa do cliente (D3b-1). */
  admin?: AdminCancelActor;
  /** Texto livre gravado em Cancellation.details (o motivo do admin). */
  details?: string;
}

/**
 * Regra do cancelamento pelo CLIENTE (taxa = valor da entrega só com o motoboy em rota).
 * Transição: estado cancelável → 'cancelado'. O reembolso é processado na hora.
 */
export async function cancelOrderAsCustomerRule(input: CustomerCancelInput): Promise<CancelRuleResult> {
  const { order, requestedBy, reason, reasonCode, admin, details } = input;
  const orderId = String(order.id);
  const customerId = String(order.customerId);

  // Estados canceláveis pelo cliente. Inclui 'aguardando_motoboy' (loja já aceitou) — o
  // reembolso é GRÁTIS/total até o motoboy retirar o pedido
  // (ver motoboyEnRoute/fee abaixo: taxa só vale com a entrega retirada, motoboyOnTheWay).
  const cancellableStatuses = CUSTOMER_CANCELLABLE;
  if (!cancellableStatuses.includes(order.status)) {
    return {
      status: 400,
      refusal: 'NOT_CANCELLABLE',
      body: { error: `Pedido não pode ser cancelado no estado: ${order.status}`, currentStatus: order.status },
    };
  }

  if (order.status === 'entregue') {
    return { status: 400, refusal: 'NOT_CANCELLABLE', body: { error: 'Pedido já foi entregue. Devolução deve ser solicitada.' } };
  }

  const isCashOnDelivery = order.paymentMethod === 'cash_on_delivery';
  const useAsaas = env.PAYMENT_GATEWAY === 'asaas';

  const cfg = await getPlatformConfig();
  const feeConfig = cancelFeeConfigOf(cfg);
  let compMotoboyId: string | null = null;
  let deliveryForGuard: { status: string; motoboyId: string | null; statusDevolucao: string | null } | null = null;
  if (order.deliveryId) {
    const del = await prisma.delivery.findUnique({ where: { id: String(order.deliveryId) }, select: { status: true, motoboyId: true, statusDevolucao: true } });
    deliveryForGuard = del ?? null;
    compMotoboyId = del?.motoboyId ?? null;
  }

  // Guard "devolução em andamento": depois que o motoboy cancela PÓS-PICKUP, a ação correta
  // é POST /orders/:id/pos-devolucao. Checado ANTES da trava: nada é reivindicado.
  if (deliveryForGuard?.statusDevolucao === 'aguardando_confirmacao') {
    return { status: 409, refusal: 'RETURN_IN_PROGRESS', body: { ...RETURN_IN_PROGRESS_BODY } };
  }

  const motoboyInvolved = !!order.deliveryId && !!compMotoboyId;
  // Taxa do CLIENTE = valor da entrega, só com o motoboy em rota (entrega retirada, D3b-1 B2); a
  // entrega vai inteira pro motoboy. Antes disso, cancelamento grátis (reembolso cheio).
  let motoboyEnRoute = motoboyOnTheWay(order.status, deliveryForGuard);
  // `isLate` rotula o cancelamento tardio e separa a multa COD da liberação da reserva COD:
  // segue a mesma etapa da taxa.
  let isLate = motoboyEnRoute;
  let fee = calculateCancellationFee({
    actor: 'customer',
    motoboyInvolved: motoboyEnRoute,
    orderTotal: order.totalValue || 0,
    deliveryFee: order.deliveryFee || 0,
    config: feeConfig,
  });
  // Refund DESCONTADO: o cliente recebe o total menos a taxa (o desconto é a "cobrança").
  let refundAmount = fee.refundToCustomer;
  let refundStatus: 'pending' | 'processed' | 'failed' = 'pending';

  // Trava atômica: UPDATE condicional `WHERE status IN (canceláveis)`; só um request vence.
  // Pedido direto (R19-a): a trava e o estoque rodam DENTRO da transação que grava o
  // Cancellation e a compensação do motoboy (recordCancellationWithCompensation).
  const direct = isDirectOrder(order);
  if (!direct) {
    // Trava + releitura da entrega na MESMA transação: devolução em andamento descoberta
    // depois da leitura desfaz a trava — antes de qualquer dinheiro se mover.
    let fresh: { status: string; motoboyId: string | null; statusDevolucao: string | null } | null = null;
    try {
      const claimed = await prisma.$transaction(async (tx) => {
        const claim = await tx.order.updateMany({
          where: { id: orderId, status: { in: cancellableStatuses as any } },
          data: { status: 'cancelado', cancelledAt: new Date() },
        });
        if (claim.count === 0) return false;
        if (order.deliveryId) {
          fresh = await tx.delivery.findUnique({ where: { id: String(order.deliveryId) }, select: { status: true, motoboyId: true, statusDevolucao: true } });
          if (fresh?.statusDevolucao === 'aguardando_confirmacao') throw new CancelReturnInProgressError();
        }
        return true;
      });
      if (!claimed) {
        return { status: 409, refusal: 'CLAIM_LOST', body: { error: 'Pedido já foi cancelado ou está em processamento' } };
      }
    } catch (err) {
      if (err instanceof CancelReturnInProgressError) {
        return { status: 409, refusal: 'RETURN_IN_PROGRESS', body: { ...RETURN_IN_PROGRESS_BODY } };
      }
      throw err;
    }

    // Entrega relida DEPOIS da trava: quem assumiu a entrega no meio é compensado, e uma
    // retirada no meio passa a cobrar a taxa. Taxa e reembolso são recalculados.
    if (order.deliveryId) {
      const freshRow = fresh as { status: string; motoboyId: string | null } | null;
      const freshMotoboy = freshRow?.motoboyId ?? null;
      const freshOnTheWay = motoboyOnTheWay(order.status, freshRow);
      if (freshMotoboy !== compMotoboyId || freshOnTheWay !== motoboyEnRoute) {
        logger.warn('[cancelOrder] entrega mudou entre a leitura e a trava — relida', { orderId, before: compMotoboyId, after: freshMotoboy });
        compMotoboyId = freshMotoboy;
        motoboyEnRoute = freshOnTheWay;
        isLate = freshOnTheWay;
        fee = calculateCancellationFee({
          actor: 'customer',
          motoboyInvolved: freshOnTheWay,
          orderTotal: order.totalValue || 0,
          deliveryFee: order.deliveryFee || 0,
          config: feeConfig,
        });
        refundAmount = fee.refundToCustomer;
      }
    }

    // Devolver estoque (uma única vez, graças à trava acima).
    for (const it of (order.products || [])) {
      if ((it as any).productId && (it as any).quantity) {
        await prisma.product.updateMany({ where: { id: String((it as any).productId) }, data: { quantity: { increment: (it as any).quantity } } });
      }
    }
    // Estoque voltou (cancelamento) → avisa os webhooks de integração da loja.
    void emitStockChanged(String(order.storeId), (order.products || []).map((it: any) => String(it.productId)).filter(Boolean));
  }

  const directAmount = direct ? directCustomerRefund(order, fee, 'customer') : 0;
  if (direct) {
    refundStatus = directRefundStatus(order, 'cancelamento pelo cliente', directAmount);
  } else if (!isCashOnDelivery) {
    // Cancelar payouts + reembolsar cliente + debitar AppCashbox.
    try {
      await prisma.$transaction(async (tx) => {
        const result = await payoutService.cancelPayoutsForOrder(orderId, 'order_cancelled', tx);
        if (result.errors.length > 0) {
          // Payout já requested/paid: NÃO reembolsar automaticamente (risco de gasto duplo).
          throw Object.assign(new Error('PAYOUT_ALREADY_SETTLED'), {
            needsManualReview: true,
            payoutErrors: result.errors,
          });
        }

        // Fluxo legado (carteira virtual): credita cliente + debita AppCashbox.
        // Em modo Asaas, o estorno é REAL (fora da transação, abaixo).
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
        // Estorno REAL no Asaas: exclui o walletApplied (já voltou pela carteira acima).
        const asaasRefundValue = round2(refundAmount - (order.walletApplied || 0));
        if (order.paymentStatus === 'paid' && order.asaasPaymentId && asaasRefundValue > 0) {
          try {
            const refundRes = await getPaymentProvider(order.paymentProvider)
              .refund(order.id, order.asaasPaymentId!, asaasRefundValue);
            if (refundRes.status !== 'done') {
              throw new Error(refundRes.errorMessage || 'estorno não concluído');
            }
            order.asaasChargeStatus = 'refunded';
            order.paymentStatus = 'refunded';
            await prisma.order.update({ where: { id: order.id }, data: { asaasChargeStatus: 'refunded', paymentStatus: 'refunded' } });
            refundStatus = 'processed';
          } catch (refundErr) {
            logger.error('Falha no estorno Asaas — escala pro admin', refundErr as Error, { orderId });
            refundStatus = 'pending';
          }
        } else {
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

  // Distribuição da taxa: paid (não-COD) — a taxa já saiu do refund; aqui só o repasse do
  // motoboy (Payout released) e a taxa cheia como income. COD — multa da reserva da loja +
  // CustomerDebt, só no cancelamento tardio.
  let cancellationFeeCharged = 0;
  try {
    if (direct) {
      // Modo direto: a compensação do motoboy é uma MotoboyTransfer gravada com o cancelamento.
    } else if (isCashOnDelivery) {
      if (isLate && fee.totalFee > 0) {
        cancellationFeeCharged = fee.totalFee;
        const debtToCreate = { customerId, amount: fee.totalFee, sourceOrderId: order.id, status: 'pending', reason: 'Multa de cancelamento tardio em pedido pagar na entrega' };
        await prisma.$transaction(async (tx) => {
          // Fee sai do blockedBalance da loja (cliente não pagou nada).
          const w = await walletService.getOrCreate(String(order.storeId), 'store', tx);
          const newBlocked = Math.max(0, Number(w.blockedBalance) - fee.totalFee);
          await tx.wallet.update({
            where: { id: w.id },
            data: { blockedBalance: newBlocked, totalSpent: { increment: fee.totalFee } },
          });

          // Compensação do motoboy: Payout released (reconciliável e sacável).
          if (fee.motoboyShare > 0 && compMotoboyId) {
            const compPayout = await payoutService.createPendingPayout({
              recipientType: 'motoboy', recipientId: compMotoboyId,
              orderId: order.id, deliveryId: String(order.deliveryId), amount: fee.motoboyShare, tx,
            });
            await payoutService.releasePayout(compPayout.id, tx);
          }

          // Taxa INTEIRA no AppCashbox (dá lastro ao Payout do motoboy).
          await recordCashboxEntry(tx, {
            type: 'income', source: 'cancelled_order', amount: fee.totalFee, orderId,
            reason: `Taxa de cancelamento COD (inclui compensação do motoboy a repassar) - Pedido ${orderId}`,
          });
        });
        await createDebt(debtToCreate);
      }
    } else if (fee.totalFee > 0) {
      cancellationFeeCharged = fee.totalFee;
      await prisma.$transaction(async (tx) => {
        // Parte do motoboy: Payout released. A taxa já saiu do refund do cliente.
        if (fee.motoboyShare > 0 && compMotoboyId) {
          const compPayout = await payoutService.createPendingPayout({
            recipientType: 'motoboy', recipientId: compMotoboyId,
            orderId: order.id, deliveryId: String(order.deliveryId), amount: fee.motoboyShare, tx,
          });
          await payoutService.releasePayout(compPayout.id, tx);
        }

        // Taxa INTEIRA como income (lastro do Payout do motoboy).
        await recordCashboxEntry(tx, {
          type: 'income', source: 'cancelled_order', amount: fee.totalFee, orderId,
          reason: `Taxa de cancelamento (inclui compensação do motoboy a repassar) - Pedido ${orderId}`,
        });
      });
    }
  } catch (feeErr) {
    logger.error('Erro ao aplicar taxa de cancelamento do cliente', feeErr as Error, { orderId });
  }

  // Documento de cancelamento. Modo direto: a parte do motoboy vira MotoboyTransfer na MESMA
  // transação, e a trava do pedido e o estoque também (R19-a).
  let cancellation: any;
  try {
    ({ cancellation } = await recordCancellationWithCompensation({
      orderId: order.id,
      deliveryId: order.deliveryId || undefined,
      cancelledBy: 'customer',
      ...adminCancellationFields(admin),
      reason: reason || 'Solicitado pelo cliente',
      reasonCode: isLate ? 'late_cancellation' : ((reasonCode as any) || 'customer_request'),
      ...(details ? { details } : {}),
      refundAmount,
      refundStatus,
      isLateCancellation: isLate,
      lateCancellationFee: cancellationFeeCharged > 0 ? cancellationFeeCharged : undefined,
    },
    // Pedido direto: a entrega é relida pelo `tx` DEPOIS da trava. Devolução em andamento →
    // desfaz tudo (RETURN_IN_PROGRESS); envolvimento do motoboy mudou com o pedido em rota →
    // desfaz tudo (DELIVERY_CHANGED); senão, a compensação vai a quem está na entrega agora.
    direct ? (async (tx: Prisma.TransactionClient) => {
      if (!order.deliveryId) return null;
      const fresh = await tx.delivery.findUnique({ where: { id: String(order.deliveryId) }, select: { status: true, motoboyId: true, statusDevolucao: true } });
      if (fresh?.statusDevolucao === 'aguardando_confirmacao') throw new CancelReturnInProgressError();
      // A etapa mudou entre a leitura e a trava (retirada no meio, ou o motoboy saiu): a taxa e o
      // estorno já calculados não valem mais → desfaz tudo, o cliente tenta de novo.
      if (motoboyOnTheWay(order.status, fresh) !== motoboyEnRoute) throw new CancelDeliveryChangedError();
      return fresh?.motoboyId
        ? { order, deliveryId: order.deliveryId, motoboyId: fresh.motoboyId, motoboyShare: fee.motoboyShare }
        : null;
    }) : null,
    direct ? { orderId: order.id, from: cancellableStatuses, to: 'cancelado', restock: order.products || [] } : undefined));
  } catch (err) {
    if (err instanceof CancellationClaimLostError) {
      return { status: 409, refusal: 'CLAIM_LOST', body: { error: 'Pedido já foi cancelado ou está em processamento' } };
    }
    if (err instanceof CancelReturnInProgressError) {
      return { status: 409, refusal: 'RETURN_IN_PROGRESS', body: { ...RETURN_IN_PROGRESS_BODY } };
    }
    if (err instanceof CancelDeliveryChangedError) {
      return {
        status: 409,
        refusal: 'DELIVERY_CHANGED',
        body: { error: 'A entrega mudou enquanto o cancelamento era processado. Tente de novo.', code: 'DELIVERY_CHANGED' },
      };
    }
    throw err;
  }
  if (direct) {
    // Estoque voltou (cancelamento) → avisa os webhooks de integração da loja (pós-commit).
    void emitStockChanged(String(order.storeId), (order.products || []).map((it: any) => String(it.productId)).filter(Boolean));
  }

  // Status já foi para 'cancelado' na trava atômica; grava o vínculo do cancelamento.
  order.status = 'cancelado';
  order.cancellationId = String(cancellation.id);
  // Pedido direto: o vínculo já foi gravado na transação da trava (M4a).
  if (!direct) await prisma.order.update({ where: { id: order.id }, data: { cancellationId: String(cancellation.id) } });

  // Modo direto: estorno pela chave da loja, só depois do cancelamento gravado.
  if (direct && refundStatus === 'pending') {
    refundStatus = await settleDirectRefund({ orderId: order.id, cancellationId: String(cancellation.id), amount: directAmount, requestedBy });
  }

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
      emitDeliveryCancelled(delivery, cancellation, await motoboyCancellationCompensationSafe(String(delivery._id), delivery.motoboyId));
    }
  }

  emitOrderCancelled(order, cancellation);

  // Sino + push pro dono da loja: o cliente cancelou o pedido. O admin manda o aviso dele.
  if (!admin) {
    await notifyStore(String(order.storeId), {
      title: 'Pedido cancelado',
      message: 'O cliente cancelou um pedido da sua loja. Toque para ver.',
      link: STORE_LINKS.order(String(order.id)),
      entityId: String(order.id),
      type: 'order',
      tag: 'pedido-cancelado',
      dedupe: true,
    });
  }

  return {
    status: 200,
    body: {
      success: true,
      orderId: order.id,
      status: 'cancelado',
      refundAmount,
      refundStatus,
      cancellationId: cancellation.id,
      isLateCancellation: isLate,
      lateCancellationFee: cancellationFeeCharged > 0 ? cancellationFeeCharged : undefined,
    },
    cancellation,
    refundAmount,
    refundStatus,
  };
}
