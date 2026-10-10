export const RECENT_SEARCHES_KEY = 'drop:recentSearches';
const MAX = 6;

export function getRecentSearches(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}
export function addRecentSearch(term: string): string[] {
  const t = term.trim();
  if (t.length < 2) return getRecentSearches();
  const next = [t, ...getRecentSearches().filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX);
  try { localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next)); } catch { /* modo privado */ }
  return next;
}
export function clearRecentSearches(): void {
  try { localStorage.removeItem(RECENT_SEARCHES_KEY); } catch { /* nada */ }
}
