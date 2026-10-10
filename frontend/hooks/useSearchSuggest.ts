import { useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import type { Suggestions } from '../types/search';

export function useSearchSuggest(term: string, delayMs = 250) {
  const [data, setData] = useState<Suggestions | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const q = term.trim();
  useEffect(() => {
    const run = ++seq.current;
    if (q.length < 2) { setData(null); setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get<{ data?: Suggestions }>(`/search/suggest?q=${encodeURIComponent(q)}`);
        if (run === seq.current) setData(res.data?.data ?? { products: [], stores: [], categories: [] });
      } catch {
        if (run === seq.current) setData({ products: [], stores: [], categories: [] });
      } finally {
        if (run === seq.current) setLoading(false);
      }
    }, delayMs);
    return () => clearTimeout(timer);
  }, [q, delayMs]);
  return { data, loading };
}
