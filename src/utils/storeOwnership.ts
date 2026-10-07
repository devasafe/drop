import { prisma } from '../lib/prisma';

/**
 * True se `userId` é o dono da loja `storeId`. Fail closed: ids ausentes ou loja
 * inexistente → false. Usar em toda rota que recebe storeId do cliente e mexe com
 * dinheiro (transferência, saque, payouts) — nunca confiar no storeId do corpo/query.
 */
export async function isStoreOwner(storeId: unknown, userId: unknown): Promise<boolean> {
  if (!storeId || !userId) return false;
  const store = await prisma.store.findUnique({
    where: { id: String(storeId) },
    select: { ownerId: true },
  });
  return !!store && String(store.ownerId) === String(userId);
}
