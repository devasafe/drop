// Repositório do StoreSubscription (plano/assinatura da loja) em Prisma/Postgres.
// `commissionRate` é Decimal → number na fronteira; reexpõe `_id`.
import { prisma } from '../lib/prisma';

const num = (v: any) => (v == null ? v : Number(v));

export function toApiSub(s: any): any {
  if (!s) return s;
  return { ...s, _id: s.id, commissionRate: num(s.commissionRate) };
}

export async function findSubByStoreId(storeId: string): Promise<any | null> {
  const s = await prisma.storeSubscription.findUnique({ where: { storeId: String(storeId) } });
  return toApiSub(s);
}

export async function findSubById(id: string): Promise<any | null> {
  const s = await prisma.storeSubscription.findUnique({ where: { id: String(id) } });
  return toApiSub(s);
}

/** Retorna a assinatura da loja, criando-a com o plano default (plan1) se ainda não existe. */
export async function ensureSubForStore(storeId: string, storeName: string): Promise<any> {
  const existing = await prisma.storeSubscription.findUnique({ where: { storeId: String(storeId) } });
  if (existing) return toApiSub(existing);
  const created = await prisma.storeSubscription.create({
    data: { storeId: String(storeId), storeName: storeName || 'Loja', currentPlan: 'plan1' },
  });
  return toApiSub(created);
}

export async function updateSub(id: string, data: Record<string, any>): Promise<any> {
  const saved = await prisma.storeSubscription.update({ where: { id: String(id) }, data });
  return toApiSub(saved);
}

export async function listPendingSubs(): Promise<any[]> {
  const list = await prisma.storeSubscription.findMany({ where: { planChangeStatus: 'pending' } });
  return list.map(toApiSub);
}

export async function listAllSubs(): Promise<any[]> {
  const list = await prisma.storeSubscription.findMany({ orderBy: { updatedAt: 'desc' } });
  return list.map(toApiSub);
}

/** Sincroniza a comissão de todas as lojas de um plano (usado quando o CEO muda a config). */
export async function syncCommissionForPlan(plan: 'plan1' | 'plan2' | 'plan3', commissionRate: number): Promise<number> {
  if (commissionRate === undefined || commissionRate === null) return 0;
  const r = await prisma.storeSubscription.updateMany({
    where: { currentPlan: plan },
    data: { commissionRate },
  });
  return r.count;
}
