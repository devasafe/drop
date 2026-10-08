import logger from '../../config/logger';
import type { CancellationFeeResult } from '../../utils/cancellationFee';
import { requestDirectRefund, executeDirectRefund } from './refund';

export type DirectCancellationFlow = 'customer' | 'customer_absent' | 'store' | 'full';

const round2 = (n: number) => Math.round(Number(n) * 100) / 100;

/**
 * Quanto devolver ao cliente num cancelamento do pedido direto.
 *  - customer_absent: total - taxa de entrega (P1; a entrega cheia fica com o motoboy), ignora o fee.
 *  - full: o total do pedido (a culpa não é do cliente).
 *  - customer / store: fee.refundToCustomer (já descontada a taxa, se houver).
 * Arredondado a 2 casas e nunca negativo.
 */
export function directCustomerRefund(
  order: { totalValue?: unknown; deliveryFee?: unknown },
  fee: Pick<CancellationFeeResult, 'refundToCustomer'> | null | undefined,
  flow: DirectCancellationFlow,
): number {
  const total = Number(order?.totalValue) || 0;
  let value: number;
  if (flow === 'customer_absent') value = total - (Number(order?.deliveryFee) || 0);
  else if (flow === 'full') value = total;
  else value = Number(fee?.refundToCustomer) || 0;
  return Math.max(0, round2(value));
}

/**
 * Pede e executa o estorno do pedido direto DEPOIS de o cancelamento estar gravado.
 * Nunca lança: o cancelamento não depende do Asaas. 'processed' só se o estorno terminou 'done'.
 */
export async function settleDirectRefund(params: {
  orderId: string;
  cancellationId: string;
  amount: number;
  requestedBy: string;
}): Promise<'pending' | 'processed'> {
  try {
    const refund = await requestDirectRefund(params);
    const status = await executeDirectRefund(refund.id);
    return status === 'done' ? 'processed' : 'pending';
  } catch (err) {
    logger.error('Falha ao estornar pedido direto no cancelamento — escala pro admin', err as Error, { orderId: params.orderId });
    return 'pending';
  }
}
