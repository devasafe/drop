import { neverCharged, isCashOnDelivery, showsCancellationRefund } from '../lib/cancellationRefund';

test('não pago (pending/failed) nunca foi cobrado', () => {
  expect(neverCharged('pending')).toBe(true);
  expect(neverCharged('failed')).toBe(true);
  expect(neverCharged('paid')).toBe(false);
  expect(neverCharged(undefined)).toBe(false);
});

test('dinheiro na entrega nos dois nomes', () => {
  expect(isCashOnDelivery('cash_on_delivery')).toBe(true);
  expect(isCashOnDelivery('money')).toBe(true);
  expect(isCashOnDelivery('pix')).toBe(false);
});

test('linha de reembolso só para pedido pago pelo app e sem estorno direto', () => {
  expect(showsCancellationRefund({ paymentStatus: 'paid', paymentMethod: 'pix' })).toBe(true);
  expect(showsCancellationRefund({ paymentStatus: 'paid', paymentMethod: 'credit_card' })).toBe(true);
  expect(showsCancellationRefund({ paymentStatus: 'pending', paymentMethod: 'pix' })).toBe(false);
  expect(showsCancellationRefund({ paymentStatus: 'failed', paymentMethod: 'credit_card' })).toBe(false);
  expect(showsCancellationRefund({ paymentStatus: 'paid', paymentMethod: 'cash_on_delivery' })).toBe(false);
  expect(showsCancellationRefund({ paymentStatus: 'paid', paymentMethod: 'pix', directRefund: { status: 'done', amount: 10 } })).toBe(false);
  expect(showsCancellationRefund({ paymentStatus: 'paid', paymentMethod: 'pix', customerRefund: { stage: 'devolvido' } })).toBe(false);
  expect(showsCancellationRefund(undefined)).toBe(false);
});
