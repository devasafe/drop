import { prisma } from '../../lib/prisma';
import logger from '../../config/logger';
import env from '../../config/env';
import { emitStockChanged } from '../storeIntegration';
import { toApiDelivery, persistDelivery } from '../../repositories/delivery.repository';
import { recordCashboxEntry } from '../../repositories/appCashbox.repository';
import { emitOrderCancelled, emitDeliveryCancelled, emitWalletRefund } from '../../utils/socketEmitter';
import walletService from '../wallet.prisma.service';
import payoutService from '../payout.service';
import { refundOrderCharge } from '../asaas/refund';
import { notifyStore, STORE_LINKS } from '../storeNotify';
import { isDirectOrder } from '../../utils/settlement';
import { motoboyCancellationCompensationSafe } from '../motoboyCompensation';
import {
  directCustomerRefund, settleDirectRefund, recordCancellationWithCompensation, CancellationClaimLostError,
} from '../asaasLoja/directCancellation';
import { round2, directRefundStatus } from './shared';
import { AdminCancelActor, adminCancellationFields } from './types';

export interface FullRefundOpts {
  reason: string;
  reasonCode: string;
  /** Com `admin`, vira 'admin' no Cancellation (a culpa vai em faultParty). */
  cancelledBy: 'customer' | 'store' | 'motoboy';
  /** Cancelamento do admin com culpa do motoboy ou do DROP (D3b-1). */
  admin?: AdminCancelActor;
  /** Texto livre gravado em Cancellation.details (o motivo do admin). */
  details?: string;
}

/**
 * Cancela um pedido com reembolso INTEGRAL (100%) ao cliente, reusando o padrão atômico de
 * `cancelOrderAsCustomerRule` (trava updateMany+count, guard PAYOUT_ALREADY_SETTLED, refund
 * Asaas/legado, devolução de estoque, cancelamento da entrega). Sem taxa — usado quando a culpa
 * é de outra parte. Recebe o pedido já na forma de API (`toApiOrder`).
 */
