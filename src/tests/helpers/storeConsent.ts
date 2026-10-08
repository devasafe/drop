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
