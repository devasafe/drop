import { prisma } from '../lib/prisma';
import { isDirectMode } from './settlement';
import { storePlanNumber } from '../services/adminAccounts/storeStatus';

/**
 * Modo SaaS (direto): não há planos — toda loja tem os direitos do Plano 3 e paga só a mensalidade.
 * Na custódia vale a regra de sempre (StoreSubscription.currentPlan; senão Store.plan; senão 1).
 */
export const SAAS_PLAN = 3;

/** Plano efetivo da loja (lê o modo e, na custódia, a assinatura). */
export async function effectiveStorePlan(storeId: string, storePlan?: number | null): Promise<number> {
  if (await isDirectMode()) return SAAS_PLAN;
  const sub = await prisma.storeSubscription.findUnique({ where: { storeId }, select: { currentPlan: true } });
  if (storePlan === undefined && !sub) {
    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { plan: true } });
    storePlan = store?.plan ?? null;
  }
  return storePlanNumber(sub?.currentPlan, storePlan);
}
