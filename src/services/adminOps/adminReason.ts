import { MoneyActionError } from '../adminMoneyAction.service';

export const ADMIN_REASON_MIN = 5;
export const ADMIN_REASON_MAX = 500;

/** Motivo obrigatório das ações do admin sobre o pedido: trim, de 5 a 500 caracteres. */
export function normalizeAdminReason(raw: unknown): string {
  const reason = typeof raw === 'string' ? raw.trim() : '';
  if (reason.length < ADMIN_REASON_MIN || reason.length > ADMIN_REASON_MAX) {
    throw new MoneyActionError(400, 'REASON_REQUIRED', 'Escreva o motivo, de 5 a 500 caracteres.');
  }
  return reason;
}
