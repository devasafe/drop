import { computeCommissionProfit } from '../controllers/appCashboxController';

/**
 * Lucro líquido da plataforma = só as comissões embolsadas (produto + entrega).
 * NÃO deve contar order_payment (custódia que entra) nem payout_paid (repasse que sai),
 * que antes inflavam/zeravam o balance e faziam o lucro dar negativo.
 */
describe('computeCommissionProfit', () => {
  it('soma apenas as comissões de produto e entrega', () => {
    const history = [
      { type: 'income', source: 'order_payment', amount: 100 },        // custódia: ignora
      { type: 'income', source: 'product_commission', amount: 8 },     // conta
      { type: 'income', source: 'delivery_commission', amount: 2 },    // conta
      { type: 'expense', source: 'payout_paid', amount: 90 },          // repasse: ignora
    ];
    expect(computeCommissionProfit(history)).toBe(10);
  });

  it('não fica negativo quando o pedido entra e é repassado (cenário do bug)', () => {
    const history = [
      { type: 'income', source: 'order_payment', amount: 100 },
      { type: 'expense', source: 'payout_paid', amount: 90 },
      // sem comissão lançada ainda
    ];
    expect(computeCommissionProfit(history)).toBe(0);
  });

  it('subtrai reversões de comissão (entradas que não forem income)', () => {
    const history = [
      { type: 'income', source: 'product_commission', amount: 8 },
      { type: 'expense', source: 'product_commission', amount: 3 },
    ];
    expect(computeCommissionProfit(history)).toBe(5);
  });

  it('ignora cupom, depósito manual e outras fontes não-comissão', () => {
    const history = [
      { type: 'income', source: 'coupon_discount', amount: 5 },
      { type: 'income', source: 'manual_deposit', amount: 50 },
      { type: 'income', source: 'cancelled_order', amount: 7 },
      { type: 'income', source: 'delivery_commission', amount: 4 },
    ];
    expect(computeCommissionProfit(history)).toBe(4);
  });
});
