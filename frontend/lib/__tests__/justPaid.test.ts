import { markJustPaid, peekJustPaid, consumeJustPaid } from '../justPaid';
beforeEach(() => sessionStorage.clear());
it('marca, confere e consome uma vez só, só para o pedido certo', () => {
  markJustPaid('o1');
  expect(peekJustPaid('o2')).toBe(false);
  expect(consumeJustPaid('o2')).toBe(false);
  expect(peekJustPaid('o1')).toBe(true);
  expect(consumeJustPaid('o1')).toBe(true);
  expect(consumeJustPaid('o1')).toBe(false);
});
