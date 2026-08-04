import { prisma } from '../lib/prisma';

interface RecordConsentInput {
  userId: string;
  termsVersion: string;
  privacyVersion: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Grava a prova de consentimento (LGPD): um registro por documento aceito.
 * Nunca lança — falha aqui não deve impedir o cadastro (o consentimento foi
 * dado no front; a gravação é auditoria).
 */
export async function recordConsent(input: RecordConsentInput): Promise<void> {
  const base = { userId: input.userId, ipAddress: input.ipAddress, userAgent: input.userAgent };
  try {
    await prisma.consentLog.createMany({
      data: [
        { ...base, documentType: 'terms', version: input.termsVersion },
        { ...base, documentType: 'privacy', version: input.privacyVersion },
      ],
    });
  } catch (err) {
    console.warn('[consent] falha ao gravar ConsentLog:', err);
  }
}
