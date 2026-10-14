import React, { createContext, useContext, useEffect, useState, ReactNode, useRef, useCallback } from 'react';
import { connectSocket, disconnectSocket, getSocket } from '../lib/socket';

interface SocketContextType {
  isConnected: boolean;
  isReconnecting: boolean;
  on: (event: string, handler: (...args: any[]) => void) => () => void; // retorna unsubscribe function
  emit: (event: string, ...args: any[]) => void;
  /**
   * Avisa quando o socket VOLTA depois de uma queda (nunca na 1ª conexão), para quem precisa reler
   * o que pode ter perdido. Disparos espaçados por no mínimo RECONNECT_REFRESH_MIN_MS, compartilhado
   * por todos os inscritos. Retorna a função de cancelar a inscrição.
   */
  onReconnect: (cb: () => void) => () => void;
}

/** Intervalo mínimo entre duas releituras por reconexão (socket oscilando não vira avalanche, V16). */
export const RECONNECT_REFRESH_MIN_MS = 30_000;

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

  // Releitura depois de reconectar: só num `connect` que vem depois de um `disconnect`, no máximo
  // uma a cada RECONNECT_REFRESH_MIN_MS. Se a última foi há menos tempo, agenda uma para quando
  // completar o intervalo (não descarta: o que caiu na 2ª queda também precisa ser relido).
  const reconnectSubsRef = useRef(new Set<() => void>());
  const everConnectedRef = useRef(false);
  const droppedRef = useRef(false);
  const lastReconnectRefreshRef = useRef(0);
  const reconnectRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fireReconnect = () => {
    lastReconnectRefreshRef.current = Date.now();
    reconnectSubsRef.current.forEach((cb) => {
      try { cb(); } catch { /* um inscrito com erro não impede os outros */ }
    });
  };
  const signalReconnect = () => {
    if (reconnectRefreshTimerRef.current) return; // já há uma agendada
    const last = lastReconnectRefreshRef.current;
    const wait = last ? last + RECONNECT_REFRESH_MIN_MS - Date.now() : 0;
    if (wait <= 0) { fireReconnect(); return; }
    reconnectRefreshTimerRef.current = setTimeout(() => {
      reconnectRefreshTimerRef.current = null;
      fireReconnect();
    }, wait);
  };

  useEffect(() => {
    if (!enabled) return;

    const socket = connectSocket();
    socketRef.current = socket;
    attachAll(socket);

    const onConnect = () => {
      console.log('✅ [Socket] Conectado ao servidor');
      setIsConnected(true);
      setIsReconnecting(false);
      reconnectAttemptsRef.current = 0;
      if (everConnectedRef.current && droppedRef.current) signalReconnect();
      everConnectedRef.current = true;
      droppedRef.current = false;
    };
    socket.on('connect', onConnect);

    const onDisconnect = (reason: string) => {
      console.warn(`⚠️ [Socket] Desconectado: ${reason}`);
      setIsConnected(false);
      droppedRef.current = true;
      
      // Reconectar automaticamente se for desconexão anormal
      if (!['io client namespace disconnect', 'io server namespace disconnect', 'nsp namespace disconnect', 'io server namespace disconnect'].includes(reason)) {
        setIsReconnecting(true);
        scheduleReconnect(socket);
      }
    };
    socket.on('disconnect', onDisconnect);

    const onConnectError = (err: any) => {
      console.error('🔴 [Socket] Erro de conexão:', err);
      setIsReconnecting(true);
    };
    socket.on('connect_error', onConnectError);

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
      if (reconnectRefreshTimerRef.current) {
        clearTimeout(reconnectRefreshTimerRef.current);
        reconnectRefreshTimerRef.current = null;
      }
      document.removeEventListener('visibilitychange', onVisible);
      // sem isso, cada alternância de `enabled` (logout → login) duplicava os handlers no socket único
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
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

  const onReconnect = useCallback((cb: () => void) => {
    reconnectSubsRef.current.add(cb);
    return () => { reconnectSubsRef.current.delete(cb); };
  }, []);

  return (
    <SocketContext.Provider value={{ isConnected, isReconnecting, on, emit, onReconnect }}>
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
