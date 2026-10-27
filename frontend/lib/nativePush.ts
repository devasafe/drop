import api from './api';

/**
 * Push no app Android (FCM via @capacitor/push-notifications). O Web Push não existe na
 * WebView, então o `usePushNotifications` delega para cá quando `isNativeApp()`.
 * O token do aparelho vai para o backend em POST /push/subscribe { platform: 'fcm', token }.
 */

export type NativePerm = 'default' | 'granted' | 'denied';

const TOKEN_KEY = 'drop.fcmToken';
const REGISTER_TIMEOUT_MS = 15000;

/** Etapa da ativação que falhou ou não respondeu: vai na mensagem de erro para diagnóstico. */
export type PushStep = 'carregar' | 'permissao' | 'canais' | 'registro' | 'servidor';
export class PushStepError extends Error {
  constructor(public step: PushStep, cause?: unknown) {
    super(`push: etapa ${step}${cause instanceof Error ? ` (${cause.message})` : ''}`);
  }
}

/** Nenhuma chamada ao Android pode prender o botão: cada etapa tem prazo e diz qual foi. */
function step<T>(name: PushStep, ms: number, run: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new PushStepError(name, new Error('sem resposta'))), ms);
    run().then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e instanceof PushStepError ? e : new PushStepError(name, e)); },
    );
  });
}

const plugin = () => step('carregar', 10000, async () => (await import('@capacitor/push-notifications')).PushNotifications);

const readToken = (): string | null => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
const writeToken = (t: string | null) => {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
};

const toPerm = (receive: string): NativePerm => (receive === 'granted' ? 'granted' : receive === 'denied' ? 'denied' : 'default');

export async function nativePushState(): Promise<{ permission: NativePerm; subscribed: boolean }> {
  const PushNotifications = await plugin();
  const { receive } = await step('permissao', 8000, () => PushNotifications.checkPermissions());
  const permission = toPerm(receive);
  return { permission, subscribed: permission === 'granted' && !!readToken() };
}

/** Canais do Android 8+: corrida nova toca alto; o resto é aviso normal (mesmos ids do backend). */
async function ensureChannels() {
  const PushNotifications = await plugin();
  await step('canais', 8000, async () => {
    await PushNotifications.createChannel({ id: 'corridas', name: 'Corridas novas', importance: 5, visibility: 1, sound: 'default', vibration: true });
    await PushNotifications.createChannel({ id: 'avisos', name: 'Pedidos e avisos', importance: 4, visibility: 1, vibration: true });
  });
}

/** Registra o aparelho no FCM e devolve o token (ou falha em 15 s). */
async function registerToken(): Promise<string> {
  const PushNotifications = await plugin();
  return new Promise<string>((resolve, reject) => {
    const handles: Array<Promise<{ remove: () => Promise<void> }>> = [];
    const done = () => handles.forEach((h) => h.then((x) => x.remove()).catch(() => undefined));
    const fail = (e: unknown) => { clearTimeout(timer); done(); reject(new PushStepError('registro', e)); };
    const timer = setTimeout(() => fail(new Error('sem resposta do Firebase')), REGISTER_TIMEOUT_MS);
    handles.push(PushNotifications.addListener('registration', ({ value }) => { clearTimeout(timer); done(); resolve(value); }));
    handles.push(PushNotifications.addListener('registrationError', (e) => fail(new Error(e?.error || 'falha no registro'))));
    PushNotifications.register().catch(fail);
  });
}

/** Pede a permissão (se ainda não decidiu), registra e envia o token ao backend. */
export async function nativePushEnable(): Promise<{ permission: NativePerm; ok: boolean }> {
  const PushNotifications = await plugin();
  let { receive } = await step('permissao', 8000, () => PushNotifications.checkPermissions());
  if (receive === 'prompt' || receive === 'prompt-with-rationale') {
    // Espera a pessoa responder à janela do Android.
    ({ receive } = await step('permissao', 120000, () => PushNotifications.requestPermissions()));
  }
  const permission = toPerm(receive);
  if (permission !== 'granted') return { permission, ok: false };
  await ensureChannels();
  const token = await registerToken();
  await step('servidor', 20000, () => api.post('/push/subscribe', { platform: 'fcm', token }));
  writeToken(token);
  return { permission, ok: true };
}

/** Já autorizado: reenvia o token (troca de conta no aparelho, token novo do FCM). Silencioso. */
export async function nativePushRefresh(): Promise<void> {
  const PushNotifications = await plugin();
  const { receive } = await step('permissao', 8000, () => PushNotifications.checkPermissions());
  if (receive !== 'granted') return;
  await ensureChannels();
  const token = await registerToken();
  await step('servidor', 20000, () => api.post('/push/subscribe', { platform: 'fcm', token }));
  writeToken(token);
}

export async function nativePushDisable(): Promise<void> {
  const token = readToken();
  if (token) await api.post('/push/unsubscribe', { endpoint: `fcm:${token}` }).catch(() => undefined);
  writeToken(null);
  const PushNotifications = await plugin();
  await PushNotifications.unregister().catch(() => undefined);
}

/**
 * Logout no app: o aparelho deixa de receber os avisos da conta que saiu. Envia antes de o
 * logout limpar o cookie (a requisição sai já autenticada). Mantém a permissão do Android;
 * o próximo login reenvia o token (NativeBridge).
 */
export function nativePushForget(): void {
  const token = readToken();
  if (!token) return;
  writeToken(null);
  api.post('/push/unsubscribe', { endpoint: `fcm:${token}` }).catch(() => undefined);
}
