import { useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import type { DeliveryQuote, GeoPoint } from '../types/delivery';

const DEBOUNCE_MS = 300;
const MAX_BATCH = 50;

// Cache em memória por ponto (4 casas) + loja: o mesmo ponto não repete chamada.
const cache = new Map<string, DeliveryQuote>();
const pointKey = (p: GeoPoint) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
const cacheKey = (p: GeoPoint, storeId: string) => `${pointKey(p)}|${storeId}`;

export function __resetStoreQuotesCache() {
  cache.clear();
}

function collect(storeIds: string[], point: GeoPoint): Record<string, DeliveryQuote> {
  const out: Record<string, DeliveryQuote> = {};
  for (const id of storeIds) {
    const hit = cache.get(cacheKey(point, id));
    if (hit) out[id] = hit;
  }
  return out;
}

/** Cotação em lote (POST /stores/quotes) das lojas visíveis para o ponto do cliente. */
export function useStoreQuotes(
  storeIds: string[],
  point: GeoPoint | null,
): { quotes: Record<string, DeliveryQuote>; loading: boolean } {
  const [quotes, setQuotes] = useState<Record<string, DeliveryQuote>>({});
  const [loading, setLoading] = useState(false);
  const idsKey = Array.from(new Set(storeIds)).join(',');
  const lat = point?.lat;
  const lng = point?.lng;
  const seq = useRef(0);

  useEffect(() => {
    const run = ++seq.current;
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
      try {
        for (let i = 0; i < missing.length; i += MAX_BATCH) {
          const chunk = missing.slice(i, i + MAX_BATCH);
          const res = await api.post<{ data?: DeliveryQuote[] }>('/stores/quotes', {
            latitude: p.lat,
            longitude: p.lng,
            storeIds: chunk,
          });
          const list = Array.isArray(res.data?.data) ? res.data.data : [];
          for (const q of list) cache.set(cacheKey(p, q.storeId), q);
        }
      } catch {
        // sem cotação: os cards caem na estimativa/ausência de taxa
      }
      if (run === seq.current) {
        setQuotes(collect(ids, p));
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [idsKey, lat, lng]);

  return { quotes, loading };
}
