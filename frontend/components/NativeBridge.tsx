import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import { isNativeApp } from '../lib/native';
import { nativePushRefresh } from '../lib/nativePush';
import { safeNext } from '../lib/routes';

/**
 * Comportamentos que só existem no app Android: o botão voltar do aparelho, o toque numa
 * notificação push e o reenvio do token do push a cada login. Montado no _app; no navegador
 * não faz nada.
 */
export function NativeBridge() {
  const router = useRouter();
  const { user } = useAuth() || ({} as any);
  const userId = user?.id || user?._id || null;

  // Logado com o push já autorizado: o aparelho passa a avisar ESTA conta (troca de conta,
  // token novo do FCM). Sem autorização, nada (quem pede é a tela de notificações).
  useEffect(() => {
    if (!userId || !isNativeApp()) return;
    nativePushRefresh().catch(() => undefined);
  }, [userId]);

  useEffect(() => {
    if (!isNativeApp()) return;
    const subs: Array<Promise<{ remove: () => Promise<void> }>> = [];
    let off = false;
    (async () => {
      const { App } = await import('@capacitor/app');
      const { PushNotifications } = await import('@capacitor/push-notifications');
      if (off) return;
      // Voltar do Android: volta no histórico; na primeira tela, minimiza (não fecha o app).
      subs.push(App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) window.history.back();
        else App.minimizeApp();
      }));
      // Toque na notificação: abre a tela do aviso (o backend manda `url` nos dados).
      subs.push(PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
        const url = safeNext(notification?.data?.url);
        if (url) router.push(url);
      }));
    })().catch(() => { /* plugin ausente numa versão antiga do app: segue sem */ });
    return () => {
      off = true;
      subs.forEach((s) => s.then((h) => h.remove()).catch(() => undefined));
    };
  }, [router]);
  return null;
}
