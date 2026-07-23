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
