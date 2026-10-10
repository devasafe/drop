import { useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import type { Suggestions } from '../types/search';

export function useSearchSuggest(term: string, delayMs = 250) {
  const [state, setState] = useState<{ term: string; data: Suggestions } | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const q = term.trim();
  useEffect(() => {
    const run = ++seq.current;
    if (q.length < 2) { setState(null); setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get<{ data?: Suggestions }>(`/search/suggest?q=${encodeURIComponent(q)}`);
        if (run === seq.current) setState({ term: q, data: res.data?.data ?? { products: [], stores: [], categories: [] } });
      } catch {
        if (run === seq.current) setState({ term: q, data: { products: [], stores: [], categories: [] } });
      } finally {
        if (run === seq.current) setLoading(false);
      }
    }, delayMs);
    return () => clearTimeout(timer);
  }, [q, delayMs]);
  // Só devolve o que pertence ao termo atual: durante o debounce não aparece a resposta da digitação anterior.
  return { data: state && state.term === q ? state.data : null, loading };
}
