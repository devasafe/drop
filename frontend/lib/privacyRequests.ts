import { PRIVACY_EMAIL } from './legalDocs';

export type PrivacyRight = 'acesso' | 'portabilidade' | 'correcao' | 'eliminacao' | 'compartilhamento' | 'revogacao';
const ASSUNTO: Record<PrivacyRight, string> = {
  acesso: 'Cópia dos meus dados', portabilidade: 'Portabilidade dos meus dados', correcao: 'Correção de dados',
  eliminacao: 'Exclusão da conta', compartilhamento: 'Com quem meus dados são compartilhados', revogacao: 'Revogação de consentimento',
};

/** Pedido do titular (LGPD) por e-mail, já preenchido com o direito e a conta. Sem backend LGPD ainda. */
export function privacyMailto(right: PrivacyRight, email: string): string {
  const subject = `${ASSUNTO[right]} — ${email}`;
  const body = `Olá, quero exercer este direito pela LGPD: ${ASSUNTO[right]}.\n\nConta: ${email}\n`;
  return `mailto:${PRIVACY_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
