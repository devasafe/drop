import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import type { DeliveryQuote, GeoPoint } from '../types/delivery';

export type ServerDeliveryQuote = DeliveryQuote & { deliveryFee: number | null };

/** Cotação de entrega por rota real (POST /orders/quote) — mesma fonte da cobrança final. */
export function useDeliveryQuote(
  storeId: string | null | undefined,
  point: GeoPoint | null,
  enabled = true,
): { quote: ServerDeliveryQuote | null; loading: boolean; failed: boolean; retry: () => void } {
  const [quote, setQuote] = useState<ServerDeliveryQuote | null>(null);
  const [loading, setLoading] = useState(false);
  // Erro de rede/servidor na cotação (diferente de uma resposta com inArea false/null).
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const lat = point?.lat;
  const lng = point?.lng;

  useEffect(() => {
    // Ponto novo invalida a cotação anterior: nunca liberar o pedido com área de outro endereço.
    setQuote(null);
    setFailed(false);
    if (!enabled || !storeId || lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.post<ServerDeliveryQuote>('/orders/quote', { storeId, latitude: lat, longitude: lng })
      .then(res => {
        if (cancelled) return;
        const d = res.data;
        setQuote(d ? { ...d, deliveryFee: d.deliveryFee ?? null } : null);
      })
      .catch(() => { if (!cancelled) { setQuote(null); setFailed(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [storeId, lat, lng, enabled, attempt]);

  return { quote, loading, failed, retry };
}
