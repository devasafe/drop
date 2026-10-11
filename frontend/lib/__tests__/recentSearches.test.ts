import { getRecentSearches, addRecentSearch, clearRecentSearches, RECENT_SEARCHES_KEY } from '../recentSearches';

beforeEach(() => localStorage.clear());

it('mais recente primeiro, sem repetir (ignora caixa), máx. 6, ignora termo curto', () => {
  ['ração golden', 'caderno a5', 'Ração Golden', 'x'].forEach(addRecentSearch);
  expect(getRecentSearches()).toEqual(['Ração Golden', 'caderno a5']);
  for (let i = 0; i < 10; i++) addRecentSearch(`termo ${i}`);
  expect(getRecentSearches()).toHaveLength(6);
  expect(getRecentSearches()[0]).toBe('termo 9');
});
it('limpar e storage corrompido', () => {
  addRecentSearch('fone');
  clearRecentSearches();
  expect(getRecentSearches()).toEqual([]);
  localStorage.setItem(RECENT_SEARCHES_KEY, '{quebrado');
  expect(getRecentSearches()).toEqual([]);
});
