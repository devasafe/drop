import { useEffect, useState } from 'react';
import api from '../lib/api';
import { parseCoords } from '../lib/geo';
import { readQuoteCache, writeQuoteCache } from './useStoreQuotes';
import { addressId, type SavedAddress } from './useDeliveryAddress';
import type { DeliveryQuote } from '../types/delivery';

const MAX_ADDRESSES = 5;

/** Estimativa de prazo/frete/área de UMA loja para cada endereço salvo (sheet "Onde entregar?"). */
export function useAddressQuotes(storeId: string | null | undefined, addresses: SavedAddress[], enabled = true) {
  const [quotes, setQuotes] = useState<Record<string, DeliveryQuote>>({});
  const [loading, setLoading] = useState(false);
  const key = addresses.map((a) => `${addressId(a)}:${a.latitude},${a.longitude}`).join('|');

  useEffect(() => {
    if (!enabled) return; // fechado: mantém o que já temos (reabrir mostra na hora)
    const targets = addresses
      .map((a) => ({ id: addressId(a), p: parseCoords(a.latitude, a.longitude) }))
      .filter((t) => t.id && t.p)
      .slice(0, MAX_ADDRESSES);
    if (!storeId || targets.length === 0) { setQuotes({}); setLoading(false); return; }
    // mesmo cache (2 min) do useStoreQuotes: endereço já cotado não gera POST (limite de 30/min)
    const cached: Record<string, DeliveryQuote> = {};
    const missing = targets.filter((t) => {
      const hit = readQuoteCache(t.p!, storeId);
      if (hit) cached[t.id] = hit;
      return !hit;
    });
    setQuotes(cached);
    if (missing.length === 0) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    Promise.all(missing.map((t) =>
      api.post<{ data?: DeliveryQuote[] }>('/stores/quotes', { latitude: t.p!.lat, longitude: t.p!.lng, storeIds: [storeId] })
        .then((r) => {
          const q = Array.isArray(r.data?.data) ? r.data.data[0] : undefined;
          if (q) writeQuoteCache(t.p!, q);
          return [t.id, q] as const;
        })
        .catch(() => [t.id, undefined] as const),
    )).then((pairs) => {
      if (cancelled) return;
      const out: Record<string, DeliveryQuote> = { ...cached };
      for (const [id, q] of pairs) if (q) out[id] = q;
      setQuotes(out);
      setLoading(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, key, enabled]);

  return { quotes, loading };
}
