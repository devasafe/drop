import type { Response } from 'express';

/**
 * D3b-2a · erros das ações do admin sobre pessoas e lojas. Corpo: { error: <texto>, code }, o
 * mesmo das rotas admin atuais (MoneyActionError, ROLE_HAS_OPEN_WORK): a AdminSheet mostra `error`.
 */
export class AccountActionError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AccountActionError';
    this.status = status;
    this.code = code;
  }
}

export function sendAccountActionError(res: Response, err: unknown): boolean {
  if (!(err instanceof AccountActionError)) return false;
  res.status(err.status).json({ error: err.message, code: err.code });
  return true;
}

export const REASON_MIN = 5;
export const REASON_MAX = 500;
export const NOTE_MAX = 2000;

const reasonRequired = () =>
  new AccountActionError(400, 'REASON_REQUIRED', `Escreva o motivo, com ${REASON_MIN} a ${REASON_MAX} caracteres.`);

/** Motivo obrigatório (bloquear, perdoar, pausar): trim, de 5 a 500 caracteres. */
export function parseRequiredReason(raw: unknown): string {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (text.length < REASON_MIN || text.length > REASON_MAX) throw reasonRequired();
  return text;
}

/** Motivo opcional (desbloquear, liberar loja): ausente ou vazio = null; se vier, a regra do obrigatório. */
export function parseOptionalReason(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') throw reasonRequired();
  return raw.trim() === '' ? null : parseRequiredReason(raw);
}

/** Nota interna: trim, de 1 a 2000 caracteres. */
export function parseNoteText(raw: unknown): string {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (text.length < 1 || text.length > NOTE_MAX) {
    throw new AccountActionError(400, 'NOTE_INVALID', `A nota precisa ter de 1 a ${NOTE_MAX} caracteres.`);
  }
  return text;
}

export const userNotFound = () => new AccountActionError(404, 'USER_NOT_FOUND', 'Pessoa não encontrada.');
export const storeNotFound = () => new AccountActionError(404, 'STORE_NOT_FOUND', 'Loja não encontrada.');
