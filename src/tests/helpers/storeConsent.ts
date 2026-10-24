import { prisma } from '../../lib/prisma';
import { STORE_ASAAS_TERMS_VERSION } from '../../legal/storeAsaasTerms';

/** Aceite de termo usado nos testes que conectam/semeiam conta Asaas de loja. */
export const TEST_CONSENT = { ip: '127.0.0.1', userAgent: 'jest', actorRole: 'lojista' as const };

/** Semeia o aceite do termo vigente (lojas com conta criada direto no banco). */
export async function grantStoreConsent(storeId: string, actorId = 'actor-test') {
  await prisma.storeAsaasConsent.create({
    data: { storeId, actorId, actorRole: 'lojista', termsVersion: STORE_ASAAS_TERMS_VERSION, ip: '127.0.0.1', userAgent: 'jest' },
  });
}

/**
 * Dados aninhados de `prisma.store.create/update` que deixam a loja pronta para cobrar no modo
 * direto (conta Asaas `valid` + termo aceito). A vitrine do modo SaaS só mostra loja assim
 * (DIRECT_PAYMENTS_READY_WHERE); a chave é fictícia, para suítes que não chegam a cobrar.
 */
export function paymentsReadyStoreData() {
  return {
    asaasAccount: { create: { apiKeyEncrypted: 'teste-sem-chave', apiKeyLast4: 'TEST', environment: 'sandbox', status: 'valid' } },
    asaasConsents: { create: { actorId: 'actor-test', actorRole: 'lojista', termsVersion: STORE_ASAAS_TERMS_VERSION, ip: '127.0.0.1', userAgent: 'jest' } },
  };
}
