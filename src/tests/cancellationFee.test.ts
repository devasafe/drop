import { calculateCancellationFee } from '../utils/cancellationFee';

const cfg = {
  cancelFeeCustomerPercent: 10, cancelFeeStorePercent: 10,
  cancelFeeMotoboyPercent: 10, lateCancellationMotoboyShare: 50,
};
const round2 = (n: number) => Math.round(n * 100) / 100;

test('cliente cancela sem motoboy em rota: GRÁTIS (reembolso cheio, sem taxa)', () => {
  const r = calculateCancellationFee({ actor: 'customer', motoboyInvolved: false, orderTotal: 100, deliveryFee: 10, config: cfg });
  expect(r.totalFee).toBe(0); expect(r.payer).toBe(null);
  expect(r.appShare).toBe(0); expect(r.motoboyShare).toBe(0);
  expect(r.refundToCustomer).toBe(100);
});

test('cliente cancela com motoboy em rota: taxa = valor da ENTREGA, vai inteira pro motoboy', () => {
  // números distintos (120/8) pra provar que a taxa é a ENTREGA (8), não 10% do total (12).
  const r = calculateCancellationFee({ actor: 'customer', motoboyInvolved: true, orderTotal: 120, deliveryFee: 8, config: cfg });
  expect(r.totalFee).toBe(8); expect(r.payer).toBe('customer');
  expect(r.motoboyShare).toBe(8); expect(r.appShare).toBe(0);
  expect(r.refundToCustomer).toBe(112);
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
