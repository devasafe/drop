import { saoPauloToday } from '../asaasLoja/charge';
import { coveredUntil } from './policy';

/**
 * 1º vencimento da assinatura da mensalidade: max(coveredUntil, now). Uma assinatura recriada
 * (ex.: fee voltou a ser > 0) não pode cobrar o período que a loja já pagou, e um teste estendido
 * (D3b-2b) empurra o vencimento junto. paidUntil é DATA do Asaas gravada em 00:00Z (o dia vale
 * inteiro): usa o dia em UTC. trialEndsAt/now são instantes: dia em São Paulo.
 * Usado pelo job (b) e por adminAccounts/saas.ts (estender teste).
 */
export function firstDueDate(billing: { trialEndsAt: Date; paidUntil: Date | null }, now: Date): string {
  const covered = coveredUntil(billing);
  if (covered.getTime() <= now.getTime()) return saoPauloToday(now);
  if (covered === billing.paidUntil) return covered.toISOString().slice(0, 10);
  return saoPauloToday(covered);
}
