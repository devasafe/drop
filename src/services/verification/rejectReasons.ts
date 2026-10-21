import { MoneyActionError } from '../adminMoneyAction.service';

/**
 * D3b-2b · recusa padronizada da verificação (spec 8, ruling 2). Tipo TS, não enum Prisma: a
 * verificação é JSON. O texto pronto (rejectionReason) é o que as telas atuais já mostram.
 */
export const REJECT_REASONS = ['illegible', 'face_mismatch', 'expired', 'data_mismatch', 'cnpj_invalid', 'address_unproven', 'other'] as const;
export type VerificationRejectReason = (typeof REJECT_REASONS)[number];
export const REJECT_REASON_LABEL: Record<VerificationRejectReason, string> = {
  illegible: 'Foto ilegível',
  face_mismatch: 'Selfie não confere com o documento',
  expired: 'Documento vencido',
  data_mismatch: 'Dados não conferem',
  cnpj_invalid: 'CNPJ inválido ou inativo',
  address_unproven: 'Comprovante de endereço não aceito',
  other: 'Outro motivo',
};
export const REJECT_MESSAGE_MAX = 300;

export interface ParsedReject {
  reasonCode: VerificationRejectReason;
  /** Mensagem livre (trim), ou null. */
  message: string | null;
  /** Pedido de reenvio: o status continua `rejected`; muda só o texto ("Reenvie:"). */
  resend: boolean;
  /** Texto pronto: rótulo, "rótulo: mensagem", ou só a mensagem (other). */
  text: string;
}
export function isRejectReason(v: unknown): v is VerificationRejectReason {
  return typeof v === 'string' && (REJECT_REASONS as readonly string[]).includes(v);
}
/**
 * Corpo da recusa: {reasonCode, message?, resend?}, ou o formato antigo {reason} (vira `other` com
 * a mensagem). Lança MoneyActionError 400: INVALID_REJECT_REASON, REJECT_MESSAGE_REQUIRED,
 * REJECT_MESSAGE_TOO_LONG.
 */
export function parseRejectBody(body: unknown): ParsedReject {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const hasCode = b.reasonCode !== undefined && b.reasonCode !== null && b.reasonCode !== '';

  let reasonCode: VerificationRejectReason;
  let rawMessage: unknown;
  if (hasCode) {
    if (!isRejectReason(b.reasonCode)) {
      throw new MoneyActionError(400, 'INVALID_REJECT_REASON', 'Motivo de recusa inválido.');
    }
    reasonCode = b.reasonCode;
    rawMessage = b.message;
  } else {
    reasonCode = 'other';
    rawMessage = b.reason ?? b.message;
  }

  const trimmed = typeof rawMessage === 'string' ? rawMessage.trim() : '';
  const message = trimmed === '' ? null : trimmed;
  if (message && message.length > REJECT_MESSAGE_MAX) {
    throw new MoneyActionError(400, 'REJECT_MESSAGE_TOO_LONG', `A mensagem pode ter até ${REJECT_MESSAGE_MAX} caracteres.`);
  }
  if (reasonCode === 'other' && !message) {
    throw new MoneyActionError(400, 'REJECT_MESSAGE_REQUIRED', 'Escreva a mensagem para a pessoa quando o motivo for "Outro motivo".');
  }

  const label = REJECT_REASON_LABEL[reasonCode];
  const text = reasonCode === 'other' ? (message as string) : message ? `${label}: ${message}` : label;
  return { reasonCode, message, resend: b.resend === true, text };
}

/** Texto do aviso e das telas: "Reenvie: …" quando pediu reenvio, senão "Recusado: …". */
export function rejectionNoticeText(p: Pick<ParsedReject, 'resend' | 'text'>): string {
  return `${p.resend ? 'Reenvie' : 'Recusado'}: ${p.text}`;
}
