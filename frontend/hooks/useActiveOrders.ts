// frontend/hooks/useActiveOrders.ts
import { useEffect } from 'react';
import { useOrders } from './useSync';
import { useSocket } from '../contexts/SocketContext';
import { pickActiveOrders } from '../lib/activeOrder';

// Eventos de ENTREGA que mudam o que o card mostra. Reusa o mesmo refetch do
// useOrders (order:* já embutido lá). location_updated fica de fora de propósito
// (mudaria nada no card e dispararia refetch a cada ~15s).
const DELIVERY_EVENTS = [
  'delivery:assigned', 'delivery:picked', 'delivery:completed',
  'delivery:status_changed', 'delivery:updated', 'motoboy:assigned',
];

export function useActiveOrders(): { activeOrders: any[]; orders: any[]; loading: boolean } {
  const { orders, loading, refetch } = useOrders();
  const { on } = useSocket();

  useEffect(() => {
    const unsubs = DELIVERY_EVENTS.map((e) => on(e, () => refetch()));
    return () => unsubs.forEach((u) => u());
  }, [on, refetch]);

  return { activeOrders: pickActiveOrders(orders), orders, loading };
}
