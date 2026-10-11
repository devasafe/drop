import { historyLine, historyTitle } from '../orderHistory';

it('título com loja e valor', () => {
  expect(historyTitle({ storeName: 'Pet&Cia', totalValue: 112.4 })).toBe('Pet&Cia · R$ 112,40');
});
it('linha de apoio por status', () => {
  expect(historyLine({ status: 'entregue', createdAt: '2026-09-12T19:08:00', storeRating: 5, products: [{ quantity: 2 }] })).toBe('Entregue 12/09 · 2 itens');
  expect(historyLine({ status: 'entregue', createdAt: '2026-09-03T10:00:00', products: [{ quantity: 1 }] })).toBe('Entregue 03/09 · 1 item · avaliar a loja');
  expect(historyLine({ status: 'cancelado', createdAt: '2026-09-01T10:00:00', cancelledAt: '2026-09-01T10:14:00', paymentStatus: 'refunded', products: [] })).toBe('Cancelado 01/09 · estorno feito');
  expect(historyLine({ status: 'rejeitado', createdAt: '2026-09-01T10:00:00', products: [] })).toBe('Recusado pela loja 01/09');
});
