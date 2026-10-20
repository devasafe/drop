import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

/** De quem um cancelamento pode ser culpa numa estatística (platform não conta para ninguém). */
export type FaultParty = 'customer' | 'store' | 'motoboy';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Cancelamento feito pelo admin cuja culpa NÃO é de `party` (inclui platform e culpa vazia).
 * `faultParty: { not }` não pega NULL no Postgres, por isso o OR explícito.
 */
export function adminCancellationNotAgainst(party: FaultParty): Prisma.CancellationWhereInput {
  return { cancelledBy: 'admin', OR: [{ faultParty: null }, { faultParty: { not: party } }] };
}

/** Os cancelamentos que contam contra `party`: os de sempre, menos os do admin com outra culpa. */
export function countsAgainstWhere(party: FaultParty): Prisma.CancellationWhereInput {
  return { NOT: adminCancellationNotAgainst(party) };
}

/** Ids (dentre `orderIds`) dos pedidos cancelados pelo admin com culpa que não é de `party`. */
export async function orderIdsCancelledByAdminNotAgainst(party: FaultParty, orderIds: string[]): Promise<Set<string>> {
  if (orderIds.length === 0) return new Set();
  const rows = await prisma.cancellation.findMany({
    where: { orderId: { in: orderIds }, ...adminCancellationNotAgainst(party) },
    select: { orderId: true },
  });
  return new Set(rows.map((r) => r.orderId));
}

/**
 * Cancelamentos do cliente nos últimos 30 dias: os que ele mesmo fez e os do admin com culpa
 * do cliente. Recusa da loja, culpa do motoboy e culpa do DROP não contam.
 */
export async function countCustomerCancellations30d(customerId: string, now: Date = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 30 * DAY_MS);
  // Todos os pedidos do cliente: um pedido antigo cancelado nos últimos 30 dias conta (a janela é
  // a do cancelamento, como na P1.5).
  const orders = await prisma.order.findMany({ where: { customerId: String(customerId) }, select: { id: true } });
  if (orders.length === 0) return 0;
  return prisma.cancellation.count({
    where: {
      orderId: { in: orders.map((o) => o.id) },
      createdAt: { gte: since },
      OR: [{ cancelledBy: 'customer' }, { cancelledBy: 'admin', faultParty: 'customer' }],
    },
  });
}
