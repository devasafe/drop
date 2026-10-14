import { useEffect, useRef, useState } from 'react';
import * as logger from '../lib/logger';

type Emit = (event: string, data: unknown) => void;

/**
 * Envio da localização do motoboy durante a corrida (relay p/ cliente e loja via notifier).
 * Movido sem mudança de pages/motoboy/delivery/[id].tsx (D2): throttle de 5 s e só se moveu ~10 m;
 * só em assigned/picked; ao voltar do segundo plano reabre o watch e libera um emit imediato.
 */
export function useRideLocationRelay(ride: any, emit: Emit) {
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);

  // Refs p/ retransmitir a posição do motoboy ao cliente/loja (via relay do
  // notifier) sem recriar o watcher de GPS: o watchPosition roda com deps [],
  // então lê sempre o valor atual por ref (evita closure velha do delivery/emit).
  const emitRef = useRef<Emit | null>(null);
  const deliveryIdRef = useRef<string | null>(null);
  const activeRef = useRef(false);
  const lastEmitRef = useRef(0);
  const lastEmitPosRef = useRef<{ lat: number; lng: number } | null>(null);

  emitRef.current = emit;
  deliveryIdRef.current = ride?._id ?? null;
  activeRef.current = !!ride && ['assigned', 'picked'].includes(ride.status);

  useEffect(() => {
    if (!window.navigator.geolocation) {
      logger.warn('Geolocation não suportado');
      return;
    }

    logger.log('[Localização] Iniciando monitoramento em tempo real...');

    const opts: PositionOptions = { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 };

    const handlePosition = (pos: GeolocationPosition) => {
      const newLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const accuracy = pos.coords.accuracy;

      setCurrentLocation(newLocation);
      setLocationAccuracy(accuracy);

      // Retransmite a posição ao cliente/loja durante a entrega ativa. O
      // backend (notifier) relaya `delivery:location_updated` p/ user:cliente
      // e store:loja. Throttle 5s + só se moveu ~>10m, pra não floodar o socket.
      const did = deliveryIdRef.current;
      if (did && activeRef.current && emitRef.current) {
        const now = Date.now();
        const last = lastEmitPosRef.current;
        const moved =
          !last ||
          Math.abs(newLocation.lat - last.lat) >= 0.0001 ||
          Math.abs(newLocation.lng - last.lng) >= 0.0001;
        if (now - lastEmitRef.current >= 5000 && moved) {
          lastEmitRef.current = now;
          lastEmitPosRef.current = newLocation;
          emitRef.current('delivery:location_updated', {
            deliveryId: did,
            latitude: newLocation.lat,
            longitude: newLocation.lng,
            accuracy,
            timestamp: new Date().toISOString(),
          });
        }
      }

      logger.log('[Localização] Atualizado:', {
        lat: newLocation.lat.toFixed(6),
        lng: newLocation.lng.toFixed(6),
        accuracy: accuracy.toFixed(1) + 'm',
        timestamp: new Date().toLocaleTimeString('pt-BR'),
      });
    };

    const handleError = (err: GeolocationPositionError) => {
      logger.error('[Localização] Erro:', err.message, { code: err.code });
      // Não zera a última posição em timeout/indisponível transitório: só perde
      // o fix, mas mantém a última conhecida (evita "sumir" ao voltar do Waze).
      if (err.code === err.PERMISSION_DENIED) setCurrentLocation(null);
    };

    let watchId = window.navigator.geolocation.watchPosition(handlePosition, handleError, opts);
    logger.log('[Localização] Watch ID:', watchId);

    // Ao voltar pro app (ex.: fechou o Waze/Google Maps), o watchPosition da web
    // fica suspenso em background e às vezes NÃO volta sozinho. Aqui reiniciamos o
    // watch e forçamos um fix imediato — retoma o tempo real sem reaceitar o pedido.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      logger.log('[Localização] App voltou ao foco — retomando rastreamento');
      lastEmitRef.current = 0; // libera um emit imediato ao voltar
      try { window.navigator.geolocation.clearWatch(watchId); } catch { /* noop */ }
      watchId = window.navigator.geolocation.watchPosition(handlePosition, handleError, opts);
      window.navigator.geolocation.getCurrentPosition(handlePosition, handleError, opts);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      logger.log('[Localização] Parando monitoramento');
      window.navigator.geolocation.clearWatch(watchId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return { currentLocation, locationAccuracy };
}

export default useRideLocationRelay;
