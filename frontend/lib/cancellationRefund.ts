// Quando o cancelamento tem estorno de verdade para mostrar. O backend grava
// refundAmount = total do pedido em todo cancelamento (também quando nada foi cobrado),
// então o valor sozinho não prova que houve dinheiro devolvido.

/** `paymentStatus` 'pending'/'failed' = o pedido nunca foi pago: não há estorno. */
export const neverCharged = (paymentStatus?: string | null): boolean =>
  paymentStatus === 'pending' || paymentStatus === 'failed';

/** Dinheiro na entrega: nada foi cobrado pelo app, não há estorno. */
export const isCashOnDelivery = (paymentMethod?: string | null): boolean =>
  paymentMethod === 'cash_on_delivery' || paymentMethod === 'money';

/**
 * A linha de reembolso do cancelamento vale para este pedido? Não vale quando o pedido
 * não foi pago, quando era dinheiro na entrega ou quando é pedido direto com estorno
 * próprio (`directRefund` da loja / `customerRefund` do cliente), que já tem o seu card.
 * Sem o pedido não dá para saber: não mostra.
 */
export function showsCancellationRefund(order: any): boolean {
  if (!order) return false;
  if (neverCharged(order.paymentStatus)) return false;
  if (isCashOnDelivery(order.paymentMethod)) return false;
  if (order.directRefund || order.customerRefund) return false;
  return true;
}
