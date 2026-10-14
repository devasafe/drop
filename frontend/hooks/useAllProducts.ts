import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';

export const ALL_PRODUCTS_PAGE_SIZE = 30;

/** Uma página do catálogo inteiro (mais novos primeiro). O servidor já aplica os gates de visibilidade. */
export function useAllProducts(page: number, opts: { enabled?: boolean } = {}) {
  const enabled = opts.enabled !== false;
  const [products, setProducts] = useState<any[]>([]);
  const [pages, setPages] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const key = enabled ? `${page}#${attempt}` : null;
  const loading = !!key && loadedKey !== key;
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const k = `${page}#${attempt}`;
    setFailed(false);
    api.get(`/products?limit=${ALL_PRODUCTS_PAGE_SIZE}&page=${page}`)
      .then((r) => {
        if (cancelled) return;
        setProducts(Array.isArray(r.data?.products) ? r.data.products : []);
        setPages(Number(r.data?.pagination?.pages) || 0);
      })
      .catch(() => { if (!cancelled) { setProducts([]); setPages(0); setFailed(true); } })
      .finally(() => { if (!cancelled) setLoadedKey(k); });
    return () => { cancelled = true; };
  }, [enabled, page, attempt]);
  return { products, pages, loading, failed, retry };
}
