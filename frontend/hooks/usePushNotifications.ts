import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';

/**
 * Web Push no client: registra o service worker, pede permissão e inscreve o device.
 * É o que faz a corrida chegar com o app fechado / celular bloqueado (via notificação).
 *
 * iOS: só funciona com o app INSTALADO na tela inicial (Safari, iOS 16.4+).
 */

type Perm = 'default' | 'granted' | 'denied' | 'unsupported';

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

  // Estado inicial: suporte + permissão + se já existe inscrição neste device.
  useEffect(() => {
    if (!isSupported()) { setPermission('unsupported'); return; }
    setPermission(Notification.permission as Perm);
    navigator.serviceWorker.getRegistration().then((reg) => {
      reg?.pushManager.getSubscription().then((sub) => setSubscribed(!!sub)).catch(() => {});
    }).catch(() => {});
  }, []);

  const enable = useCallback(async (): Promise<boolean> => {
    if (!isSupported()) { setPermission('unsupported'); return false; }
    setBusy(true);
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
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async (): Promise<void> => {
    setBusy(true);
    try {
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

  return { supported: permission !== 'unsupported', permission, subscribed, busy, enable, disable, sendTest };
}
