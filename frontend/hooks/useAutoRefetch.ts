import { useEffect, useCallback, useMemo } from 'react';
import { useSocket } from '../contexts/SocketContext';

/**
 * 🔄 Hook que auto-refetch dados quando socket events são recebidos
 */
export const useAutoRefetch = (
  events: string | string[],
  callback: () => void | Promise<void>
) => {
  const { on } = useSocket();

  // useMemo com JSON.stringify garante estabilidade mesmo quando o caller
  // passa um array literal novo a cada render (ex: ['a','b','c'])
  const eventArray = useMemo(
    () => (typeof events === 'string' ? [events] : events),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(events)]
  );

  useEffect(() => {
    const unsubscribers = eventArray.map(event =>
      on(event, () => callback())
    );
    return () => unsubscribers.forEach(u => u());
  }, [on, callback, eventArray]);
};

/**
 * 🎯 Hook para escutar um socket event específico e fazer uma ação
 * 
 * Uso:
 * useSocketListener('wallet:updated', (data) => {
 *   setWallet(data.balance)
 * })
 */
export const useSocketListener = (
  event: string,
  handler: (data: any) => void
) => {
  const { on } = useSocket();

  useEffect(() => {
    const unsubscribe = on(event, handler);

    return () => {
      unsubscribe();
    };
  }, [on, event, handler]);
};

/**
 * 🎨 Hook para mostrar toast notification quando socket event chega
 * 
 * Uso:
 * useSocketToast('order:created', 'Pedido criado com sucesso!')
 */
export const useSocketToast = (
  event: string,
  message: string,
  type: 'success' | 'error' | 'info' = 'info'
) => {
  const socket = useSocket();
  
  useEffect(() => {
    if (!socket) return;
    
    const unsubscribe = socket.on(event, (data) => {
      console.log(`🎉 [useSocketToast] Event: ${event}`, data);
      // Aqui você pode adicionar toast notification
      // toast[type](message)
    });
    
    return () => {
      unsubscribe();
    };
  }, [socket, event, message, type]);
};
