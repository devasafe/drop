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
  // customer | customer_absent → base = total
  const totalFee = round2(orderTotal * config.cancelFeeCustomerPercent / 100);
  let motoboyShare = 0;
  if (actor === 'customer_absent') motoboyShare = round2(deliveryFee);            // entrega cheia
  else if (motoboyInvolved) motoboyShare = round2(totalFee * config.lateCancellationMotoboyShare / 100);
  return { base: orderTotal, totalFee, payer: 'customer', motoboyShare, appShare: round2(totalFee - motoboyShare), refundToCustomer: round2(orderTotal - totalFee) };
}
