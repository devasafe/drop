import { prisma } from '../../lib/prisma';
import logger from '../../config/logger';
import env from '../../config/env';
import { emitStockChanged } from '../storeIntegration';
import { toApiDelivery, persistDelivery } from '../../repositories/delivery.repository';
import { recordCashboxEntry } from '../../repositories/appCashbox.repository';
import { getPlatformConfig } from '../../repositories/platformConfig.repository';
import { calculateCancellationFee } from '../../utils/cancellationFee';
import { emitOrderCancelled, emitOrderRejectedByStore, emitDeliveryCancelled, emitWalletRefund } from '../../utils/socketEmitter';
import walletService from '../wallet.prisma.service';
import payoutService from '../payout.service';
import { refundOrderCharge } from '../asaas/refund';
import { isDirectOrder } from '../../utils/settlement';
import { motoboyCancellationCompensationSafe } from '../motoboyCompensation';
import {
  directCustomerRefund, settleDirectRefund, recordCancellationWithCompensation, CancellationClaimLostError,
} from '../asaasLoja/directCancellation';
import { cancelFeeConfigOf } from './feeConfig';
import { directRefundStatus } from './shared';
import { ADMIN_CANCELLABLE_STATUSES, AdminCancelActor, CancelRuleResult, adminCancellationFields } from './types';

/** A loja cancela SÓ até um motoboy aceitar a corrida ('enviado' fica de fora). */
export const STORE_CANCELLABLE = ['criado', 'pago', 'aguardando_motoboy'];

export interface StoreCancelInput {
  /** Pedido na forma de API (toApiOrder), com a posse da loja já conferida por quem chama. */
  order: any;
  /** DirectRefund.requestedBy do modo direto: o dono da loja, ou o admin. */
  requestedBy: string;
  reason?: string;
  reasonCode?: string;
  /** Cancelamento do admin com culpa da loja (D3b-1). */
  admin?: AdminCancelActor;
  /** Texto livre gravado em Cancellation.details (o motivo do admin). */
  details?: string;
}

/**
 * Regra da recusa/cancelamento pela LOJA. Antes do aceite: rejeição pura, refund 100%, sem
 * taxa. Depois do aceite: taxa da loja (base = entrega), que inclui a compensação do motoboy.
 * O cliente recebe sempre 100%. Com `admin` (culpa da loja, spec D3b-1 4.2), vale também com
 * o motoboy já na corrida ou o pedido em rota, e o pedido termina em 'cancelado'.
 */
