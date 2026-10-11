import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';

export interface CancelPreview { cancellable: boolean; fee?: number; refund?: number; motoboyEnRoute?: boolean; direct?: boolean; paymentMethod?: string; reason?: string;
  /** false = o pedido não foi pago (nada a estornar). Ausente = pago (resposta antiga). */
  paid?: boolean;
  /** Parte que volta para a carteira (saldo usado no pedido). */
  walletPart?: number;
  /** Parte que volta para o Pix/cartão. */
  providerPart?: number;
}

/** Prévia do cancelamento, recarregada a cada abertura do sheet (o pedido pode ter mudado). */
export function useCancelPreview(orderId: string | undefined, open: boolean) {
  const [preview, setPreview] = useState<CancelPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open || !orderId) return;
    let off = false;
    setPreview(null); setLoading(true); setFailed(false);
    api.get(`/orders/${orderId}/cancel-preview`)
      .then((r) => { if (!off) setPreview(r.data?.data ?? null); })
      .catch(() => { if (!off) setFailed(true); })
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [orderId, open, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { preview, loading, failed, retry };
}
