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

/** currentStatus do corpo do 409 WITHDRAWAL_NOT_PENDING (D3b-3, E8). */
export function withdrawalConflictStatus(err: unknown): string | null {
  if (!isConflictWithCode(err, 'WITHDRAWAL_NOT_PENDING')) return null;
  const s = (err as { response?: { data?: { currentStatus?: unknown } } }).response?.data?.currentStatus;
  return typeof s === 'string' ? s : null;
}

/**
 * "Já feito" do lote de aprovação (D3b-3, E8): só 409 WITHDRAWAL_NOT_PENDING com currentStatus 'processed'
 * (o saque já foi pago). 'approved' (em voo/incerto) e 'rejected' são falhas com mensagem própria; sem
 * currentStatus também não conta. WITHDRAWAL_NOT_RESOLVABLE é da resolução de incerto e é erro.
 */
export function isWithdrawalAlreadyHandled(err: unknown): boolean {
  return withdrawalConflictStatus(err) === 'processed';
}

/** Mensagem das falhas 409 WITHDRAWAL_NOT_PENDING que não são "já feito"; null para o resto. */
export function withdrawalConflictMessage(err: unknown): string | null {
  const s = withdrawalConflictStatus(err);
  if (s === 'approved') return 'Em andamento: este saque já está sendo pago. Se não concluir, ele aparece em Incertos.';
  if (s === 'rejected') return 'Este saque já foi rejeitado.';
  return null;
}

/** 502 WITHDRAWAL_UNCERTAIN: o Pix pode ter saído. Falha, mas nunca entra no "Tentar de novo". */
export function isWithdrawalUncertain(err: unknown): boolean {
  return serverErrorCode(err) === 'WITHDRAWAL_UNCERTAIN';
}
