import React, { createContext, useContext, useEffect, useState, ReactNode, useRef, useCallback } from 'react';
import { connectSocket, disconnectSocket, getSocket } from '../lib/socket';

interface SocketContextType {
  isConnected: boolean;
  isReconnecting: boolean;
  on: (event: string, handler: (...args: any[]) => void) => () => void; // retorna unsubscribe function
  emit: (event: string, ...args: any[]) => void;
}

const SocketContext = createContext<SocketContextType | null>(null);

export const SocketProvider = ({ children, enabled }: { children: ReactNode; enabled?: boolean }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const socketRef = useRef<any>(null);

  useEffect(() => {
    if (!enabled) return;

    const socket = connectSocket();
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('✅ [Socket] Conectado ao servidor');
      setIsConnected(true);
      setIsReconnecting(false);
      reconnectAttemptsRef.current = 0;
    });

    socket.on('disconnect', (reason: string) => {
      console.warn(`⚠️ [Socket] Desconectado: ${reason}`);
      setIsConnected(false);
      
      // Reconectar automaticamente se for desconexão anormal
      if (!['io client namespace disconnect', 'io server namespace disconnect', 'nsp namespace disconnect', 'io server namespace disconnect'].includes(reason)) {
        setIsReconnecting(true);
        scheduleReconnect(socket);
      }
    });

    socket.on('connect_error', (err) => {
      console.error('🔴 [Socket] Erro de conexão:', err);
      setIsReconnecting(true);
    });

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [enabled]);

  const scheduleReconnect = (socket: any) => {
    // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
    const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
    reconnectAttemptsRef.current += 1;

    console.log(`🔄 [Socket] Tentando reconectar em ${delay / 1000}s (tentativa ${reconnectAttemptsRef.current})...`);

    reconnectTimeoutRef.current = setTimeout(() => {
      socket.connect();
    }, delay);
  };

  const on = useCallback((event: string, handler: (...args: any[]) => void) => {
    const socket = socketRef.current || getSocket();
    if (!socket) return () => {};
    const wrappedHandler = (...args: any[]) => handler(...args);
    socket.on(event, wrappedHandler);
    return () => socket.off(event, wrappedHandler);
  }, [isConnected]); // isConnected nas deps: quando o socket conecta, a referência muda e consumers re-registram seus listeners (fix de race condition de ordem de efeitos React)

  const emit = useCallback((event: string, ...args: any[]) => {
    const socket = socketRef.current || getSocket();
    if (!socket?.connected) return;
    socket.emit(event, ...args);
  }, [isConnected]);

  return (
    <SocketContext.Provider value={{ isConnected, isReconnecting, on, emit }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket deve ser usado dentro de SocketProvider');
  }
  return context;
};

export default SocketContext;
