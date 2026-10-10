import type { Prisma } from '@prisma/client';
import { publicStoreBillingWhere } from '../saasBilling/gate';

/**
 * Filtro de visibilidade da vitrine pública: KYC (`isVerified`, com KYC_ENFORCED=true) AND
 * mensalidade (modo direto). É o MESMO do `listStores`/`quoteStores`/busca; listagens públicas
 * novas combinam este `where` com os próprios critérios.
 */
export async function publicStoreVisibilityWhere(): Promise<Prisma.StoreWhereInput> {
  const where: Prisma.StoreWhereInput = {};
  if (process.env.KYC_ENFORCED === 'true') where.isVerified = true;
  const billingWhere = await publicStoreBillingWhere();
  if (billingWhere) where.AND = [billingWhere];
  return where;
}
