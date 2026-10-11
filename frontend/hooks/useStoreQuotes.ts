import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import type { DeliveryQuote, GeoPoint } from '../types/delivery';

const DEBOUNCE_MS = 300;
const MAX_BATCH = 50;

// Cache em memória por ponto (4 casas) + loja: o mesmo ponto não repete chamada.
// Vale 2 min: a cotação traz aberta/fechada e taxa, que não podem ficar velhas na SPA.
const CACHE_TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, { quote: DeliveryQuote; at: number }>();
const pointKey = (p: GeoPoint) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
const cacheKey = (p: GeoPoint, storeId: string) => `${pointKey(p)}|${storeId}`;

export function __resetStoreQuotesCache() {
  cache.clear();
}

/** Leitura/escrita do mesmo cache por outros hooks (seletor de endereço), respeitando o TTL. */
export function readQuoteCache(point: GeoPoint, storeId: string): DeliveryQuote | undefined {
  const key = cacheKey(point, storeId);
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at >= CACHE_TTL_MS) { cache.delete(key); return undefined; }
  return hit.quote;
}
export function writeQuoteCache(point: GeoPoint, quote: DeliveryQuote): void {
  cache.set(cacheKey(point, quote.storeId), { quote, at: Date.now() });
}

function collect(storeIds: string[], point: GeoPoint): Record<string, DeliveryQuote> {
  const out: Record<string, DeliveryQuote> = {};
  for (const id of storeIds) {
    const key = cacheKey(point, id);
    const hit = cache.get(key);
    if (!hit) continue;
    if (Date.now() - hit.at >= CACHE_TTL_MS) cache.delete(key);
    else out[id] = hit.quote;
  }
  return out;
}

/** Cotação em lote (POST /stores/quotes) das lojas visíveis para o ponto do cliente. */
export function useStoreQuotes(
  storeIds: string[],
  point: GeoPoint | null,
): { quotes: Record<string, DeliveryQuote>; loading: boolean; failed: boolean; retry: () => void } {
  const [quotes, setQuotes] = useState<Record<string, DeliveryQuote>>({});
  const [loading, setLoading] = useState(false);
  // A última busca falhou (429, rede): quem bloqueia por cotação (Sacola, Plano 1) oferece "Tentar de novo".
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const idsKey = Array.from(new Set(storeIds)).join(',');
  const lat = point?.lat;
  const lng = point?.lng;
  const seq = useRef(0);

  useEffect(() => {
    const run = ++seq.current;
    setFailed(false);
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng) || !idsKey) {
      setQuotes({});
      setLoading(false);
      return;
    }
    const p: GeoPoint = { lat, lng };
    const ids = idsKey.split(',');
    const cached = collect(ids, p);
    setQuotes(cached);
    const missing = ids.filter(id => !cached[id]);
    if (missing.length === 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      let err = false;
      try {
        for (let i = 0; i < missing.length; i += MAX_BATCH) {
          const chunk = missing.slice(i, i + MAX_BATCH);
          const res = await api.post<{ data?: DeliveryQuote[] }>('/stores/quotes', {
            latitude: p.lat,
            longitude: p.lng,
            storeIds: chunk,
          });
          const list = Array.isArray(res.data?.data) ? res.data.data : [];
          const at = Date.now();
          for (const q of list) cache.set(cacheKey(p, q.storeId), { quote: q, at });
        }
      } catch {
        // sem cotação: os cards caem na estimativa/ausência de taxa
        err = true;
      }
      if (run === seq.current) {
        setQuotes(collect(ids, p));
        setFailed(err);
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [idsKey, lat, lng, attempt]);

  return { quotes, loading, failed, retry };
}
