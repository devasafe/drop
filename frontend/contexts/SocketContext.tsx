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
  // `on`/`emit` têm referência FIXA (não mudam a cada connect/disconnect). Antes, `on` dependia de
  // isConnected: cada queda/volta do socket refazia os GETs de todos os hooks inscritos por `on`
  // (avalanche de 429 no painel da loja, V16). As inscrições ficam guardadas aqui e são ligadas na
  // instância do socket assim que ela existe — cobre quem se inscreve antes de o socket nascer
  // (o efeito do filho roda antes do do provider). Os listeners do socket.io ficam na instância e
  // sobrevivem às reconexões, então não há o que refazer ao reconectar.
  const subsRef = useRef(new Set<{ event: string; handler: (...args: any[]) => void }>());
  const attachedRef = useRef<any>(null);
  const attachAll = (socket: any) => {
    if (!socket || attachedRef.current === socket) return;
    const prev = attachedRef.current;
    subsRef.current.forEach((sub) => {
      prev?.off(sub.event, sub.handler);
      socket.on(sub.event, sub.handler);
    });
    attachedRef.current = socket;
  };

  useEffect(() => {
    if (!enabled) return;

    const socket = connectSocket();
    socketRef.current = socket;
    attachAll(socket);

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

    // Ao voltar pro app (fechou o Waze/Google Maps, desbloqueou a tela), o socket
    // pode ter caído e o backoff estar agendado pra daqui a até 30s. Reconecta JÁ,
    // senão os emits (ex.: GPS do motoboy) são descartados até reconectar.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!socket.connected) {
        console.log('👀 [Socket] App voltou ao foco — reconectando imediatamente');
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectAttemptsRef.current = 0;
        socket.connect();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      document.removeEventListener('visibilitychange', onVisible);
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
    const sub = { event, handler: (...args: any[]) => handler(...args) };
    subsRef.current.add(sub);
    if (attachedRef.current) attachedRef.current.on(event, sub.handler);
    else attachAll(socketRef.current || getSocket()); // liga esta e as pendentes, se o socket já existe
    return () => {
      subsRef.current.delete(sub);
      attachedRef.current?.off(event, sub.handler);
    };
  }, []);

  const emit = useCallback((event: string, ...args: any[]) => {
    const socket = socketRef.current || getSocket();
    if (!socket?.connected) return;
    socket.emit(event, ...args);
  }, []);

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
