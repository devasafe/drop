import { useContext, useEffect, useRef } from 'react';
import SocketContext from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';

/**
 * useLivePresence
 *
 * Pede geolocalização do browser (com permissão) e envia a coordenada do
 * usuário logado via socket.io (`presence:location`) a cada 60s. O backend
 * alimenta o onlineTracker, que abastece o mapa ao vivo do painel do CEO.
 *
 * - Respeita opt-out via `localStorage.drop:geo-opt-out` = 'true'.
 * - Só dispara quando o usuário está autenticado e o socket está conectado.
 * - Falhas silenciosas (usuário pode simplesmente negar a permissão).
 */
const INTERVAL_MS = 60_000;

export function useLivePresence() {
  // Usar useContext direto (não useSocket) para tolerar estar fora do provider
  // durante boot do _app — caso em que retornamos no-op.
  const socket = useContext(SocketContext);
  const { token, user } = useAuth() || ({} as any);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!socket || !token || !user || !socket.isConnected) return;
    if (typeof window === 'undefined' || !('geolocation' in navigator)) return;

    if (localStorage.getItem('drop:geo-opt-out') === 'true') return;

    const sendLocation = () => {
      navigator.geolocation.getCurrentPosition(
        pos => {
          try {
            socket.emit('presence:location', {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            });
          } catch (err) {
            // silently ignore
          }
        },
        _err => {
          // usuário negou permissão — não insiste
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
        },
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 }
      );
    };

    // Primeiro envio imediato, depois a cada 60s
    sendLocation();
    timerRef.current = setInterval(sendLocation, INTERVAL_MS);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [token, user, socket?.isConnected]);
}
