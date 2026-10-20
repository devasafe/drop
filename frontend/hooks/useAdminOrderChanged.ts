/**
 * Pedidos mudaram (D3b-1, spec 4.4). Assina 'admin:order_changed' da sala admin e chama `onChange` no máximo uma
 * vez a cada 2 s, com os ids que mudaram na janela (rajada de eventos vira uma releitura só). Quando o socket
 * volta de uma queda, chama `onChange(null)`: pode ter perdido eventos, então relê tudo.
 * Só assina com operation:view: a sala admin é de toda a equipe, e quem não vê a operação não relê nada.
 * Devolve `isConnected`: com o socket caído a tela faz polling de ADMIN_ORDERS_POLL_MS.
 */
import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { ADMIN_ORDER_CHANGED_EVENT, type AdminOrderChangedEvent } from '../lib/adminOps';

export const ADMIN_ORDER_CHANGED_WINDOW_MS = 2_000;
export const ADMIN_ORDERS_POLL_MS = 30_000;

export function useAdminOrderChanged(onChange: (orderIds: string[] | null) => void): { isConnected: boolean } {
  const { on, onReconnect, isConnected } = useSocket();
  const { can } = useAuth();
  const allowed = typeof can === 'function' && can('operation:view');
  const cb = useRef(onChange);

  useEffect(() => { cb.current = onChange; });

  useEffect(() => {
    if (!allowed) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let ids = new Set<string>();
    const flush = () => {
      timer = null;
      const changed = Array.from(ids);
      ids = new Set();
      cb.current(changed);
    };
    const offEvent = on(ADMIN_ORDER_CHANGED_EVENT, (payload?: Partial<AdminOrderChangedEvent>) => {
      if (payload && typeof payload.orderId === 'string') ids.add(payload.orderId);
      if (!timer) timer = setTimeout(flush, ADMIN_ORDER_CHANGED_WINDOW_MS);
    });
    const offReconnect = onReconnect(() => cb.current(null));
    return () => {
      offEvent();
      offReconnect();
      if (timer) clearTimeout(timer);
    };
  }, [on, onReconnect, allowed]);

  return { isConnected };
}

export default useAdminOrderChanged;
