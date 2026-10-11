import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';

export interface CategorySummary { name: string; productCount: number; storeCount: number; subCategories: { name: string; count: number }[] }

/** Resumo da categoria (contagens por subcategoria calculadas no servidor). */
export function useCategorySummary(name: string | null) {
  const [data, setData] = useState<CategorySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!name) return;
    let off = false;
    setLoading(true); setFailed(false);
    api.get(`/search/category?name=${encodeURIComponent(name)}`)
      .then((r) => { if (!off) setData(r.data?.data ?? null); })
      .catch(() => { if (!off) setFailed(true); })
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [name, attempt]);
  return { data, loading, failed, retry: useCallback(() => setAttempt((n) => n + 1), []) };
}
