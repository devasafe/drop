import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { getSaasConfig, isDirectMode } from '../../utils/settlement';
import { isStoreBlocked } from './policy';

/**
 * Bloqueio da loja pela mensalidade SaaS (só no modo direto; quem chama confere o modo).
 * Pedidos já criados seguem normalmente (aceite/entrega não passam por aqui) e o painel do
 * dono não usa estes filtros públicos.
 */

/**
 * A loja pode receber pedido NOVO? Bloqueada quando já está `paused` (o job pausou) ou quando a
 * política diz que passou da carência — mesmo antes de o job (1 h) gravar a pausa.
 * A mensalidade cancelada não bloqueia aqui: no fim da cobertura o job pausa a loja pelo DROP, e a
 * pausa do admin é que tira a loja do ar (D3b-2b). Liberada a pausa, ela vende.
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
 * Fragmento de `where` de Store: lojas visíveis na vitrine pela mensalidade — sem linha de
 * cobrança ou status diferente de `paused`. A cancelada não some por status (D3b-2b): no fim da
 * cobertura o job a pausa pelo DROP, e essa pausa sai pelo filtro da 2a (NOT_ADMIN_PAUSED_WHERE).
 */
export function billingVisibleWhere(): Prisma.StoreWhereInput {
  return {
    OR: [
      { saasBilling: null },
      { saasBilling: { status: { not: 'paused' } } },
    ],
  };
}

/** O filtro da vitrine quando o modo é direto; `null` na custódia (nada se aplica). */
export async function publicStoreBillingWhere(): Promise<Prisma.StoreWhereInput | null> {
  return (await isDirectMode()) ? billingVisibleWhere() : null;
}

/** A loja está escondida da vitrine pela mensalidade? (modo direto + paused; custódia -> nunca) */
export async function isStoreHiddenByBilling(storeId: string): Promise<boolean> {
  const where = await publicStoreBillingWhere();
  if (!where) return false;
  return (await prisma.store.count({ where: { id: storeId, AND: [where] } })) === 0;
}
