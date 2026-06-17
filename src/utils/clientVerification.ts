/**
 * Regras do "portão" de verificação do cliente.
 * Cliente só compra com email + telefone verificados e documento aprovado.
 */

// Telefone (SMS/WhatsApp) foi removido do gate por ser pago. A infra de OTP
// continua no código (endpoints/otpProvider) caso seja reativada no futuro.
export type MissingVerification = 'email' | 'document';

export function missingClientVerifications(user: any): MissingVerification[] {
  const v = user?.verification || {};
  const missing: MissingVerification[] = [];
  if (v?.email?.status !== 'verified') missing.push('email');
  if (v?.document?.status !== 'approved') missing.push('document');
  return missing;
}

export function isClientVerified(user: any): boolean {
  return missingClientVerifications(user).length === 0;
}
