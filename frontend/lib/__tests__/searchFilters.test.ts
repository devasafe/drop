import { effectiveFilters, soldOutLast } from '../searchFilters';

it('sem ponto: "abertas agora" e "mais perto" não valem (nem contam como filtro)', () => {
  expect(effectiveFilters({ sort: 'distance', openNow: true }, false)).toEqual({ sort: 'relevance', openNow: false });
  expect(effectiveFilters({ sort: 'distance', openNow: true }, true)).toEqual({ sort: 'distance', openNow: true });
});
it('esgotados no fim, ordem estável', () => {
  const r = soldOutLast([{ id: 'a', quantity: 0 }, { id: 'b', quantity: 3 }, { id: 'c', quantity: 1 }, { id: 'd', quantity: 0 }]);
  expect(r.map((x) => x.id)).toEqual(['b', 'c', 'a', 'd']);
});
