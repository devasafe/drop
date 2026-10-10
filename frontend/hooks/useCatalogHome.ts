import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import type { DeliveryQuote, GeoPoint } from '../types/delivery';

function useList<T>(url: string | null) {
  const [items, setItems] = useState<T[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const key = url ? `${url}#${attempt}` : null;
  const loading = !!key && loadedKey !== key;
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    if (!url) { setItems([]); setFailed(false); return; }
    let cancelled = false;
    setFailed(false);
    api.get<{ data?: T[] }>(url)
      .then((r) => { if (!cancelled) setItems(Array.isArray(r.data?.data) ? r.data.data : []); })
      .catch(() => { if (!cancelled) { setItems([]); setFailed(true); } })
      .finally(() => { if (!cancelled) setLoadedKey(`${url}#${attempt}`); });
    return () => { cancelled = true; };
  }, [url, attempt]);
  return { items, loading, failed, retry };
}

/** Ofertas reais (oldPrice > price), as que chegam no ponto primeiro quando há endereço. */
export function useOffers(point: GeoPoint | null, limit = 10) {
  const qs = point ? `lat=${point.lat}&lng=${point.lng}&limit=${limit}` : `limit=${limit}`;
  const { items, ...rest } = useList<any>(`/products/offers?${qs}`);
  return { products: items, ...rest };
}

/** Lojas que entregam no ponto, de todos os planos, já com a estimativa (quote). Sem ponto: nada. */
export function useNearbyStores(point: GeoPoint | null, limit = 12) {
  const { items, ...rest } = useList<any & { quote: DeliveryQuote }>(point ? `/stores/nearby?lat=${point.lat}&lng=${point.lng}&limit=${limit}` : null);
  return { stores: items, ...rest };
}
