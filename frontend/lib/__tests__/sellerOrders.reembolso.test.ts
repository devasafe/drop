import { orderStage } from '../sellerOrders';

/** Reembolso de pedido entregue na lista da loja: o que espera a loja aparece antes de "Entregue". */
test.each([
  ['aguardando_loja', 'Reembolso: responder'],
  ['devolvendo', 'Devolução: conferir código'],
])('entregue com reembolso %s → %s', (status, label) => {
  expect(orderStage({ status: 'entregue', returnRequest: { status } })).toEqual({ label, tone: 'warning' });
});

test('reembolso concluído ou recusado: volta a ser "Entregue"', () => {
  expect(orderStage({ status: 'entregue', returnRequest: { status: 'concluido' } }).label).toBe('Entregue');
  expect(orderStage({ status: 'entregue', returnRequest: { status: 'recusado' } }).label).toBe('Entregue');
});
