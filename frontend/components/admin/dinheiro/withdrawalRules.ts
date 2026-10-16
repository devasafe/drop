/**
 * Regras de tela dos saques (D3a). Nada aqui muda regra do servidor: só lê os códigos que ele já devolve
 * (src/controllers/withdrawalController.ts).
 */
import { isConflictWithCode } from '../../../lib/adminErrors';
import type { StatusTone } from '../StatusTag';
import { serverErrorCode } from './serverError';

export interface BankAccount {
  bankName?: string;
  accountType?: string;
  routingNumber?: string;
  accountNumber?: string;
  ownerName?: string;
}

export interface Withdrawal {
  _id: string;
  motoboyName?: string;
  motoboyEmail?: string;
  amount: number;
  status: string; // 'pending' | 'approved' | 'processed' | 'rejected'
  requestedAt: string;
  approvedAt?: string | null;
  uncertainAt?: string | null;
  bankAccount?: BankAccount | null;
}

/** Saque em `approved` sem marca de incerteza só é resolvível depois disso (o processo caiu). */
export const STALE_IN_FLIGHT_MS = 10 * 60 * 1000;

/** Saque incerto (resposta incerta do gateway) ou parado em processamento há mais de 10 min. */
export function isResolvable(w: Withdrawal | null | undefined, now = Date.now()): boolean {
  if (w?.status !== 'approved') return false;
  if (w.uncertainAt) return true;
  const at = w.approvedAt ? new Date(w.approvedAt).getTime() : NaN;
  return Number.isFinite(at) && now - at > STALE_IN_FLIGHT_MS;
}

export function withdrawalStatus(w: Withdrawal): { label: string; tone: StatusTone } {
  if (w.status === 'pending') return { label: 'Pendente', tone: 'warn' };
  if (w.status === 'approved') {
    return w.uncertainAt
      ? { label: 'Incerto — conferir no painel Asaas', tone: 'bad' }
      : { label: 'Em processamento', tone: 'info' };
  }
  if (w.status === 'processed') return { label: 'Pago', tone: 'ok' };
  return { label: 'Recusado', tone: 'neutral' };
}

export function bankSummary(w: Withdrawal): string | null {
  const b = w.bankAccount;
  if (!b) return null;
  const type = b.accountType === 'savings' ? 'Poupança' : 'Corrente';
  return `${b.bankName ?? 'Banco'} · ${type} · Ag ${b.routingNumber ?? '—'} · CC ${b.accountNumber ?? '—'} · ${b.ownerName ?? ''}`.trim();
}

/**
 * "Já feito" do lote de aprovação: 409 WITHDRAWAL_NOT_PENDING (o saque já saiu da fila: outra pessoa aprovou
 * ou recusou, ou ele já está em voo). Conta como feito e nunca é reenviado. Nenhum outro 409 entra aqui
 * (WITHDRAWAL_NOT_RESOLVABLE, por exemplo, é da resolução de saque incerto e é erro).
 */
export function isWithdrawalAlreadyHandled(err: unknown): boolean {
  return isConflictWithCode(err, 'WITHDRAWAL_NOT_PENDING');
}

/** 502 WITHDRAWAL_UNCERTAIN: o Pix pode ter saído. Falha, mas nunca entra no "Tentar de novo". */
export function isWithdrawalUncertain(err: unknown): boolean {
  return serverErrorCode(err) === 'WITHDRAWAL_UNCERTAIN';
}
