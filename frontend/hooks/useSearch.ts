import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import type { SearchQuery } from '../types/search';

export const SEARCH_PAGE_SIZE = 20;

export function buildSearchUrl(query: SearchQuery, cursor?: string | null): string {
  const f = query.filters;
  const qs = new URLSearchParams();
  qs.set('q', query.q.trim());
  qs.set('type', query.type);
  qs.set('sort', !query.point && f.sort === 'distance' ? 'relevance' : f.sort);
  qs.set('limit', String(SEARCH_PAGE_SIZE));
  if (query.point) {
    qs.set('lat', String(query.point.lat));
    qs.set('lng', String(query.point.lng));
    if (f.openNow) qs.set('openNow', '1');
  }
  if (f.minPrice != null) qs.set('minPrice', String(f.minPrice));
  if (f.maxPrice != null) qs.set('maxPrice', String(f.maxPrice));
  if (f.categoryName) qs.set('categoryName', f.categoryName);
  if (cursor) qs.set('cursor', cursor);
  return `/search?${qs.toString().replace(/\+/g, '%20')}`;
}

export function useSearch(query: SearchQuery | null) {
  const [items, setItems] = useState<any[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const seq = useRef(0);
  const key = query ? buildSearchUrl(query) : '';

  useEffect(() => {
    const run = ++seq.current;
    setItems([]); setCursor(null); setFailed(false);
    if (!query || query.q.trim().length < 2) { setLoading(false); return; }
    setLoading(true);
    api.get<{ data?: { items: any[]; nextCursor: string | null } }>(key)
      .then((r) => { if (run === seq.current) { setItems(r.data?.data?.items ?? []); setCursor(r.data?.data?.nextCursor ?? null); } })
      .catch(() => { if (run === seq.current) setFailed(true); })
      .finally(() => { if (run === seq.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const loadMore = useCallback(() => {
    if (!query || !cursor || loadingMore) return;
    const run = seq.current;
    setLoadingMore(true);
    api.get<{ data?: { items: any[]; nextCursor: string | null } }>(buildSearchUrl(query, cursor))
      .then((r) => { if (run === seq.current) { setItems((prev) => [...prev, ...(r.data?.data?.items ?? [])]); setCursor(r.data?.data?.nextCursor ?? null); } })
      .catch(() => { /* mantém o que já veio; o botão continua disponível */ })
      .finally(() => { if (run === seq.current) setLoadingMore(false); });
  }, [query, cursor, loadingMore]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { items, loading, loadingMore, failed, hasMore: !!cursor, loadMore, retry };
}