export async function cancelOrderAsStoreRule(input: StoreCancelInput): Promise<CancelRuleResult> {
  const { order, requestedBy, reason, reasonCode, admin, details } = input;
  const orderId = String(order.id);
  const allowed: string[] = admin ? [...ADMIN_CANCELLABLE_STATUSES] : STORE_CANCELLABLE;
  const targetStatus: 'cancelado' | 'rejeitado' = admin ? 'cancelado' : 'rejeitado';

  if (!allowed.includes(order.status)) {
    return { status: 400, refusal: 'NOT_CANCELLABLE', body: { error: `Pedido não pode ser cancelado no estado: ${order.status}` } };
  }

  // Carrega a entrega CEDO para BLOQUEAR a loja assim que um motoboy ACEITA a corrida (o
  // order.status continua 'aguardando_motoboy' depois do aceite). O admin não tem esse bloqueio.
  const delivery = order.deliveryId
    ? await prisma.delivery.findUnique({ where: { id: String(order.deliveryId) }, select: { id: true, status: true, motoboyId: true } })
    : null;
  if (!admin && delivery?.motoboyId) {
    return {
      status: 400,
      refusal: 'MOTOBOY_ACCEPTED',
      body: { error: 'Um motoboy já aceitou a corrida; cancelamento bloqueado', code: 'MOTOBOY_ACCEPTED_CANNOT_CANCEL' },
    };
  }

  // Aceite da loja: divisor entre REJEITAR (antes do aceite, sem taxa) e CANCELAR
  // (após o aceite, taxa da entrega — spec §3.2). `isLate` continua só como rótulo.
  const storeAccepted = !!order.acceptedAt;
  // Etapa real (D3b-1 B2): retirada = 'picked'. Para a loja nada muda (entrega retirada tem
  // motoboy e o guard acima barra); vale para o admin com culpa da loja.
  const isLate = order.status === 'enviado' || delivery?.status === 'picked';
  const isCashOnDelivery = order.paymentMethod === 'cash_on_delivery';
  const useAsaas = env.PAYMENT_GATEWAY === 'asaas';
  const refundAmount = order.totalValue || 0;
  let refundStatus: 'pending' | 'processed' | 'failed' = 'processed';

  // Trava atômica: só UM request move o pedido. Pedido direto (R19-a): trava + estoque
  // dentro da transação do registro (abaixo).
  const direct = isDirectOrder(order);
  // Motoboy que aceitou entre o guard e a trava (relido depois da trava).
  let acceptedMidwayMotoboyId: string | null = null;
  if (!direct) {
    const claim = await prisma.order.updateMany({
      where: { id: orderId, status: { in: allowed as any } },
      data: { status: targetStatus, cancelledAt: new Date() },
    });
    if (claim.count === 0) {
      return { status: 409, refusal: 'CLAIM_LOST', body: { error: 'Pedido já foi rejeitado/cancelado ou está em processamento' } };
    }

    // Entrega ainda no pool: cancela de forma condicional (`motoboyId: null`). count 0 =
    // um motoboy está na entrega → ele segue o caminho de compensação (taxa da loja com
    // motoboy envolvido). Depois da trava, o aceite não passa mais (claimDelivery exige o
    // pedido aberto).
    if (order.deliveryId) {
      const cancelPending = await prisma.delivery.updateMany({
        where: { id: String(order.deliveryId), status: 'pending', motoboyId: null },
        data: { status: 'cancelled', cancelledAt: new Date() },
      });
      if (cancelPending.count === 0) {
        const fresh = await prisma.delivery.findUnique({ where: { id: String(order.deliveryId) }, select: { motoboyId: true } });
        acceptedMidwayMotoboyId = fresh?.motoboyId ?? null;
      }
    }

    // Devolver estoque (uma única vez, graças à trava atômica acima)
    for (const it of (order.products || [])) {
      if ((it as any).productId && (it as any).quantity) {
        await prisma.product.updateMany({ where: { id: String((it as any).productId) }, data: { quantity: { increment: (it as any).quantity } } });
      }
    }
    // As duas chamadas abaixo existem desde antes da extração (duplicadas na origem);
    // mantidas para não mudar comportamento nesta fase.
    void emitStockChanged(String(order.storeId), (order.products || []).map((it: any) => String(it.productId)).filter(Boolean));
    void emitStockChanged(String(order.storeId), (order.products || []).map((it: any) => String(it.productId)).filter(Boolean));
  }

  // Cancelar payouts + reembolsar cliente + debitar AppCashbox.
  const directAmount = direct ? directCustomerRefund(order, null, 'full') : 0;
  if (direct) {
    refundStatus = directRefundStatus(order, 'rejeição pela loja', directAmount);
  } else if (!isCashOnDelivery) {
    try {
      await prisma.$transaction(async (tx) => {
        const result = await payoutService.cancelPayoutsForOrder(orderId, 'order_rejected_by_store', tx);
        if (result.errors.length > 0) {
          // Payout já liquidado — não reembolsar cego; escala pro admin.
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

  // Taxa de cancelamento da loja — SÓ após o aceite. COD preserva o comportamento legado
  // (taxa só quando `isLate`), para o bloco de taxa e o de liberação da reserva COD ficarem
  // MUTUAMENTE EXCLUSIVOS. Modo direto: sem carteira da loja/AppCashbox — taxa não cobrada aqui.
  const chargeStoreFee = !direct && storeAccepted && (!isCashOnDelivery || isLate);
  let cancellationFeeCharged = 0;
  if (chargeStoreFee) {
    try {
      const feeConfig = cancelFeeConfigOf(await getPlatformConfig());
      const compMotoboyId: string | null = delivery?.motoboyId ?? acceptedMidwayMotoboyId;
      const fee = calculateCancellationFee({
        actor: 'store',
        motoboyInvolved: !!compMotoboyId,
        orderTotal: order.totalValue || 0,
        deliveryFee: order.deliveryFee || 0,
        config: feeConfig,
      });
      cancellationFeeCharged = fee.totalFee;

      if (fee.totalFee > 0) {
        await prisma.$transaction(async (tx) => {
          // Debita a taxa da carteira da loja (do bucket bloqueado no COD, do saldo senão).
          const w = await walletService.getOrCreate(String(order.storeId), 'store', tx);
          if (isCashOnDelivery) {
            const newBlocked = Math.max(0, Number(w.blockedBalance) - fee.totalFee);
            await tx.wallet.update({ where: { id: w.id }, data: { blockedBalance: newBlocked, totalSpent: { increment: fee.totalFee } } });
            await tx.walletEntry.create({ data: { walletId: w.id, type: 'debit', category: 'penalty', amount: fee.totalFee, reason: 'Taxa de cancelamento pós-aceite - loja', reference: `CANCEL_STORE_${orderId}` } });
          } else {
            await walletService.debit(
              { owner: String(order.storeId), ownerType: 'store', amount: fee.totalFee, reason: 'Taxa de cancelamento pós-aceite - loja', category: 'penalty', reference: `CANCEL_STORE_${orderId}` },
              tx,
            );
          }

          // Compensação do motoboy: Payout released.
          if (fee.motoboyShare > 0 && compMotoboyId) {
            const compPayout = await payoutService.createPendingPayout({
              recipientType: 'motoboy', recipientId: compMotoboyId,
              orderId: order.id, deliveryId: String(order.deliveryId), amount: fee.motoboyShare, tx,
            });
            await payoutService.releasePayout(compPayout.id, tx);
          }

          // Multa INTEIRA no AppCashbox (lastro do Payout do motoboy).
          await recordCashboxEntry(tx, {
            type: 'income', source: 'cancelled_order', amount: fee.totalFee, orderId,
            reason: `Taxa cancelamento loja pós-aceite (inclui compensação do motoboy a repassar) - Pedido ${orderId}`,
          });
        });
      }
    } catch (feeErr) {
      logger.error('Erro ao cobrar taxa de cancelamento da loja', feeErr as Error, { orderId });
    }
  }

  // Modo direto: a multa da loja não é cobrada (sem carteira), mas o motoboy que está na
  // corrida recebe a parte da fórmula (calculateCancellationFee actor 'store') pela conta da
  // loja. A entrega `pending` é cancelada na MESMA transação da trava por updateMany
  // condicional (`motoboyId: null`): count 1 = ninguém na corrida (sem compensação); count 0
  // = há motoboy → relido pelo `tx` e compensado (se a loja já tinha aceitado o pedido).
  let directCompensation: Parameters<typeof recordCancellationWithCompensation>[1] = null;
  if (direct && order.deliveryId) {
    let storeShare = 0;
    if (storeAccepted) {
      storeShare = calculateCancellationFee({
        actor: 'store',
        motoboyInvolved: true,
        orderTotal: order.totalValue || 0,
        deliveryFee: order.deliveryFee || 0,
        config: cancelFeeConfigOf(await getPlatformConfig()),
      }).motoboyShare;
    }
    directCompensation = async (tx) => {
      const cancelPending = await tx.delivery.updateMany({
        where: { id: String(order.deliveryId), status: 'pending', motoboyId: null },
        data: { status: 'cancelled', cancelledAt: new Date() },
      });
      if (cancelPending.count === 1 || !storeAccepted) return null;
      const fresh = await tx.delivery.findUnique({ where: { id: String(order.deliveryId) }, select: { motoboyId: true } });
      return fresh?.motoboyId
        ? { order, deliveryId: order.deliveryId, motoboyId: fresh.motoboyId, motoboyShare: storeShare }
        : null;
    };
  }

  // Documento de cancelamento (com a compensação do motoboy na mesma transação).
  // Pedido direto: a trava do pedido e o estoque entram na mesma transação (R19-a).
  let cancellation: any;
  try {
    ({ cancellation } = await recordCancellationWithCompensation({
      orderId: order.id,
      deliveryId: order.deliveryId || undefined,
      cancelledBy: 'store',
      ...adminCancellationFields(admin),
      reason: reason || 'Rejeitado pela loja',
      reasonCode: isLate ? 'late_cancellation' : ((reasonCode as any) || 'store_rejected'),
      ...(details ? { details } : {}),
      refundAmount,
      refundStatus,
      isLateCancellation: isLate,
      lateCancellationFee: cancellationFeeCharged > 0 ? cancellationFeeCharged : undefined,
    },
    directCompensation,
    direct ? { orderId: order.id, from: allowed, to: targetStatus, restock: order.products || [] } : undefined));
  } catch (err) {
    if (err instanceof CancellationClaimLostError) {
      return { status: 409, refusal: 'CLAIM_LOST', body: { error: 'Pedido já foi rejeitado/cancelado ou está em processamento' } };
    }
    throw err;
  }
  if (direct) {
    // Estoque voltou (cancelamento) → avisa os webhooks de integração da loja (pós-commit).
    void emitStockChanged(String(order.storeId), (order.products || []).map((it: any) => String(it.productId)).filter(Boolean));
  }

  // Status já foi para o estado final na trava atômica; grava o vínculo do cancelamento.
  order.status = targetStatus;
  order.cancellationId = String(cancellation.id);
  // Pedido direto: o vínculo já foi gravado na transação da trava (M4a).
  if (!direct) await prisma.order.update({ where: { id: order.id }, data: { cancellationId: String(cancellation.id) } });

  // Modo direto: estorno integral pela chave da loja, depois do cancelamento gravado.
  if (direct && refundStatus === 'pending') {
    refundStatus = await settleDirectRefund({ orderId: order.id, cancellationId: String(cancellation.id), amount: directAmount, requestedBy });
  }

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
    const deliveryDoc: any = toApiDelivery(await prisma.delivery.findUnique({ where: { id: String(order.deliveryId) } }));
    if (deliveryDoc && deliveryDoc.status !== 'delivered') {
      deliveryDoc.status = 'cancelled';
      deliveryDoc.cancelledAt = new Date();
      await persistDelivery(deliveryDoc);
      emitDeliveryCancelled(deliveryDoc, cancellation, await motoboyCancellationCompensationSafe(String(deliveryDoc._id), deliveryDoc.motoboyId));
    }
  }

  if (!admin) emitOrderRejectedByStore(order, reason);
  emitOrderCancelled(order, cancellation);

  return {
    status: 200,
    body: {
      success: true,
      orderId: order._id,
      status: 'cancelado',
      reason,
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
