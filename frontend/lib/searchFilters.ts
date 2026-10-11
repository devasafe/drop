import type { SearchFiltersValue } from '../components/drop/SearchFiltersSheet';
import type { SearchSort } from '../types/search';

/** Sem endereço não há "abertas agora" nem "mais perto": não valem e não contam como filtro. */
export function effectiveFilters(f: SearchFiltersValue, hasPoint: boolean): SearchFiltersValue {
  return { ...f, openNow: hasPoint && !!f.openNow, sort: !hasPoint && f.sort === 'distance' ? 'relevance' : f.sort };
}

/** Esgotados no fim, preservando a ordem do servidor entre os disponíveis (por página carregada). */
export function soldOutLast<T extends { quantity?: unknown }>(items: T[]): T[] {
  const has = (x: T) => x.quantity == null || Number(x.quantity) > 0;
  return [...items.filter(has), ...items.filter((x) => !has(x))];
}

export const SORT_LABEL: Record<SearchSort, string> = {
  relevance: 'Mais relevantes', price_asc: 'Menor preço', price_desc: 'Maior preço', distance: 'Mais perto',
};
