import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { publicStoreBillingWhere } from '../saasBilling/gate';

/** D3b-2a: loja pausada pelo admin some de toda a vitrine, nos dois modos. */
export const NOT_ADMIN_PAUSED_WHERE: Prisma.StoreWhereInput = { adminPausedAt: null };

/**
 * Mensalidade (modo direto) AND pausa do admin. É o filtro das listagens públicas que tratam o KYC
 * por conta própria (lista, destaques, mais vendidos, produtos); nunca devolve null.
 */
export async function publicStoreAvailableWhere(): Promise<Prisma.StoreWhereInput> {
  const billingWhere = await publicStoreBillingWhere();
  return { AND: [NOT_ADMIN_PAUSED_WHERE, ...(billingWhere ? [billingWhere] : [])] };
}

/**
 * Filtro de visibilidade da vitrine pública: KYC (`isVerified`, com KYC_ENFORCED=true) AND
 * mensalidade (modo direto) AND pausa do admin. É o MESMO do `listStores`/`quoteStores`/busca;
 * listagens públicas novas combinam este `where` com os próprios critérios.
 */
export async function publicStoreVisibilityWhere(): Promise<Prisma.StoreWhereInput> {
  const where: Prisma.StoreWhereInput = { AND: [await publicStoreAvailableWhere()] };
  if (process.env.KYC_ENFORCED === 'true') where.isVerified = true;
  return where;
}

/** A loja está fora do ar para o público (mensalidade no modo direto ou pausa do admin)? */
export async function isStoreHiddenFromPublic(storeId: string): Promise<boolean> {
  const where = await publicStoreAvailableWhere();
  return (await prisma.store.count({ where: { id: String(storeId), AND: [where] } })) === 0;
}
