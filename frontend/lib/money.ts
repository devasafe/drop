/**
 * Dinheiro na interface do DS v2: `R$ 1.234,50` (ponto de milhar, vírgula
 * decimal, sempre duas casas). Negativo vira `−R$ 15,00` (sinal de menos
 * tipográfico), como desconto e crédito no resumo da sacola.
 * Não usa Intl para não depender do espaço inquebrável que ele insere.
 */
export function formatMoney(value: number): string {
  const cents = Math.round(Math.abs(value) * 100);
  const reais = Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const text = `R$ ${reais},${String(cents % 100).padStart(2, '0')}`;
  return value < 0 && cents > 0 ? `−${text}` : text;
}
