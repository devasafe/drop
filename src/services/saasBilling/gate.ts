import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { getSaasConfig, isDirectMode } from '../../utils/settlement';
import { coverageBounds, isStoreBlocked } from './policy';

/**
 * Bloqueio da loja pela mensalidade SaaS (só no modo direto; quem chama confere o modo).
 * Pedidos já criados seguem normalmente (aceite/entrega não passam por aqui) e o painel do
 * dono não usa estes filtros públicos.
 */

/**
 * A loja pode receber pedido NOVO? Bloqueada quando já está `paused` (o job pausou), quando a
 * política diz que passou da carência — mesmo antes de o job (1 h) gravar a pausa — ou quando a
 * mensalidade foi cancelada e a cobertura acabou (D3b-2b).
 * Sem linha de cobrança → não bloqueia (fail open proposital, ver isBillingBlocked).
 * Mensalidade efetiva 0 ou loja ainda sem assinatura → não bloqueia (ver isStoreBlocked/shouldPause).
 */
export async function isStoreBillingBlocked(storeId: string, now: Date = new Date()): Promise<boolean> {
  const [billing, cfg] = await Promise.all([
    prisma.storeSaasBilling.findUnique({ where: { storeId }, select: { status: true, trialEndsAt: true, paidUntil: true, customFee: true, asaasSubscriptionId: true } }),
    getSaasConfig(),
  ]);
  return isStoreBlocked(billing, now, cfg);
}

/**
 * Fragmento de `where` de Store: lojas visíveis na vitrine pela mensalidade.
 * - sem linha de cobrança, ou status fora de paused/cancelled;
 * - cancelled ainda coberta (D3b-2b): coverageEnd > now, escrito como
 *   paidUntil >= paidFrom OU trialEndsAt >= trialFrom (coverageBounds; mesma conta de
 *   isCancelledAndExpired). Depois do fim, o job (2.3) ainda pausa a loja pelo admin.
 */
export function billingVisibleWhere(now: Date = new Date()): Prisma.StoreWhereInput {
  const { paidFrom, trialFrom } = coverageBounds(now);
  return {
    OR: [
      { saasBilling: null },
      { saasBilling: { status: { notIn: ['paused', 'cancelled'] } } },
      { saasBilling: { status: 'cancelled', OR: [{ paidUntil: { gte: paidFrom } }, { trialEndsAt: { gte: trialFrom } }] } },
    ],
  };
}

/** O filtro da vitrine quando o modo é direto; `null` na custódia (nada se aplica). */
export async function publicStoreBillingWhere(now: Date = new Date()): Promise<Prisma.StoreWhereInput | null> {
  return (await isDirectMode()) ? billingVisibleWhere(now) : null;
}

/** A loja está escondida da vitrine pela mensalidade? (modo direto + paused ou cancelada vencida; custódia -> nunca) */
export async function isStoreHiddenByBilling(storeId: string): Promise<boolean> {
  const where = await publicStoreBillingWhere();
  if (!where) return false;
  return (await prisma.store.count({ where: { id: storeId, AND: [where] } })) === 0;
}
