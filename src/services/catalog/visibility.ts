import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { publicStoreBillingWhere } from '../saasBilling/gate';
import { asaasServerEnvironment } from '../../utils/asaasEnv';

/** D3b-2a: loja pausada pelo admin some de toda a vitrine, nos dois modos. */
export const NOT_ADMIN_PAUSED_WHERE: Prisma.StoreWhereInput = { adminPausedAt: null };

/**
 * Modo direto: a loja só cobra com a conta Asaas `valid`, do mesmo ambiente do servidor, e o termo
 * aceito (isStorePaymentsReady). Sem isso ela fica fora da vitrine, em vez de o cliente descobrir
 * no checkout — inclusive as chaves de sandbox depois que o servidor passa para produção.
 */
export function directPaymentsReadyWhere(): Prisma.StoreWhereInput {
  return {
    asaasAccount: { is: { status: 'valid', environment: asaasServerEnvironment() } },
    asaasConsents: { some: {} },
  };
}

/**
 * Mensalidade e conta pronta para cobrar (modo direto) AND pausa do admin. É o filtro das listagens
 * públicas que tratam o KYC por conta própria (lista, destaques, mais vendidos, produtos); nunca
 * devolve null.
 */
export async function publicStoreAvailableWhere(): Promise<Prisma.StoreWhereInput> {
  const billingWhere = await publicStoreBillingWhere();
  const directWhere = billingWhere ? [billingWhere, directPaymentsReadyWhere()] : [];
  return { AND: [NOT_ADMIN_PAUSED_WHERE, ...directWhere] };
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

/** A loja está fora do ar para o público (mensalidade ou conta sem cobrar no modo direto, ou pausa do admin)? */
export async function isStoreHiddenFromPublic(storeId: string): Promise<boolean> {
  const where = await publicStoreAvailableWhere();
  return (await prisma.store.count({ where: { id: String(storeId), AND: [where] } })) === 0;
}
