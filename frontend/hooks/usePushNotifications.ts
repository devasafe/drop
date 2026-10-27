import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import { isNativeApp } from '../lib/native';
import { nativePushDisable, nativePushEnable, nativePushState, PushStepError } from '../lib/nativePush';

/**
 * Web Push no client: registra o service worker, pede permissão e inscreve o device.
 * É o que faz a corrida chegar com o app fechado / celular bloqueado (via notificação).
 *
 * iOS: só funciona com o app INSTALADO na tela inicial (Safari, iOS 16.4+).
 * App Android (Capacitor): não há Web Push na WebView; usa o FCM (lib/nativePush.ts).
 */

type Perm = 'default' | 'granted' | 'denied' | 'unsupported';

/** Avisos bloqueados: onde liberar depende de ser o app Android ou o navegador. */
export const PUSH_BLOCKED_APP = 'Avisos bloqueados. Libere em Configurações do Android → Apps → DROP → Notificações.';
export const PUSH_BLOCKED_WEB = 'Avisos bloqueados neste navegador. Libere as notificações nas configurações do site.';
/** O registro no Firebase não respondeu: quase sempre é o Google Play Services ausente ou antigo. */
export const PUSH_FAILED_APP = 'O celular não conseguiu registrar os avisos. Confira se o Google Play Services está instalado e atualizado e tente de novo.';
export const PUSH_FAILED_WEB = 'Não conseguimos ativar os avisos agora. Tente de novo.';

function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const buffer = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return buffer;
}

const isSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

export function usePushNotifications() {
  const [permission, setPermission] = useState<Perm>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const native = isNativeApp();

  // Estado inicial: suporte + permissão + se já existe inscrição neste device.
  useEffect(() => {
    if (isNativeApp()) {
      nativePushState().then((st) => { setPermission(st.permission); setSubscribed(st.subscribed); })
        .catch(() => setPermission('unsupported'));
      return;
    }
    if (!isSupported()) { setPermission('unsupported'); return; }
    setPermission(Notification.permission as Perm);
    navigator.serviceWorker.getRegistration().then((reg) => {
      reg?.pushManager.getSubscription().then((sub) => setSubscribed(!!sub)).catch(() => {});
    }).catch(() => {});
  }, []);

  const enable = useCallback(async (): Promise<boolean> => {
    if (isNativeApp()) {
      setBusy(true);
      setError(null);
      try {
        const r = await nativePushEnable();
        setPermission(r.permission);
        setSubscribed(r.ok);
        return r.ok;
      } catch (err) {
        console.warn('[push] enable no app falhou:', err);
        // A etapa vai junto: é o que diz onde o aparelho travou (carregar, permissão, canais, registro, servidor).
        setError(err instanceof PushStepError ? `${PUSH_FAILED_APP} (etapa: ${err.step})` : PUSH_FAILED_APP);
        return false;
      } finally {
        setBusy(false);
      }
    }
    if (!isSupported()) { setPermission('unsupported'); return false; }
    setBusy(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm as Perm);
      if (perm !== 'granted') return false;

      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const { data } = await api.get<{ publicKey: string; enabled: boolean }>('/push/vapid-public-key');
      if (!data?.enabled || !data?.publicKey) {
        console.warn('[push] servidor sem VAPID configurado');
        return false;
      }

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToBuffer(data.publicKey),
        });
      }

      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      await api.post('/push/subscribe', { endpoint: json.endpoint, keys: json.keys });
      setSubscribed(true);
      return true;
    } catch (err) {
      console.warn('[push] enable falhou:', err);
      setError(PUSH_FAILED_WEB);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async (): Promise<void> => {
    setBusy(true);
    try {
      if (isNativeApp()) {
        await nativePushDisable();
        setSubscribed(false);
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }, []);

  const sendTest = useCallback(async (): Promise<void> => {
    await api.post('/push/test').catch(() => {});
  }, []);

  return {
    supported: permission !== 'unsupported', permission, subscribed, busy, enable, disable, sendTest,
    /** Motivo da última falha ao ativar (some ao tentar de novo). */
    error,
    /** Texto para avisos bloqueados, certo para o app ou para o navegador. */
    blockedText: native ? PUSH_BLOCKED_APP : PUSH_BLOCKED_WEB,
  };
}
