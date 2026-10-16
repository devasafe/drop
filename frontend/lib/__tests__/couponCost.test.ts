import { couponCostText, couponMaxCost } from '../couponCost';

describe('couponMaxCost / couponCostText', () => {
  it('desconto fixo com limite: usos × valor', () => {
    const c = couponMaxCost({ discountType: 'fixed', discountValue: 10, maxUses: 100 });
    expect(c).toEqual({ kind: 'fixed', perUse: 10, uses: 100, total: 1000 });
    expect(couponCostText(c)).toEqual({ title: 'Custo máximo: R$ 1.000,00', detail: 'Se os 100 usos acontecerem (R$ 10,00 cada).' });
  });

  it('desconto fixo sem limite: custo por uso', () => {
    const c = couponMaxCost({ discountType: 'fixed', discountValue: 15, maxUses: null });
    expect(couponCostText(c)).toEqual({ title: 'Sem limite de usos', detail: 'Cada uso custa R$ 15,00 ao DROP.' });
  });

  it('percentual com mínimo e limite: custo no pedido mínimo, sem teto', () => {
    const c = couponMaxCost({ discountType: 'percent', discountValue: 10, minOrderValue: 80, maxUses: 1000 });
    expect(c).toEqual({ kind: 'percent', percent: 10, uses: 1000, atMinimum: 8, totalAtMinimum: 8000 });
    expect(couponCostText(c)).toEqual({
      title: 'Cada uso custa 10% do pedido',
      detail: 'No pedido mínimo são R$ 8,00 por uso. 1000 usos nesse valor somam R$ 8.000,00. Pedidos maiores custam mais.',
    });
  });

  it('percentual sem mínimo: avisa que não há teto', () => {
    expect(couponCostText(couponMaxCost({ discountType: 'percent', discountValue: 15 }))).toEqual({
      title: 'Cada uso custa 15% do pedido',
      detail: 'Sem pedido mínimo, não há teto: o custo cresce com o valor do pedido.',
    });
  });

  it('limite zero ou inválido conta como sem limite', () => {
    expect(couponMaxCost({ discountType: 'fixed', discountValue: 5, maxUses: 0 })).toEqual({ kind: 'fixed', perUse: 5, uses: null, total: null });
  });
});
