export type MissingCourierVerification = 'email' | 'document' | 'facial' | 'courier';

/**
 * O que falta para o motoboy estar verificado:
 * email + documento (Fase 1) + facial (Fase 2) + courier (CNH/placa/foto).
 * (Telefone foi removido do gate — ver clientVerification.)
 */
export function missingMotoboyVerifications(user: any): MissingCourierVerification[] {
  const v = user?.verification || {};
  const missing: MissingCourierVerification[] = [];
  if (v?.email?.status !== 'verified') missing.push('email');
  if (v?.document?.status !== 'approved') missing.push('document');
  if (v?.facial?.status !== 'approved') missing.push('facial');
  if (v?.courier?.status !== 'approved') missing.push('courier');
  return missing;
}

export function isMotoboyVerified(user: any): boolean {
  return missingMotoboyVerifications(user).length === 0;
}
