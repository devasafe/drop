import webpush from 'web-push';
import { prisma } from '../lib/prisma';

/**
 * Web Push (notificações com o app fechado / celular bloqueado).
 *
 * Requer as chaves VAPID no ambiente:
 *   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY  (gere com `npx web-push generate-vapid-keys`)
 *   VAPID_SUBJECT (opcional, ex.: mailto:contato@dropapp.com.br)
 *
 * Sem as chaves, o push fica DESLIGADO de forma silenciosa (nada quebra): o app
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
    console.log('[push] Web Push habilitado (VAPID configurado).');
  } catch (err: any) {
    console.warn('[push] VAPID inválido — push desativado:', err?.message);
  }
} else {
  console.warn('[push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY ausentes — push desativado.');
}

export const isPushEnabled = () => enabled;
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
  if (!enabled) return;
  let subs: Array<{ id: string; endpoint: string; p256dh: string; auth: string }>;
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
  if (!enabled || userIds.length === 0) return;
  let subs: Array<{ id: string; endpoint: string; p256dh: string; auth: string }>;
  try {
    subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  } catch (err: any) {
    console.warn('[push] falha ao buscar inscrições:', err?.message);
    return;
  }
  await Promise.all(subs.map((s) => deliver(s, payload)));
}

async function deliver(
  sub: { id: string; endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
): Promise<void> {
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

/**
 * Notifica os motoboys ONLINE sobre uma nova corrida. Chamado ao criar a entrega,
 * junto do socket. Fire-and-forget: nunca bloqueia nem lança pro fluxo do pedido.
 */
export function notifyOnlineMotoboysNewDelivery(delivery: any): void {
  if (!enabled) return;
  (async () => {
    const motoboys = await prisma.user.findMany({
      where: { role: 'motoboy', isOnline: true },
      select: { id: true },
    });
    if (motoboys.length === 0) return;
    const fee = Number(delivery?.fee);
    const feeTxt = Number.isFinite(fee) && fee > 0 ? ` • R$ ${fee.toFixed(2).replace('.', ',')}` : '';
    await sendPushToUsers(motoboys.map((m) => m.id), {
      title: 'Nova corrida disponível! 🏍️',
      body: `Toque para ver e aceitar${feeTxt}`,
      url: '/motoboy',
      tag: 'nova-corrida',
    });
  })().catch((err) => console.warn('[push] notifyOnlineMotoboys erro:', err?.message));
}
