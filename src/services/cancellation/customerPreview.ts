import { prisma } from '../../lib/prisma';
import env from '../../config/env';
import { getPlatformConfig } from '../../repositories/platformConfig.repository';
import { calculateCancellationFee } from '../../utils/cancellationFee';
import { isDirectOrder } from '../../utils/settlement';
import { directCustomerRefund } from '../asaasLoja/directCancellation';
import { cancelFeeConfigOf } from './feeConfig';
import { round2, motoboyOnTheWay } from './shared';
import { CUSTOMER_CANCELLABLE } from './customerRule';

/**
 * Quanto volta se o cliente cancelar AGORA (o `data` do GET /orders/:id/cancel-preview).
 * Só leitura: mesma regra de cancelOrderAsCustomerRule; o cancelamento recalcula na hora.
 */
export async function customerCancelPreview(order: any): Promise<Record<string, unknown>> {
  if (!CUSTOMER_CANCELLABLE.includes(order.status)) {
    return { cancellable: false, reason: 'STATUS', status: order.status };
  }
  const del = order.deliveryId
    ? await prisma.delivery.findUnique({ where: { id: String(order.deliveryId) }, select: { status: true, motoboyId: true, statusDevolucao: true } })
    : null;
  if (del?.statusDevolucao === 'aguardando_confirmacao') {
    return { cancellable: false, reason: 'RETURN_IN_PROGRESS', status: order.status };
  }
  const feeConfig = cancelFeeConfigOf(await getPlatformConfig());
  const motoboyEnRoute = motoboyOnTheWay(order.status, del);
  const fee = calculateCancellationFee({
    actor: 'customer', motoboyInvolved: motoboyEnRoute,
    orderTotal: order.totalValue || 0, deliveryFee: order.deliveryFee || 0, config: feeConfig,
  });
  const direct = isDirectOrder(order);
  const refund = direct ? directCustomerRefund(order, fee, 'customer') : fee.refundToCustomer;
  const paid = order.paymentStatus === 'paid';
  // Para onde volta cada parte — espelha os ramos de cancelOrderAsCustomerRule (sem fórmula nova):
  //  direto: só estorna pela loja se pago (sem carteira no modo direto);
  //  COD: nada volta; custódia sem gateway: o refund inteiro é creditado na carteira;
  //  custódia + Asaas: walletApplied volta à carteira e o provedor estorna
  //  refund − walletApplied só com paymentStatus 'paid' e asaasPaymentId.
  let walletPart = 0;
  let providerPart = 0;
  if (direct) {
    providerPart = paid && refund > 0 ? refund : 0;
  } else if (order.paymentMethod !== 'cash_on_delivery') {
    if (env.PAYMENT_GATEWAY !== 'asaas') {
      walletPart = refund;
    } else {
      walletPart = order.walletApplied && order.walletApplied > 0 ? round2(order.walletApplied) : 0;
      const asaasRefundValue = round2(refund - (order.walletApplied || 0));
      providerPart = paid && order.asaasPaymentId && asaasRefundValue > 0 ? asaasRefundValue : 0;
    }
  }
  return { cancellable: true, fee: fee.totalFee, refund, motoboyEnRoute, direct, paymentMethod: order.paymentMethod, paid, walletPart, providerPart };
}