export async function cancelOrderWithFullRefund(
  order: any,
  opts: FullRefundOpts,
): Promise<{ ok: boolean; status?: number; error?: string; refundAmount?: number; refundStatus?: string; cancellation?: any }> {
  // Inclui 'aguardando_motoboy': estado de um pedido cuja entrega está no pool sem motoboy
  // (é o estado do ramo 'cancelar' do timeout do pool).
  const cancellableStatuses = ['criado', 'pago', 'aguardando_motoboy', 'enviado'];
  if (!cancellableStatuses.includes(order.status)) {
    return { ok: false, status: 400, error: `Pedido não pode ser cancelado no estado: ${order.status}` };
  }

  const isCashOnDelivery = order.paymentMethod === 'cash_on_delivery';
  const useAsaas = env.PAYMENT_GATEWAY === 'asaas';
  const refundAmount = order.totalValue || 0; // 100%, sem desconto de taxa.
  let refundStatus: 'pending' | 'processed' | 'failed' = 'pending';

  const direct = isDirectOrder(order);

  // Trava atômica: só UM request move de status cancelável → 'cancelado'.
  // Pedido direto (M4b/R19): a trava, o estoque e o vínculo entram na transação do
  // cancelamento, lá embaixo — uma falha desfaz tudo e o estorno nunca fica perdido.
  if (!direct) {
    const claim = await prisma.order.updateMany({
      where: { id: order.id, status: { in: cancellableStatuses as any } },
      data: { status: 'cancelado', cancelledAt: new Date() },
    });
    if (claim.count === 0) {
      return { ok: false, status: 409, error: 'Pedido já foi cancelado ou está em processamento' };
    }

    // Devolver estoque (uma única vez, graças à trava).
    for (const it of (order.products || [])) {
      if ((it as any).productId && (it as any).quantity) {
        await prisma.product.updateMany({ where: { id: String((it as any).productId) }, data: { quantity: { increment: (it as any).quantity } } });
      }
    }
    void emitStockChanged(String(order.storeId), (order.products || []).map((it: any) => String(it.productId)).filter(Boolean));
  }

  const directAmount = direct ? directCustomerRefund(order, null, 'full') : 0;
  if (direct) {
    refundStatus = directRefundStatus(order, opts.reasonCode, directAmount);
  } else if (!isCashOnDelivery) {
    try {
      await prisma.$transaction(async (tx) => {
        const result = await payoutService.cancelPayoutsForOrder(order.id, 'motoboy_returned_customer_refund', tx);
        if (result.errors.length > 0) {
          throw Object.assign(new Error('PAYOUT_ALREADY_SETTLED'), { needsManualReview: true, payoutErrors: result.errors });
        }
        if (!useAsaas) {
          await walletService.credit(
            { owner: String(order.customerId), ownerType: 'user', amount: refundAmount, reason: opts.reason, category: 'refund', relatedId: order.id },
            tx,
          );
          await recordCashboxEntry(tx, { type: 'expense', source: 'order_refund', amount: refundAmount, orderId: order.id, reason: opts.reason });
        }
      });

      if (useAsaas) {
        if (order.walletApplied && order.walletApplied > 0) {
          await walletService.credit({ owner: String(order.customerId), ownerType: 'user', amount: order.walletApplied, reason: 'Devolução de saldo — pedido cancelado', category: 'refund', relatedId: order.id });
        }
        const asaasRefundValue = round2(refundAmount - (order.walletApplied || 0));
        if (order.paymentStatus === 'paid' && order.asaasPaymentId && asaasRefundValue > 0) {
          try {
            await refundOrderCharge(order.asaasPaymentId, asaasRefundValue);
            await prisma.order.update({ where: { id: order.id }, data: { asaasChargeStatus: 'refunded', paymentStatus: 'refunded' } });
            refundStatus = 'processed';
          } catch (refundErr) {
            logger.error('Falha no estorno Asaas (pos-devolucao) — escala pro admin', refundErr as Error, { orderId: order.id });
            refundStatus = 'pending';
          }
        } else {
          refundStatus = 'processed';
        }
      } else {
        refundStatus = 'processed';
        emitWalletRefund(String(order.customerId), 'user', refundAmount, `Reembolso do pedido ${order.id}`);
      }
    } catch (walletError: any) {
      if (walletError?.needsManualReview) {
        logger.warn('Reembolso retido para revisão manual — payout já liquidado', { orderId: order.id, payoutErrors: walletError.payoutErrors });
        refundStatus = 'pending';
      } else {
        logger.error('Erro ao reverter pagamento no reembolso pós-devolução', walletError as Error, { orderId: order.id });
        refundStatus = 'failed';
      }
    }
  } else {
    refundStatus = 'processed';
  }

  const cancellationData = {
    orderId: order.id,
    deliveryId: order.deliveryId || undefined,
    cancelledBy: opts.cancelledBy,
    ...adminCancellationFields(opts.admin),
    reason: opts.reason,
    reasonCode: opts.reasonCode as any,
    ...(opts.details ? { details: opts.details } : {}),
    refundAmount,
    refundStatus,
  };
  let cancellation: any;
  if (direct) {
    try {
      ({ cancellation } = await recordCancellationWithCompensation(
        cancellationData,
        null,
        { orderId: order.id, from: cancellableStatuses, to: 'cancelado', restock: order.products || [] },
      ));
    } catch (err) {
      if (err instanceof CancellationClaimLostError) {
        return { ok: false, status: 409, error: 'Pedido já foi cancelado ou está em processamento' };
      }
      throw err;
    }
    void emitStockChanged(String(order.storeId), (order.products || []).map((it: any) => String(it.productId)).filter(Boolean));
  } else {
    cancellation = await prisma.cancellation.create({ data: cancellationData });
    await prisma.order.update({ where: { id: order.id }, data: { cancellationId: String(cancellation.id) } });
  }

  order.status = 'cancelado';

  // Modo direto: estorno integral pela chave da loja, depois do cancelamento gravado.
  if (direct && refundStatus === 'pending') {
    refundStatus = await settleDirectRefund({
      orderId: order.id, cancellationId: String(cancellation.id), amount: directAmount, requestedBy: opts.admin?.adminId ?? 'system',
    });
  }

  // Cancela a entrega associada E leva o estado de devolução ao TERMINAL (review #1a):
  // `statusDevolucao='confirmado'` + `pinDevolucao=null` fecham o vetor de DUPLO-REEMBOLSO
  // (reembolso + confirmReturn tardio).
  if (order.deliveryId) {
    const delivery: any = toApiDelivery(await prisma.delivery.findUnique({ where: { id: String(order.deliveryId) } }));
    if (delivery && delivery.status !== 'delivered') {
      delivery.status = 'cancelled';
      delivery.cancelledAt = new Date();
      delivery.statusDevolucao = 'confirmado';
      delivery.pinDevolucao = null;
      delivery.pendingReturnAction = null;
      await persistDelivery(delivery);
      emitDeliveryCancelled(delivery, cancellation, await motoboyCancellationCompensationSafe(String(delivery._id), delivery.motoboyId));
    }
  }

  emitOrderCancelled(order, cancellation);

  // Sino + push da loja: timeout de aceite, decisão pós-devolução ou desistência no pool.
  // O admin manda o aviso dele.
  if (!opts.admin) {
    const cancelledOrderId = String(order.id ?? order._id);
    await notifyStore(String(order.storeId), {
      title: 'Pedido cancelado',
      message: opts.reasonCode === 'store_rejected'
        ? 'O prazo para aceitar acabou e o cliente foi reembolsado. Toque para ver.'
        : 'Um pedido foi cancelado e o cliente foi reembolsado. Toque para ver.',
      link: STORE_LINKS.order(cancelledOrderId),
      entityId: cancelledOrderId,
      type: 'order',
      tag: 'pedido-cancelado',
      dedupe: true,
    });
  }
  return { ok: true, refundAmount, refundStatus, cancellation };
}
