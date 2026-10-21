import { NotificationType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import logger from '../config/logger';
import notifier from './notifier';
import { sendPushToUser } from './pushService';

/**
 * Links do painel da loja (DS v2, Fase D1). Fonte única para sino, push e socket:
 * nenhum aviso da loja aponta mais para `/store-dashboard`.
 */
export const STORE_LINKS = {
  order: (orderId: string) => `/seller/pedido/${orderId}`,
  dashboard: '/seller/dashboard',
  verification: '/seller/abrir',
  money: '/seller/dinheiro',
  ratings: '/seller/avaliacoes',
  /** D3b-2b: tela da mensalidade (aviso de cancelamento). */
  subscription: '/seller/assinatura',
} as const;

export interface StoreNotice {
  title: string;
  message: string;
  /** Para onde o toque leva (vai no sino E no push). */
  link: string;
  /** Pedido, loja ou transferência a que o aviso se refere. */
  entityId?: string | null;
  type?: NotificationType;
  /** Agrupa pushes do mesmo assunto no aparelho. */
  tag?: string;
  /** true: não grava de novo se já há aviso com o mesmo entityId + título (webhook e conciliação repetem). */
  dedupe?: boolean;
}

/** Links do app do motoboy usados em avisos (sino e push). */
export const MOTOBOY_LINKS = {
  /** Cadastro da chave Pix (tela compartilhada com a loja). */
  pixKey: '/dados-recebimento',
} as const;

/**
 * Avisa UM usuário: grava a Notification (fonte de verdade do sino), depois emite
 * `notification:received` só para a sala `user:<id>` e manda o push com o mesmo link.
 * Best-effort: nunca lança — quem chama já gravou o que importa (pedido, cancelamento, decisão).
 * Usa `notifier.io` direto (e não utils/socketEmitter) para não criar import circular:
 * o socketEmitter importa este arquivo.
 */
export async function notifyUser(userId: string | null | undefined, n: StoreNotice): Promise<void> {
  if (!userId) return;
  try {
    const uid = String(userId);
    const entityId = n.entityId ? String(n.entityId) : null;

    if (n.dedupe && entityId) {
      const dup = await prisma.notification.findFirst({ where: { userId: uid, entityId, title: n.title }, select: { id: true } });
      if (dup) return;
    }

    const row = await prisma.notification.create({
      data: { userId: uid, title: n.title, message: n.message, type: n.type ?? 'system', link: n.link, entityId, read: false },
    });
    notifier.io?.to(`user:${uid}`).emit('notification:received', { ...row, _id: row.id });
    await sendPushToUser(uid, { title: n.title, body: n.message, url: n.link, tag: n.tag });
  } catch (err) {
    logger.warn('[storeNotify] falha ao avisar o usuário', { userId: String(userId), errName: (err as Error)?.name });
  }
}

/** Avisa o DONO da loja (notifyUser no dono). Best-effort: nunca lança. */
export async function notifyStore(storeId: string | null | undefined, n: StoreNotice): Promise<void> {
  if (!storeId) return;
  try {
    const store = await prisma.store.findUnique({ where: { id: String(storeId) }, select: { ownerId: true } });
    if (!store?.ownerId) return;
    await notifyUser(String(store.ownerId), n);
  } catch (err) {
    logger.warn('[storeNotify] falha ao avisar a loja', { storeId: String(storeId), errName: (err as Error)?.name });
  }
}
