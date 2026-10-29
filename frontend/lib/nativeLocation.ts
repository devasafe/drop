import type { BackgroundGeolocationPlugin, Location } from '@capacitor-community/background-geolocation';
import { API_BASE } from './config';

/**
 * GPS do motoboy no app Android, com a tela apagada: um serviço em primeiro plano (notificação
 * fixa) do @capacitor-community/background-geolocation. Um watcher só para o app inteiro,
 * ligado enquanto houver alguém ouvindo (motoboy online ou numa corrida).
 *
 * A posição vai ao servidor por HTTP nativo (CapacitorHttp): em segundo plano o Android segura
 * as requisições da WebView e o socket cai. O cookie de login vai junto (mesmo armazenamento).
 */

export interface NativeFix { lat: number; lng: number; accuracy: number }
interface Listener { onFix: (fix: NativeFix) => void; onError?: (code: 'denied' | 'error') => void }

const SEND_EVERY_MS = 15000;      // online, esperando corrida (despacho por raio)
const SEND_EVERY_RIDE_MS = 5000;  // em corrida: o cliente acompanha no mapa

const listeners = new Set<Listener>();
let watcher: Promise<string> | null = null;
let rideActive = false;
let lastSent = 0;

// Embrulhado num objeto: o plugin é um Proxy do Capacitor e, devolvido direto por uma
// função async, o JS chamaria `plugin.then(...)` como método nativo, que nunca responde.
const pluginRef = async () => {
  const { registerPlugin } = await import('@capacitor/core');
  return { BackgroundGeolocation: registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation') };
};

async function send(loc: Location) {
  const now = Date.now();
  if (now - lastSent < (rideActive ? SEND_EVERY_RIDE_MS : SEND_EVERY_MS)) return;
  lastSent = now;
  const { CapacitorHttp } = await import('@capacitor/core');
  await CapacitorHttp.post({
    url: `${API_BASE}/deliveries/location`,
    headers: { 'Content-Type': 'application/json' },
    // `simulated`: o Android diz que a posição veio de um app de GPS falso.
    data: { lat: loc.latitude, lng: loc.longitude, accuracy: loc.accuracy, isOnline: true, simulated: !!loc.simulated },
  }).catch(() => undefined);
}

async function start(): Promise<string> {
  const { BackgroundGeolocation } = await pluginRef();
  return BackgroundGeolocation.addWatcher(
    {
      backgroundTitle: 'DROP: você está online',
      backgroundMessage: 'Usamos sua localização para mandar corridas e mostrar a entrega ao cliente.',
      requestPermissions: true,
      stale: false,
      // 0 = posição contínua mesmo parado (esperando na loja): sem isso o despacho acha que o GPS travou.
      distanceFilter: 0,
    },
    (loc, err) => {
      if (err) {
        const code = err.code === 'NOT_AUTHORIZED' ? 'denied' : 'error';
        listeners.forEach((l) => l.onError?.(code));
        return;
      }
      if (!loc) return;
      const fix = { lat: loc.latitude, lng: loc.longitude, accuracy: loc.accuracy };
      listeners.forEach((l) => l.onFix(fix));
      send(loc).catch(() => undefined);
    },
  );
}

function stop() {
  const current = watcher;
  watcher = null;
  current?.then(async (id) => (await pluginRef()).BackgroundGeolocation.removeWatcher({ id })).catch(() => undefined);
}

/** Começa a ouvir a posição (liga o serviço se for o primeiro). Devolve a função de parar. */
export function watchNativeLocation(listener: Listener): () => void {
  listeners.add(listener);
  if (!watcher) {
    watcher = start();
    watcher.catch(() => { watcher = null; listener.onError?.('error'); });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

/** Abre a tela do app nas configurações do Android (para ligar a localização precisa). */
export async function openNativeLocationSettings(): Promise<void> {
  const { BackgroundGeolocation } = await pluginRef();
  await BackgroundGeolocation.openSettings();
}

/** Em corrida, a posição sai a cada 5 s (o servidor repassa ao cliente e à loja). */
export function setNativeRideActive(on: boolean): void {
  if (on && !rideActive) lastSent = 0; // manda já a primeira
  rideActive = on;
}
