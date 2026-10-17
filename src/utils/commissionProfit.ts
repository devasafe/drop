/**
 * Lucro REAL da plataforma = só as comissões que ela de fato embolsa.
 * O `balance` do caixa mistura custódia (order_payment entra e payout_paid sai), por isso
 * dava negativo. As comissões são lançadas como income no momento da entrega; qualquer
 * outro `type` na mesma fonte é reversão e subtrai.
 *
 * D3b-3: movida de src/controllers/appCashboxController.ts sem mudar o comportamento, para a
 * Visão geral do Dinheiro (moneyOverview.service) usar a mesma regra do caixa.
 */
export const COMMISSION_SOURCES = ['product_commission', 'delivery_commission'] as const;

const COMMISSION_SOURCE_SET: ReadonlySet<string> = new Set(COMMISSION_SOURCES);

// Soma líquida das comissões no history (income soma, reversão subtrai).
export function computeCommissionProfit(history: { type: string; source: string; amount: number }[]): number {
  return history.reduce((sum, h) => {
    if (!COMMISSION_SOURCE_SET.has(h.source)) return sum;
    return h.type === 'income' ? sum + h.amount : sum - h.amount;
  }, 0);
}
