export type CancelActor = 'customer' | 'store' | 'motoboy' | 'customer_absent';
export interface CancellationFeeInput {
  actor: CancelActor; motoboyInvolved: boolean;
  orderTotal: number; deliveryFee: number;
  config: { cancelFeeCustomerPercent: number; cancelFeeStorePercent: number; cancelFeeMotoboyPercent: number; lateCancellationMotoboyShare: number };
}
export interface CancellationFeeResult {
  base: number; totalFee: number; payer: 'customer' | 'store' | 'motoboy' | null;
  appShare: number; motoboyShare: number; refundToCustomer: number;
}
const round2 = (n: number) => Math.round(n * 100) / 100;

export function calculateCancellationFee(i: CancellationFeeInput): CancellationFeeResult {
  const { actor, motoboyInvolved, orderTotal, deliveryFee, config } = i;
  if (actor === 'store') {
    const totalFee = round2(deliveryFee * config.cancelFeeStorePercent / 100);
    const motoboyShare = motoboyInvolved ? round2(totalFee * config.lateCancellationMotoboyShare / 100) : 0;
    return { base: deliveryFee, totalFee, payer: 'store', motoboyShare, appShare: round2(totalFee - motoboyShare), refundToCustomer: orderTotal };
  }
  if (actor === 'motoboy') {
    const totalFee = round2(deliveryFee * config.cancelFeeMotoboyPercent / 100);
    return { base: deliveryFee, totalFee, payer: 'motoboy', motoboyShare: 0, appShare: totalFee, refundToCustomer: orderTotal };
  }
  if (actor === 'customer_absent') {
    // Entrega cheia (cliente ausente pra receber): taxa = % do pedido; o motoboy leva a
    // entrega inteira (rodou a viagem completa). Política preservada.
    const totalFee = round2(orderTotal * config.cancelFeeCustomerPercent / 100);
    const motoboyShare = round2(deliveryFee);
    return { base: orderTotal, totalFee, payer: 'customer', motoboyShare, appShare: round2(totalFee - motoboyShare), refundToCustomer: round2(orderTotal - totalFee) };
  }
  // actor === 'customer': a taxa de cancelamento é o VALOR DA ENTREGA, e SÓ quando o
  // motoboy já rodou (`motoboyInvolved` = pedido 'enviado', produto retirado / em rota).
  // A entrega vai INTEIRA pro motoboy (recebe pela ida; a volta ele absorve); o app não
  // fica com nada. Sem motoboy em rota → cancelamento grátis (reembolso cheio).
  if (!motoboyInvolved) {
    return { base: orderTotal, totalFee: 0, payer: null, appShare: 0, motoboyShare: 0, refundToCustomer: round2(orderTotal) };
  }
  const totalFee = round2(deliveryFee);
  return { base: orderTotal, totalFee, payer: 'customer', motoboyShare: round2(deliveryFee), appShare: 0, refundToCustomer: round2(orderTotal - deliveryFee) };
}
