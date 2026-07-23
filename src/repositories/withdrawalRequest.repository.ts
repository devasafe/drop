// Repositório do WithdrawalRequest (saque de motoboy/lojista/user) em Prisma/Postgres.
// `amount` é Decimal → number na fronteira; reexpõe `_id`.
import { prisma } from '../lib/prisma';

const num = (v: any) => (v == null ? v : Number(v));

export function toApiWR(w: any): any {
  if (!w) return w;
  return { ...w, _id: w.id, amount: num(w.amount) };
}

export async function createWR(data: Record<string, any>): Promise<any> {
  const w = await prisma.withdrawalRequest.create({ data: data as any });
  return toApiWR(w);
}

export async function findWRById(id: string): Promise<any | null> {
  const w = await prisma.withdrawalRequest.findUnique({ where: { id: String(id) } });
  return toApiWR(w);
}

export async function findWRByStatus(status: string): Promise<any[]> {
  const list = await prisma.withdrawalRequest.findMany({ where: { status: status as any }, orderBy: { requestedAt: 'desc' } });
  return list.map(toApiWR);
}

export async function findAllWR(limit: number, skip: number): Promise<any[]> {
  const list = await prisma.withdrawalRequest.findMany({ orderBy: { requestedAt: 'desc' }, take: limit, skip });
  return list.map(toApiWR);
}

export async function countWR(): Promise<number> {
  return prisma.withdrawalRequest.count();
}

export async function findWRByMotoboy(motoboyId: string): Promise<any[]> {
  const list = await prisma.withdrawalRequest.findMany({ where: { motoboyId: String(motoboyId) }, orderBy: { requestedAt: 'desc' } });
  return list.map(toApiWR);
}

export async function updateWR(id: string, data: Record<string, any>): Promise<any> {
  const w = await prisma.withdrawalRequest.update({ where: { id: String(id) }, data });
  return toApiWR(w);
}
