import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import { isNativeApp } from '../lib/native';
import { watchNativeLocation } from '../lib/nativeLocation';

const GPS_THROTTLE_MS = 15000; // manda a posição pro servidor no máx a cada 15s
const STALE_MS = 40000;        // sem fix novo por 40s (ou app em background) → "parada"
/** Margem de erro acima disso = localização "Aproximada" do Android (o servidor usa o mesmo limite). */
export const IMPRECISE_ACCURACY_M = 500;
/** O 1º fix costuma vir impreciso: só avisa se continuar assim por esse tempo. */
const IMPRECISE_GRACE_MS = 20000;

/** off = motoboy offline · active = atualizando · stale = travou (background/bloqueado) · denied = sem permissão */
export type GpsState = 'off' | 'active' | 'stale' | 'denied';

/**
 * Status online/offline do motoboy + envio de GPS + saúde do GPS (`gps`).
 * ⚠️ A web NÃO mantém GPS em segundo plano: quando a tela bloqueia ou o app sai
 * de foco, o `watchPosition` para. Aqui a gente DETECTA isso (`stale`) pra avisar
 * o motoboy — não dá pra continuar rastreando sem um app nativo.
 * No app Android (`isNativeApp`) o GPS segue com a tela apagada (lib/nativeLocation.ts), que
 * também envia a posição; aqui só acompanhamos a saúde.
 * `imprecise`: o celular está na localização "Aproximada" (margem de erro de km). O servidor não
 * manda corrida nova assim; a tela pede para ligar a localização precisa.
 */
export function useMotoboyStatus() {
  const [online, setOnlineState] = useState(false);
  const [loading, setLoading] = useState(true);
  const [gps, setGps] = useState<GpsState>('off');
  const [imprecise, setImprecise] = useState(false);
  const lastSentRef = useRef(0);
  const lastFixRef = useRef(0);
  // Desde quando os fixes vêm imprecisos (0 = o último foi preciso).
  const impreciseSinceRef = useRef(0);

  const trackAccuracy = useCallback((accuracy: number | null | undefined) => {
    if (accuracy == null || !Number.isFinite(accuracy) || accuracy <= IMPRECISE_ACCURACY_M) {
      impreciseSinceRef.current = 0;
      setImprecise(false);
      return;
    }
    const now = Date.now();
    if (!impreciseSinceRef.current) impreciseSinceRef.current = now;
    if (now - impreciseSinceRef.current >= IMPRECISE_GRACE_MS) setImprecise(true);
  }, []);

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
    impreciseSinceRef.current = 0;
    setImprecise(false);
    if (!online) { setGps('off'); return; }
    if (isNativeApp()) {
      lastFixRef.current = Date.now();
      setGps('active');
      const stopWatch = watchNativeLocation({
        onFix: (fix) => { lastFixRef.current = Date.now(); setGps('active'); trackAccuracy(fix.accuracy); },
        onError: (code) => { if (code === 'denied') setGps('denied'); },
      });
      // Tela apagada não trava o GPS nativo: "parada" só sem posição nova.
      const timer = setInterval(() => {
        setGps((prev) => (prev === 'denied' ? prev : Date.now() - lastFixRef.current > STALE_MS ? 'stale' : 'active'));
      }, 5000);
      return () => { stopWatch(); clearInterval(timer); };
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setGps('denied'); return; }

    lastFixRef.current = Date.now(); // grace: evita "parada" antes do 1º fix
    setGps('active');

    const onFix = (pos: GeolocationPosition) => {
      lastFixRef.current = Date.now();
      setGps('active');
      trackAccuracy(pos.coords.accuracy);
      const now = Date.now();
      if (now - lastSentRef.current < GPS_THROTTLE_MS) return;
      lastSentRef.current = now;
      api.post('/deliveries/location', {
        lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, isOnline: true,
      }).catch(() => {});
    };
    const onErr = (err: GeolocationPositionError) => {
      if (err && err.code === 1 /* PERMISSION_DENIED */) setGps('denied');
      // timeout/unavailable: não vira 'denied'; o timer abaixo marca 'stale'
    };

    navigator.geolocation.getCurrentPosition(onFix, onErr, { enableHighAccuracy: true, timeout: 10000 });
    const watchId = navigator.geolocation.watchPosition(onFix, onErr, {
      enableHighAccuracy: true, maximumAge: 10000, timeout: 20000,
    });

    // Detecta "travou": sem fix recente OU app em segundo plano (tela bloqueada).
    const timer = setInterval(() => {
      setGps((prev) => {
        if (prev === 'denied') return prev;
        const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
        return (hidden || Date.now() - lastFixRef.current > STALE_MS) ? 'stale' : 'active';
      });
    }, 5000);

    // Ao voltar pro foreground, força um fix novo (recupera do background).
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        navigator.geolocation.getCurrentPosition(onFix, onErr, { enableHighAccuracy: true, timeout: 10000 });
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [online, trackAccuracy]);

  return { online, loading, setOnline, gps, imprecise };
}
