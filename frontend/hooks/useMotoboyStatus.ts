import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../lib/api';

const GPS_THROTTLE_MS = 15000;

/**
 * Status online/offline do motoboy + envio de GPS. Estado inicial vem do backend
 * (GET /deliveries/availability). Offline não envia GPS; a página é quem esconde o
 * pool. Ver docs/superpowers/plans/2026-08-03-etapa4-motoboy-cockpit.md.
 */
export function useMotoboyStatus() {
  const [online, setOnlineState] = useState(false);
  const [loading, setLoading] = useState(true);
  const lastSentRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    api.get<{ isOnline: boolean }>('/deliveries/availability')
      .then((r) => { if (!cancelled) setOnlineState(!!r.data?.isOnline); })
      .catch(() => { /* mantém offline por segurança */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const setOnline = useCallback(async (next: boolean) => {
    setOnlineState(next); // otimista
    try {
      await api.post('/deliveries/availability', { isOnline: next });
    } catch (err) {
      setOnlineState(!next); // reverte
      throw err;
    }
  }, []);

  // GPS só quando online → alimenta o despacho por raio.
  useEffect(() => {
    if (!online || typeof navigator === 'undefined' || !navigator.geolocation) return;
    const send = (pos: GeolocationPosition) => {
      const now = Date.now();
      if (now - lastSentRef.current < GPS_THROTTLE_MS) return;
      lastSentRef.current = now;
      api.post('/deliveries/location', {
        lat: pos.coords.latitude, lng: pos.coords.longitude, isOnline: true,
      }).catch(() => {});
    };
    navigator.geolocation.getCurrentPosition(send, () => {}, { enableHighAccuracy: true, timeout: 10000 });
    const watchId = navigator.geolocation.watchPosition(send, () => {}, {
      enableHighAccuracy: true, maximumAge: 10000, timeout: 20000,
    });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [online]);

  return { online, loading, setOnline };
}
