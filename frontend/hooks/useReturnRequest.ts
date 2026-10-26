import { useCallback, useContext, useEffect, useState } from 'react';
import api from '../lib/api';
import SocketContext from '../contexts/SocketContext';
import type { ReturnRequestView } from '../components/drop/order/ReturnRequestCard';

/**
 * Reembolso do pedido entregue (caso B) na tela do pedido: lê GET /orders/:id/return-request,
 * acompanha `return:updated` (a loja aprovou, recusou, confirmou; o motoboy aceitou ou retirou) e
 * escolhe como devolver: levo na loja ou motoboy.
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

  const choose = useCallback(async (mode: 'loja' | 'motoboy'): Promise<{ ok: boolean; error?: string }> => {
    if (!request) return { ok: false };
    setBusy(true);
    try {
      const r = await api.post(`/return-requests/${request._id}/mode`, { mode });
      setRequest(r.data);
      return { ok: true };
    } catch (e: any) {
      if (e?.response?.status === 409) load();
      return { ok: false, error: e?.response?.data?.error || 'Não deu para continuar agora. Tente de novo.' };
    } finally {
      setBusy(false);
    }
  }, [request, load]);

  /** "Já paguei": o servidor consulta o Pix da corrida na conta da loja. */
  const checkFee = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!request) return { ok: false };
    setBusy(true);
    try {
      const r = await api.post(`/return-requests/${request._id}/fee/check`, {});
      setRequest(r.data);
      return r.data?.status === 'aguardando_pagamento' ? { ok: false, error: 'Ainda não recebemos o Pix. Se já pagou, espere alguns segundos.' } : { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.response?.data?.error || 'Não deu para conferir agora. Tente de novo.' };
    } finally {
      setBusy(false);
    }
  }, [request]);

  // Esperando o Pix: relê a cada 10 s (o webhook da loja confirma e o socket nem sempre chega).
  const waitingPix = request?.status === 'aguardando_pagamento';
  useEffect(() => {
    if (!waitingPix) return undefined;
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [waitingPix, load]);

  return { request, loaded, busy, choose, checkFee };
}
