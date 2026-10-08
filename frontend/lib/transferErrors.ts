/** Traduz o `lastError` cru da transferência ao motoboy para uma frase que o lojista/admin entende. */
const RULES: Array<[RegExp, string]> = [
  [/UNCERTAIN/i, 'Resultado incerto no Asaas — confira no painel antes de qualquer ação'],
  [/MOTOBOY_PIX_KEY_MISSING/, 'O motoboy ainda não cadastrou a chave Pix'],
  [/PIX_KEY_UNREADABLE/, 'Não foi possível ler a chave Pix do motoboy'],
  [/AMOUNT_OVER_LIMIT/, 'Valor acima do limite por transferência — requer análise do admin'],
  [/DAILY_LIMIT/, 'Limite diário de transferências da loja atingido — nova tentativa amanhã'],
  [/AUTH_WEBHOOK_NOT_CONFIRMED/, 'A trava de autorização de transferências não foi confirmada no Asaas'],
  [/saldo|insufficient|balance/i, 'A loja não tem saldo no Asaas para esta transferência'],
];

export function humanizeTransferError(lastError?: string | null): string | null {
  if (!lastError) return null;
  for (const [re, msg] of RULES) if (re.test(lastError)) return msg;
  return lastError;
}

export const TRANSFER_STATUS_LABEL: Record<string, string> = {
  pending: 'Aguardando envio',
  requested: 'Em andamento',
  done: 'Pago',
  failed: 'Falhou — nova tentativa agendada',
  failed_final: 'Falhou — com o admin',
  uncertain: 'Em conferência pelo admin',
};
