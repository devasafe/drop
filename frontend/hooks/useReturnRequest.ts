import { useCallback, useContext, useEffect, useState } from 'react';
import api from '../lib/api';
import SocketContext from '../contexts/SocketContext';
import type { ReturnRequestView } from '../components/drop/order/ReturnRequestCard';

/**
 * Reembolso do pedido entregue (caso B) na tela do pedido: lê GET /orders/:id/return-request,
 * acompanha `return:updated` (a loja aprovou, recusou ou confirmou) e escolhe "levo na loja".
 */
export function useReturnRequest(orderId: string | undefined, enabled: boolean) {
  const socket = useContext(SocketContext);
  const [request, setRequest] = useState<ReturnRequestView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!orderId || !enabled) return;
    api.get(`/orders/${orderId}/return-request`)
      .then((r) => { setRequest(r.data || null); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [orderId, enabled]);
  useEffect(load, [load]);

  useEffect(() => {
    if (!socket?.on || !orderId || !enabled) return undefined;
    return socket.on('return:updated', (d: any) => { if (d?.orderId === orderId) load(); });
  }, [socket, orderId, enabled, load]);

  const chooseStore = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!request) return { ok: false };
    setBusy(true);
    try {
      const r = await api.post(`/return-requests/${request._id}/mode`, { mode: 'loja' });
      setRequest(r.data);
      return { ok: true };
    } catch (e: any) {
      if (e?.response?.status === 409) load();
      return { ok: false, error: e?.response?.data?.error || 'Não deu para continuar agora. Tente de novo.' };
    } finally {
      setBusy(false);
    }
  }, [request, load]);

  return { request, loaded, busy, chooseStore };
}
