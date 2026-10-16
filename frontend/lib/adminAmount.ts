/**
 * Valor em reais digitado no admin (Carteiras · Adicionar saldo; Caixa · Pedir retirada e Registrar depósito).
 * Tem que ser exatamente o digitado. Só dígitos, com vírgula ou ponto e até 2 casas ("25", "25,5", "25.50");
 * separador de milhar, letras, sinal, espaço e notação "e" são recusados (parseFloat leria "1.234,56" como
 * 1.234 e "1e3" como 1000). Recusado → null.
 */
export const AMOUNT_RE = /^\d+([.,]\d{1,2})?$/;

export const parseAmount = (v: string): number | null => (AMOUNT_RE.test(v) ? Number(v.replace(',', '.')) : null);

/** Aviso curto do campo de valor: vazio → nada; formato recusado; zero. */
export function amountFieldError(raw: string): string | undefined {
  if (!raw) return undefined;
  const v = parseAmount(raw);
  if (v === null) return 'Use só números, com até 2 casas (ex.: 25,50).';
  return v <= 0 ? 'O valor tem que ser maior que zero.' : undefined;
}
