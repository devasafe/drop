// Repositório do CustomerDebt (multa de cancelamento tardio pendente) em Prisma/Postgres.
// `amount` é Decimal → number na fronteira; reexpõe `_id`.
import { prisma } from '../lib/prisma';
import type { Prisma } from '@prisma/client';

const num = (v: any) => (v == null ? v : Number(v));

export function toApiDebt(d: any): any {
  if (!d) return d;
  return { ...d, _id: d.id, amount: num(d.amount) };
}

export async function findPendingDebt(customerId: string, tx?: Prisma.TransactionClient): Promise<any | null> {
  const db = tx ?? prisma;
  const d = await db.customerDebt.findFirst({ where: { customerId: String(customerId), status: 'pending' } });
  return toApiDebt(d);
}

export async function createDebt(data: {
  customerId: string;
  amount: number;
  sourceOrderId: string;
  reason: string;
  status?: string;
}, tx?: Prisma.TransactionClient): Promise<any> {
  const db = tx ?? prisma;
  const d = await db.customerDebt.create({
    data: {
      customerId: String(data.customerId),
      amount: data.amount,
      sourceOrderId: String(data.sourceOrderId),
      reason: data.reason,
      status: (data.status as any) ?? 'pending',
    },
  });
  return toApiDebt(d);
}

export async function updateDebt(id: string, data: Record<string, any>, tx?: Prisma.TransactionClient): Promise<any> {
  const db = tx ?? prisma;
  const d = await db.customerDebt.update({ where: { id: String(id) }, data });
  return toApiDebt(d);
}

/**
 * D3b-2a · baixa condicional na cobrança: só passa de pending para collected se a dívida AINDA
 * estiver pending. false = alguém mudou antes (o admin perdoou) e a multa não deve ser cobrada.
 */
export async function claimPendingDebt(id: string, tx?: Prisma.TransactionClient): Promise<boolean> {
  const db = tx ?? prisma;
  const { count } = await db.customerDebt.updateMany({
    where: { id: String(id), status: 'pending' },
    data: { status: 'collected', collectedAt: new Date() },
  });
  return count === 1;
}

/** Desfaz a baixa quando o débito da multa falha logo depois dela (a dívida volta a pending). */
export async function releaseDebtClaim(id: string, tx?: Prisma.TransactionClient): Promise<void> {
  const db = tx ?? prisma;
  await db.customerDebt.updateMany({
    where: { id: String(id), status: 'collected', collectedOrderId: null },
    data: { status: 'pending', collectedAt: null },
  });
}

/** Liga a dívida ao pedido que a cobrou (só se ela foi mesmo cobrada). */
export async function linkCollectedDebt(id: string, orderId: string, tx?: Prisma.TransactionClient): Promise<void> {
  const db = tx ?? prisma;
  await db.customerDebt.updateMany({
    where: { id: String(id), status: 'collected' },
    data: { collectedOrderId: String(orderId) },
  });
}
