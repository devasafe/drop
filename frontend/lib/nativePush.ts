import api from './api';

/**
 * Push no app Android (FCM via @capacitor/push-notifications). O Web Push não existe na
 * WebView, então o `usePushNotifications` delega para cá quando `isNativeApp()`.
 * O token do aparelho vai para o backend em POST /push/subscribe { platform: 'fcm', token }.
 */

export type NativePerm = 'default' | 'granted' | 'denied';

const TOKEN_KEY = 'drop.fcmToken';
const REGISTER_TIMEOUT_MS = 15000;

const plugin = async () => (await import('@capacitor/push-notifications')).PushNotifications;

const readToken = (): string | null => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
const writeToken = (t: string | null) => {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
};

const toPerm = (receive: string): NativePerm => (receive === 'granted' ? 'granted' : receive === 'denied' ? 'denied' : 'default');

export async function nativePushState(): Promise<{ permission: NativePerm; subscribed: boolean }> {
  const PushNotifications = await plugin();
  const { receive } = await PushNotifications.checkPermissions();
  const permission = toPerm(receive);
  return { permission, subscribed: permission === 'granted' && !!readToken() };
}

/** Canais do Android 8+: corrida nova toca alto; o resto é aviso normal (mesmos ids do backend). */
async function ensureChannels() {
  const PushNotifications = await plugin();
  await PushNotifications.createChannel({ id: 'corridas', name: 'Corridas novas', importance: 5, visibility: 1, sound: 'default', vibration: true });
  await PushNotifications.createChannel({ id: 'avisos', name: 'Pedidos e avisos', importance: 4, visibility: 1, vibration: true });
}

/** Registra o aparelho no FCM e devolve o token (ou falha em 15 s). */
async function registerToken(): Promise<string> {
  const PushNotifications = await plugin();
  return new Promise<string>((resolve, reject) => {
    const handles: Array<Promise<{ remove: () => Promise<void> }>> = [];
    const done = () => handles.forEach((h) => h.then((x) => x.remove()).catch(() => undefined));
    const timer = setTimeout(() => { done(); reject(new Error('timeout no registro do push')); }, REGISTER_TIMEOUT_MS);
    handles.push(PushNotifications.addListener('registration', ({ value }) => { clearTimeout(timer); done(); resolve(value); }));
    handles.push(PushNotifications.addListener('registrationError', (e) => { clearTimeout(timer); done(); reject(new Error(e?.error || 'falha no registro do push')); }));
    PushNotifications.register().catch((e) => { clearTimeout(timer); done(); reject(e); });
  });
}

/** Pede a permissão (se ainda não decidiu), registra e envia o token ao backend. */
export async function nativePushEnable(): Promise<{ permission: NativePerm; ok: boolean }> {
  const PushNotifications = await plugin();
  let { receive } = await PushNotifications.checkPermissions();
  if (receive === 'prompt' || receive === 'prompt-with-rationale') ({ receive } = await PushNotifications.requestPermissions());
  const permission = toPerm(receive);
  if (permission !== 'granted') return { permission, ok: false };
  await ensureChannels();
  const token = await registerToken();
  await api.post('/push/subscribe', { platform: 'fcm', token });
  writeToken(token);
  return { permission, ok: true };
}

/** Já autorizado: reenvia o token (troca de conta no aparelho, token novo do FCM). Silencioso. */
export async function nativePushRefresh(): Promise<void> {
  const PushNotifications = await plugin();
  const { receive } = await PushNotifications.checkPermissions();
  if (receive !== 'granted') return;
  await ensureChannels();
  const token = await registerToken();
  await api.post('/push/subscribe', { platform: 'fcm', token });
  writeToken(token);
}

export async function nativePushDisable(): Promise<void> {
  const token = readToken();
  if (token) await api.post('/push/unsubscribe', { endpoint: `fcm:${token}` }).catch(() => undefined);
  writeToken(null);
  const PushNotifications = await plugin();
  await PushNotifications.unregister().catch(() => undefined);
}
