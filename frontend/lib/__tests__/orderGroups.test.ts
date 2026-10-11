import { groupOrdersByMonth } from '../orderGroups';

it('agrupa por mês, mais recente primeiro', () => {
  const g = groupOrdersByMonth([
    { _id: 'a', createdAt: '2026-07-01T12:00:00' },
    { _id: 'b', createdAt: '2026-09-12T19:08:00' },
    { _id: 'c', createdAt: '2026-09-03T10:00:00' },
    { _id: 'd' },
  ]);
  expect(g.map((x) => [x.label, x.orders.map((o) => o._id)])).toEqual([
    ['Setembro de 2026', ['b', 'c']], ['Julho de 2026', ['a']], ['Sem data', ['d']],
  ]);
});
