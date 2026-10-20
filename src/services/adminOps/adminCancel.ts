/**
 * D3b-1 · P2.2/P2.3 — cancelar com estorno pelo admin, com culpa (spec 4.2).
 * A prévia só lê e usa as fórmulas das regras de cada ator (P2.1). O cancelamento chama a regra
 * do ator da culpa; a única regra nova de dinheiro é a compensação paga pelo DROP (platform).
 */
import { prisma } from '../../lib/prisma';
import { toApiOrder, orderInclude } from '../../repositories/order.repository';
import { getPlatformConfig } from '../../repositories/platformConfig.repository';
import { calculateCancellationFee } from '../../utils/cancellationFee';
import { isDirectOrder } from '../../utils/settlement';
import { directCustomerRefund } from '../asaasLoja/directCancellation';
import { MoneyActionError } from '../adminMoneyAction.service';
import { cancelFeeConfigOf, CancelFeeConfig } from '../cancellation/feeConfig';
import { motoboyOnTheWay } from '../cancellation/shared';
import { ADMIN_CANCELLABLE_STATUSES } from '../cancellation/types';
import type { CancelFault, CancelPreview } from './types';

export const CANCEL_FAULTS: readonly CancelFault[] = ['customer', 'store', 'motoboy', 'platform'];

export function isCancelFault(v: unknown): v is CancelFault {
  return typeof v === 'string' && (CANCEL_FAULTS as readonly string[]).includes(v);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface CancelTargetDelivery {
  id: string;
  status: string;
  motoboyId: string | null;
  statusDevolucao: string | null;
}

/** Pedido (forma de API) e entrega, lidos do mesmo jeito pela prévia e pelo cancelamento. */
export async function loadCancelTarget(orderId: string): Promise<{ order: any; delivery: CancelTargetDelivery | null }> {
  const order: any = toApiOrder(await prisma.order.findUnique({ where: { id: String(orderId) }, include: orderInclude }));
  if (!order) throw new MoneyActionError(404, 'ORDER_NOT_FOUND', 'Pedido não encontrado');
  const delivery = order.deliveryId
    ? await prisma.delivery.findUnique({
      where: { id: String(order.deliveryId) },
      select: { id: true, status: true, motoboyId: true, statusDevolucao: true },
    })
    : null;
  return { order, delivery: delivery as CancelTargetDelivery | null };
}

/** Recusas comuns da prévia e do cancelamento (409 ORDER_NOT_CANCELLABLE). */
export function assertAdminCancellable(order: any, delivery: CancelTargetDelivery | null): void {
  if (!ADMIN_CANCELLABLE_STATUSES.includes(order.status)) {
    throw new MoneyActionError(409, 'ORDER_NOT_CANCELLABLE', 'Este pedido não pode mais ser cancelado.', { currentStatus: order.status });
  }
  if (delivery?.statusDevolucao === 'aguardando_confirmacao') {
    throw new MoneyActionError(409, 'ORDER_NOT_CANCELLABLE', 'Há uma devolução esperando o cliente decidir entre reembolso e reentrega.', {
      currentStatus: order.status, reason: 'RETURN_IN_PROGRESS',
    });
  }
}

/**
 * O que cada culpa faz com o dinheiro. Pedido não pago (aguardando o Pix): nada entrou, então só
 * volta o saldo de carteira usado no pedido (custódia) e a culpa do cliente não retém taxa.
 */
export function computeCancelPreview(order: any, delivery: CancelTargetDelivery | null, fault: CancelFault, fees: CancelFeeConfig): CancelPreview {
  const p = previewByRule(order, delivery, fault, fees);
  if (order.paymentStatus === 'paid') return p;
  const walletBack = isDirectOrder(order) ? 0 : round2(Number(order.walletApplied) || 0);
  return { ...p, customerRefund: walletBack, feeCharged: fault === 'customer' ? 0 : p.feeCharged };
}

/** As mesmas fórmulas das regras da P2.1/P2.1b, para o pedido pago. */
function previewByRule(order: any, delivery: CancelTargetDelivery | null, fault: CancelFault, fees: CancelFeeConfig): CancelPreview {
  const total = Number(order.totalValue) || 0;
  const deliveryFee = Number(order.deliveryFee) || 0;
  const direct = isDirectOrder(order);
  const motoboyId = delivery?.motoboyId ?? null;
  const fullRefund = direct ? directCustomerRefund(order, null, 'full') : total;

  if (fault === 'customer') {
    const motoboyEnRoute = motoboyOnTheWay(order.status, delivery);
    const fee = calculateCancellationFee({ actor: 'customer', motoboyInvolved: motoboyEnRoute, orderTotal: total, deliveryFee, config: fees });
    const comp = motoboyId ? fee.motoboyShare : 0;
    return {
      fault,
      customerRefund: direct ? directCustomerRefund(order, fee, 'customer') : fee.refundToCustomer,
      feeCharged: fee.totalFee,
      motoboyCompensation: comp,
      compensationPaidBy: comp > 0 ? 'customer' : null,
      countsAgainst: 'customer',
    };
  }

  if (fault === 'store') {
    const storeAccepted = !!order.acceptedAt;
    if (direct) {
      const comp = storeAccepted && motoboyId
        ? calculateCancellationFee({ actor: 'store', motoboyInvolved: true, orderTotal: total, deliveryFee, config: fees }).motoboyShare
        : 0;
      return { fault, customerRefund: fullRefund, feeCharged: 0, motoboyCompensation: comp, compensationPaidBy: comp > 0 ? 'store' : null, countsAgainst: 'store' };
    }
    const isCashOnDelivery = order.paymentMethod === 'cash_on_delivery';
    const isLate = order.status === 'enviado' || delivery?.status === 'picked';
    const chargeStoreFee = storeAccepted && (!isCashOnDelivery || isLate);
    const fee = calculateCancellationFee({ actor: 'store', motoboyInvolved: !!motoboyId, orderTotal: total, deliveryFee, config: fees });
    const feeCharged = chargeStoreFee ? fee.totalFee : 0;
    const comp = feeCharged > 0 && motoboyId ? fee.motoboyShare : 0;
    return { fault, customerRefund: fullRefund, feeCharged, motoboyCompensation: comp, compensationPaidBy: comp > 0 ? 'store' : null, countsAgainst: 'store' };
  }

  if (fault === 'motoboy') {
    return { fault, customerRefund: fullRefund, feeCharged: 0, motoboyCompensation: 0, compensationPaidBy: null, countsAgainst: 'motoboy' };
  }

  // platform: entrega cheia ao motoboy, paga pelo DROP (como o cliente ausente); ninguém é culpado.
  const comp = motoboyId ? round2(deliveryFee) : 0;
  return { fault, customerRefund: fullRefund, feeCharged: 0, motoboyCompensation: comp, compensationPaidBy: comp > 0 ? 'platform' : null, countsAgainst: null };
}

/** GET /admin/orders/:id/cancel-preview?fault= — o que vai acontecer, sem mudar nada. */
export async function previewAdminCancel(orderId: string, fault: unknown): Promise<CancelPreview> {
  if (!isCancelFault(fault)) {
    throw new MoneyActionError(400, 'INVALID_FAULT', 'Escolha a culpa: cliente, loja, motoboy ou DROP.');
  }
  const { order, delivery } = await loadCancelTarget(orderId);
  assertAdminCancellable(order, delivery);
  return computeCancelPreview(order, delivery, fault, cancelFeeConfigOf(await getPlatformConfig()));
}
