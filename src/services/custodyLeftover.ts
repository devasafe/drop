import { prisma } from '../lib/prisma';

/** Repasse de custódia que ainda não saiu: o dono pode ver e sacar. */
const OPEN_PAYOUT_STATUSES = ['pending', 'released', 'requested'] as const;

/**
 * O usuário ainda tem dinheiro da custódia (modo app) depois da troca para o SaaS?
 *
 * P16: o saldo termina no modo em que nasceu — repasse em aberto (pending/released/requested)
 * dele ou de uma loja dele, ou carteira com saldo (disponível ou bloqueado em saque).
 * Erro de banco propaga: quem chama decide fechar (fail closed).
 */
export async function hasCustodyLeftover(userId: string): Promise<boolean> {
  const stores = await prisma.store.findMany({ where: { ownerId: userId }, select: { id: true } });
  const storeIds = stores.map((s) => s.id);

  const payout = await prisma.payout.findFirst({
    where: {
      status: { in: [...OPEN_PAYOUT_STATUSES] },
      OR: [
        { recipientType: 'motoboy', recipientId: userId },
        ...(storeIds.length ? [{ recipientType: 'store' as const, recipientId: { in: storeIds } }] : []),
      ],
    },
    select: { id: true },
  });
  if (payout) return true;

  const wallet = await prisma.wallet.findFirst({
    where: {
      OR: [
        { owner: userId, ownerType: { in: ['user', 'motoboy'] } },
        ...(storeIds.length ? [{ owner: { in: storeIds }, ownerType: 'store' as const }] : []),
      ],
      AND: [{ OR: [{ balance: { gt: 0 } }, { blockedBalance: { gt: 0 } }] }],
    },
    select: { id: true },
  });
  return !!wallet;
}
