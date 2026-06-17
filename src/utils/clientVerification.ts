/**
 * Regras do "portão" de verificação do cliente.
 * Cliente só compra com email + telefone verificados e documento aprovado.
 */

export type MissingVerification = 'email' | 'phone' | 'document';

export function missingClientVerifications(user: any): MissingVerification[] {
  const v = user?.verification || {};
  const missing: MissingVerification[] = [];
  if (v?.email?.status !== 'verified') missing.push('email');
  if (v?.phone?.status !== 'verified') missing.push('phone');
  if (v?.document?.status !== 'approved') missing.push('document');
  return missing;
}

export function isClientVerified(user: any): boolean {
  return missingClientVerifications(user).length === 0;
}
