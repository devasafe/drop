import { prisma } from '../../lib/prisma';
import { notifyStore, STORE_LINKS } from '../storeNotify';
import { recordAccountAction, AccountActor } from './actions';
import { AccountActionError, parseOptionalReason, parseRequiredReason, storeNotFound } from './errors';

/**
 * D3b-2a · pausa da loja pelo admin (spec 5.4). Só o admin libera. Enquanto `adminPausedAt` não
 * for nulo, a loja some da vitrine, não recebe pedido novo e o lojista não reabre (Task 1.5).
 * `isOpen`, `pausedUntil` e os pedidos em andamento não são tocados: ao liberar, a loja volta ao
 * estado que o lojista deixou. As duas escritas são condicionais (idempotentes, com 409).
 * O ator pode ser `{ id: 'system', role: 'system' }` (job da mensalidade cancelada, D3b-2b).
 */

export const STORE_ADMIN_PAUSED_SELLER_MESSAGE = 'Sua loja está pausada pelo DROP. Fale com o suporte.';
export const STORE_ADMIN_PAUSED_CUSTOMER_MESSAGE = 'Esta loja está indisponível no momento.';

export function isAdminPaused(store: { adminPausedAt?: Date | string | null }): boolean {
  return store.adminPausedAt != null;
}

export interface AdminPauseState {
  id: string;
  adminPausedAt: string | null;
  adminPauseReason: string | null;
}

export async function pauseStoreByAdmin(
  storeId: string,
  actor: AccountActor,
  rawReason: unknown,
): Promise<{ store: AdminPauseState }> {
  const reason = parseRequiredReason(rawReason);
  const pausedAt = new Date();

  await prisma.$transaction(async (tx) => {
    const store = await tx.store.findUnique({ where: { id: storeId }, select: { id: true } });
    if (!store) throw storeNotFound();
    const { count } = await tx.store.updateMany({
      where: { id: storeId, adminPausedAt: null },
      data: { adminPausedAt: pausedAt, adminPausedBy: actor.id, adminPauseReason: reason },
    });
    if (count === 0) throw new AccountActionError(409, 'ALREADY_PAUSED', 'A loja já está pausada pelo DROP.');
    await recordAccountAction(tx, { actor, storeId, type: 'store_pause', reason });
  });

  // Depois do commit e best-effort (notifyStore nunca lança).
  await notifyStore(storeId, {
    title: 'Loja pausada pelo DROP',
    message: `O DROP pausou a sua loja e ela não recebe pedidos novos. Fale com o suporte. Motivo: ${reason}`,
    link: STORE_LINKS.dashboard,
    entityId: storeId,
    tag: 'loja-pausa-drop',
  });
  return { store: { id: storeId, adminPausedAt: pausedAt.toISOString(), adminPauseReason: reason } };
}

export async function unpauseStoreByAdmin(
  storeId: string,
  actor: AccountActor,
  rawReason?: unknown,
): Promise<{ store: AdminPauseState }> {
  const reason = parseOptionalReason(rawReason);

  await prisma.$transaction(async (tx) => {
    const store = await tx.store.findUnique({
      where: { id: storeId },
      select: { id: true, adminPausedAt: true, adminPauseReason: true },
    });
    if (!store) throw storeNotFound();
    const { count } = await tx.store.updateMany({
      where: { id: storeId, adminPausedAt: { not: null } },
      data: { adminPausedAt: null, adminPausedBy: null, adminPauseReason: null },
    });
    if (count === 0) throw new AccountActionError(409, 'NOT_PAUSED', 'A loja não está pausada pelo DROP.');
    await recordAccountAction(tx, {
      actor, storeId, type: 'store_unpause', reason,
      meta: { pausedAt: store.adminPausedAt ? store.adminPausedAt.toISOString() : null, pauseReason: store.adminPauseReason },
    });
  });

  await notifyStore(storeId, {
    title: 'Loja liberada pelo DROP',
    message: 'O DROP liberou a sua loja. Ela volta a receber pedidos no seu horário.',
    link: STORE_LINKS.dashboard,
    entityId: storeId,
    tag: 'loja-pausa-drop',
  });
  return { store: { id: storeId, adminPausedAt: null, adminPauseReason: null } };
}
