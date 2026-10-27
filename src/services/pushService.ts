import webpush from 'web-push';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { prisma } from '../lib/prisma';
import logger from '../config/logger';

/**
 * Push (notificações com o app fechado / celular bloqueado), por dois canais:
 *
 * - Web Push (navegador): chaves VAPID no ambiente
 *     VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY  (gere com `npx web-push generate-vapid-keys`)
 *     VAPID_SUBJECT (opcional, ex.: mailto:contato@dropapp.com.br)
 * - FCM (app Android, pasta mobile/): FIREBASE_SERVICE_ACCOUNT com o JSON da conta de
 *   serviço do Firebase em base64.
 *
 * Canal sem credencial fica DESLIGADO de forma silenciosa (nada quebra): o app
 * continua funcionando por socket enquanto está aberto. Nunca lança pro chamador.
 */

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:contato@dropapp.com.br';

let enabled = false;
if (PUBLIC_KEY && PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
    enabled = true;
    logger.debug('[push] Web Push habilitado (VAPID configurado).');
  } catch (err: any) {
    console.warn('[push] VAPID inválido — push desativado:', err?.message);
  }
} else {
  console.warn('[push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY ausentes — push desativado.');
}

let messaging: Messaging | null = null;
const FIREBASE_SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT || '';
if (FIREBASE_SERVICE_ACCOUNT) {
  try {
    const credentials = JSON.parse(Buffer.from(FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8'));
    const app = getApps()[0] || initializeApp({ credential: cert(credentials) });
    messaging = getMessaging(app);
    logger.debug('[push] FCM habilitado (app Android).');
  } catch (err: any) {
    console.warn('[push] FIREBASE_SERVICE_ACCOUNT inválido — push do app desativado:', err?.message);
  }
}

/** Web Push (VAPID) ligado — o que o navegador precisa saber. */
export const isPushEnabled = () => enabled;
/** FCM ligado — push do app Android. */
export const isFcmEnabled = () => messaging !== null;
/** Algum canal ligado (web ou app). */
const anyEnabled = () => enabled || messaging !== null;
export const getVapidPublicKey = () => PUBLIC_KEY;

export interface PushPayload {
  title: string;
  body: string;
  url?: string;   // pra onde o clique leva (default: /)
  tag?: string;   // agrupa/atualiza notificações do mesmo tipo
  icon?: string;
  badge?: string;
}

/** Envia para todos os devices de UM usuário. Best-effort; limpa inscrições mortas. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!anyEnabled()) return;
  let subs: Sub[];
  try {
    subs = await prisma.pushSubscription.findMany({ where: { userId } });
  } catch (err: any) {
    console.warn('[push] falha ao buscar inscrições:', err?.message);
    return;
  }
  await Promise.all(subs.map((s) => deliver(s, payload)));
}

/** Envia para vários usuários (ex.: todos os motoboys online). */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (!anyEnabled() || userIds.length === 0) return;
  let subs: Sub[];
  try {
    subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  } catch (err: any) {
    console.warn('[push] falha ao buscar inscrições:', err?.message);
    return;
  }
  await Promise.all(subs.map((s) => deliver(s, payload)));
}

type Sub = { id: string; endpoint: string; platform: string; p256dh: string | null; auth: string | null };

/** Prefixo do endpoint das inscrições do app Android: "fcm:<token>". */
export const FCM_ENDPOINT_PREFIX = 'fcm:';

async function deliver(sub: Sub, payload: PushPayload): Promise<void> {
  if (sub.platform === 'fcm') return deliverFcm(sub, payload);
  if (!enabled || !sub.p256dh || !sub.auth) return;
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 60 }, // corrida é efêmera: não vale entregar um push velho
    );
  } catch (err: any) {
    const code = err?.statusCode;
    // 404/410 = inscrição expirada/cancelada no navegador → remove pra não insistir.
    if (code === 404 || code === 410) {
      await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
    } else {
      console.warn('[push] envio falhou:', code, err?.body || err?.message);
    }
  }
}

// Token que o Firebase não reconhece mais (app desinstalado, dados apagados): apaga a inscrição.
const DEAD_FCM_TOKEN = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);

async function deliverFcm(sub: Sub, payload: PushPayload): Promise<void> {
  if (!messaging) return;
  const token = sub.endpoint.slice(FCM_ENDPOINT_PREFIX.length);
  try {
    await messaging.send({
      token,
      notification: { title: payload.title, body: payload.body },
      data: { url: payload.url || '/', ...(payload.tag ? { tag: payload.tag } : {}) },
      android: {
        priority: 'high',
        ttl: 60_000, // mesmo critério do Web Push: corrida é efêmera
        notification: {
          tag: payload.tag,
          // Canais criados pelo app (usePushNotifications): corrida nova toca alto.
          channelId: payload.tag === 'nova-corrida' ? 'corridas' : 'avisos',
          sound: 'default',
        },
      },
    });
  } catch (err: any) {
    if (DEAD_FCM_TOKEN.has(err?.code)) {
      await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
    } else {
      console.warn('[push] envio FCM falhou:', err?.code, err?.message);
    }
  }
}

// Roles de usuário final — quem NÃO é staff/admin. Usado para mirar os admins
// sem depender do nome exato de cada cargo interno (ceo, financeiro, etc.).
const END_USER_ROLES = ['cliente', 'lojista', 'motoboy'];

/** Notifica o DONO de uma loja (ex.: novo pedido, cancelamento, avaliação). */
export function notifyStoreOwner(storeId: string | undefined | null, payload: PushPayload): void {
  if (!anyEnabled() || !storeId) return;
  (async () => {
    const store = await prisma.store.findUnique({ where: { id: String(storeId) }, select: { ownerId: true } });
    if (store?.ownerId) await sendPushToUser(store.ownerId, payload);
  })().catch((err) => console.warn('[push] notifyStoreOwner erro:', err?.message));
}

/** Notifica a equipe/admin (todo usuário cujo cargo não é de usuário final). */
export function notifyAdmins(payload: PushPayload): void {
  if (!anyEnabled()) return;
  (async () => {
    const admins = await prisma.user.findMany({
      where: { role: { notIn: END_USER_ROLES as any } },
      select: { id: true },
    });
    if (admins.length === 0) return;
    await sendPushToUsers(admins.map((a) => a.id), payload);
  })().catch((err) => console.warn('[push] notifyAdmins erro:', err?.message));
}

/**
 * Notifica os motoboys ONLINE sobre uma nova corrida. Chamado ao criar a entrega,
 * junto do socket. Fire-and-forget: nunca bloqueia nem lança pro fluxo do pedido.
 */
export function notifyOnlineMotoboysNewDelivery(delivery: any): void {
  if (!anyEnabled()) return;
  (async () => {
    const motoboys = await prisma.user.findMany({
      where: { role: 'motoboy', isOnline: true },
      select: { id: true },
    });
    const excluded = new Set<string>((delivery?.excludedMotoboyIds ?? []).map(String));
    const targets = motoboys.filter((m) => !excluded.has(m.id));
    if (targets.length === 0) return;
    const fee = Number(delivery?.fee);
    const feeTxt = Number.isFinite(fee) && fee > 0 ? ` • R$ ${fee.toFixed(2).replace('.', ',')}` : '';
    await sendPushToUsers(targets.map((m) => m.id), {
      title: 'Nova corrida disponível! 🏍️',
      body: `Toque para ver e aceitar${feeTxt}`,
      url: '/motoboy',
      tag: 'nova-corrida',
    });
  })().catch((err) => console.warn('[push] notifyOnlineMotoboys erro:', err?.message));
}
