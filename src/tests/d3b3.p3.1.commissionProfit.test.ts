/**
 * D3b-3 · P3.1 — a regra de lucro da plataforma mora em utils (a Visão geral usa) e o
 * controller do caixa reexporta a MESMA função (comportamento idêntico).
 */
import { computeCommissionProfit, COMMISSION_SOURCES } from '../utils/commissionProfit';
import { computeCommissionProfit as fromController } from '../controllers/appCashboxController';

describe('computeCommissionProfit em utils', () => {
  it('o controller reexporta a mesma função', () => {
    expect(fromController).toBe(computeCommissionProfit);
  });

  it('as fontes de comissão são produto e entrega', () => {
    expect([...COMMISSION_SOURCES]).toEqual(['product_commission', 'delivery_commission']);
  });

  it('soma income de comissão, subtrai reversão e ignora o resto', () => {
    const history = [
      { type: 'income', source: 'order_payment', amount: 100 },
      { type: 'income', source: 'product_commission', amount: 8 },
      { type: 'income', source: 'delivery_commission', amount: 2 },
      { type: 'expense', source: 'product_commission', amount: 3 },
      { type: 'income', source: 'coupon_discount', amount: -5 },
      { type: 'income', source: 'manual_deposit', amount: 50 },
      { type: 'expense', source: 'payout_paid', amount: 90 },
    ];
    expect(computeCommissionProfit(history)).toBe(7);
  });

  it('lista vazia → 0', () => {
    expect(computeCommissionProfit([])).toBe(0);
  });
});
