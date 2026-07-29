import { calculateCancellationFee } from '../utils/cancellationFee';

const cfg = {
  cancelFeeCustomerPercent: 10, cancelFeeStorePercent: 10,
  cancelFeeMotoboyPercent: 10, lateCancellationMotoboyShare: 50,
};
const round2 = (n: number) => Math.round(n * 100) / 100;

test('cliente cancela sem MTB: taxa 10% do total, 100% app, refund descontado', () => {
  const r = calculateCancellationFee({ actor: 'customer', motoboyInvolved: false, orderTotal: 100, deliveryFee: 10, config: cfg });
  expect(r.totalFee).toBe(10); expect(r.payer).toBe('customer');
  expect(r.appShare).toBe(10); expect(r.motoboyShare).toBe(0);
  expect(r.refundToCustomer).toBe(90);
});

test('cliente cancela com MTB: taxa dividida 50/50', () => {
  const r = calculateCancellationFee({ actor: 'customer', motoboyInvolved: true, orderTotal: 100, deliveryFee: 10, config: cfg });
  expect(r.totalFee).toBe(10); expect(r.motoboyShare).toBe(5); expect(r.appShare).toBe(5);
  expect(r.refundToCustomer).toBe(90);
});

test('loja cancela: taxa 10% da ENTREGA, paga pela loja, cliente 100%', () => {
  const r = calculateCancellationFee({ actor: 'store', motoboyInvolved: false, orderTotal: 100, deliveryFee: 10, config: cfg });
  expect(r.base).toBe(10); expect(r.totalFee).toBe(1); expect(r.payer).toBe('store');
  expect(r.appShare).toBe(1); expect(r.refundToCustomer).toBe(100);
});

test('loja cancela com MTB aceito: taxa da entrega dividida 50/50', () => {
  const r = calculateCancellationFee({ actor: 'store', motoboyInvolved: true, orderTotal: 100, deliveryFee: 10, config: cfg });
  expect(r.totalFee).toBe(1); expect(r.motoboyShare).toBe(0.5); expect(r.appShare).toBe(0.5);
});

test('motoboy cancela após pegar: taxa da entrega, paga pelo MTB, 100% app', () => {
  const r = calculateCancellationFee({ actor: 'motoboy', motoboyInvolved: true, orderTotal: 100, deliveryFee: 10, config: cfg });
  expect(r.totalFee).toBe(1); expect(r.payer).toBe('motoboy');
  expect(r.motoboyShare).toBe(0); expect(r.appShare).toBe(1); expect(r.refundToCustomer).toBe(100);
});

test('cliente ausente: taxa do total, MTB recebe entrega cheia', () => {
  const r = calculateCancellationFee({ actor: 'customer_absent', motoboyInvolved: true, orderTotal: 100, deliveryFee: 10, config: cfg });
  expect(r.totalFee).toBe(10); expect(r.payer).toBe('customer');
  expect(r.motoboyShare).toBe(10); expect(round2(r.appShare)).toBe(0);
  expect(r.refundToCustomer).toBe(90);
});
