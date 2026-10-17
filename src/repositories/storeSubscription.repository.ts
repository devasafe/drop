// Repositório do StoreSubscription (plano/assinatura da loja) em Prisma/Postgres.
// `commissionRate` é Decimal → number na fronteira; reexpõe `_id`.
import { Prisma } from '@prisma/client';
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

export type CommissionPlan = 'plan1' | 'plan2' | 'plan3';
export type CommissionSyncChoice = 'keep_special' | 'all';

/**
 * Lojas do plano que SEGUEM o valor do plano: taxa igual ao valor ou sem taxa própria (nula).
 * As outras (taxa própria diferente) são as "especiais" (spec D3b-3 6).
 */
export function followsPlanWhere(plan: CommissionPlan, value: number): Prisma.StoreSubscriptionWhereInput {
  return { currentPlan: plan, OR: [{ commissionRate: value }, { commissionRate: null }] };
}

/**
 * Leva o novo valor às lojas do plano, dentro da transação de quem salvou a config.
 * keep_special: só as que seguiam o valor antigo; all: todas do plano. Devolve quantas mudaram.
 */
export async function syncCommissionForPlan(
  db: Prisma.TransactionClient,
  plan: CommissionPlan,
  oldValue: number,
  newValue: number,
  choice: CommissionSyncChoice,
): Promise<number> {
  const where = choice === 'all' ? { currentPlan: plan } : followsPlanWhere(plan, oldValue);
  const r = await db.storeSubscription.updateMany({ where, data: { commissionRate: newValue } });
  return r.count;
}

/** Impacto de mudar o valor do plano: quantas seguem o valor atual e quais são especiais. */
export async function commissionImpact(
  plan: CommissionPlan,
  oldValue: number,
): Promise<{ atOldValue: number; special: Array<{ storeId: string; storeName: string; rate: number }> }> {
  const [atOldValue, specials] = await Promise.all([
    prisma.storeSubscription.count({ where: followsPlanWhere(plan, oldValue) }),
    prisma.storeSubscription.findMany({
      where: { currentPlan: plan, commissionRate: { not: null }, NOT: { commissionRate: oldValue } },
      select: { storeId: true, storeName: true, commissionRate: true },
      orderBy: { storeName: 'asc' },
    }),
  ]);
  return {
    atOldValue,
    special: specials.map((s) => ({ storeId: s.storeId, storeName: s.storeName, rate: Number(s.commissionRate) })),
  };
}
