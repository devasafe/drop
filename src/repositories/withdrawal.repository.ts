// Repositório do Withdrawal (saque do caixa do app/AppCashbox) em Prisma/Postgres.
// `amount` é Decimal → number na fronteira; reexpõe `_id`.
import { prisma } from '../lib/prisma';

const num = (v: any) => (v == null ? v : Number(v));

export function toApiWithdrawal(w: any): any {
  if (!w) return w;
  return { ...w, _id: w.id, amount: num(w.amount) };
}

export async function createWithdrawal(data: Record<string, any>): Promise<any> {
  const w = await prisma.withdrawal.create({ data: data as any });
  return toApiWithdrawal(w);
}

export async function findWithdrawalById(id: string): Promise<any | null> {
  const w = await prisma.withdrawal.findUnique({ where: { id: String(id) } });
  return toApiWithdrawal(w);
}

export async function findWithdrawals(where: any, skip: number, limit: number): Promise<any[]> {
  const list = await prisma.withdrawal.findMany({ where, orderBy: { requestedAt: 'desc' }, skip, take: limit });
  return list.map(toApiWithdrawal);
}

export async function countWithdrawals(where: any): Promise<number> {
  return prisma.withdrawal.count({ where });
}

export async function updateWithdrawal(id: string, data: Record<string, any>): Promise<any> {
  const w = await prisma.withdrawal.update({ where: { id: String(id) }, data });
  return toApiWithdrawal(w);
}
