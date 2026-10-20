import logger from '../../config/logger';

export const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Cancelamento de pedido do modo direto (asaas_loja): o dinheiro está na conta Asaas DA
 * LOJA, então nenhum ramo financeiro da custódia roda (carteira, AppCashbox, Payout,
 * estorno pela conta-mãe). Esta função só dá o status INICIAL do Cancellation: pago e com
 * valor a devolver → 'pending'; senão → 'processed'. O estorno em si (chave da loja) roda
 * DEPOIS de o cancelamento estar gravado, em `settleDirectRefund` — o cancelamento nunca
 * depende do Asaas.
 */
export function directRefundStatus(order: any, flow: string, amount: number): 'pending' | 'processed' {
  if (order?.paymentStatus === 'paid' && amount > 0) {
    logger.info('Pedido do modo direto cancelado já pago — estorno pela conta da loja será pedido', {
      orderId: String(order.id ?? order._id), flow, amount,
    });
    return 'pending';
  }
  return 'processed';
}
