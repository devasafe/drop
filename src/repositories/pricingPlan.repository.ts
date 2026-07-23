// Repositório do PricingPlan (planos de comissão configuráveis) em Prisma/Postgres.
// `commission` e `minWithdraw` são Decimal → number na fronteira; reexpõe `_id`.
import { prisma } from '../lib/prisma';

const num = (v: any) => (v == null ? v : Number(v));

export function toApiPlan(p: any): any {
  if (!p) return p;
  return { ...p, _id: p.id, commission: num(p.commission), minWithdraw: num(p.minWithdraw) };
}

export async function listPlans(): Promise<any[]> {
  const list = await prisma.pricingPlan.findMany({ orderBy: { name: 'asc' } });
  return list.map(toApiPlan);
}

export async function findPlanById(id: string): Promise<any | null> {
  if (!id) return null;
  const p = await prisma.pricingPlan.findUnique({ where: { id: String(id) } });
  return toApiPlan(p);
}

export async function findPlanByName(name: string): Promise<any | null> {
  const p = await prisma.pricingPlan.findUnique({ where: { name } });
  return toApiPlan(p);
}

export async function updatePlan(id: string, data: Record<string, any>): Promise<any | null> {
  const p = await prisma.pricingPlan.update({ where: { id: String(id) }, data }).catch(() => null);
  return toApiPlan(p);
}
