/** Traduz o `lastError` cru do estorno direto para uma frase que o lojista/admin entende. */
const RULES: Array<[RegExp, string]> = [
  [/UNCERTAIN|STUCK_REQUESTED/i, 'Resultado incerto no Asaas — aguardando conferência do admin'],
  [/saldo|insufficient|balance/i, 'A loja não tem saldo no Asaas para este estorno'],
];

export function humanizeRefundError(lastError?: string | null): string | null {
  if (!lastError) return null;
  for (const [re, msg] of RULES) if (re.test(lastError)) return msg;
  return lastError;
}

export const REFUND_STATUS_LABEL: Record<string, string> = {
  pending: 'Aguardando estorno',
  requested: 'Estorno em andamento',
  done: 'Estornado',
  failed: 'Falhou — nova tentativa disponível',
  failed_final: 'Falhou — com o admin',
  uncertain: 'Em conferência pelo admin',
};
