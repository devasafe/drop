import { formatMoney } from './money';

/**
 * Custo máximo de um cupom global, calculado na tela (D3a, tela 21). O custo real por cupom não é agregado
 * no servidor (D3b). Cupom global é descontado do caixa do DROP quando usado.
 */
export interface CouponCostInput {
  discountType: 'percent' | 'fixed';
  discountValue: number;
  maxUses?: number | null;
  minOrderValue?: number | null;
}

export type CouponCost =
  | { kind: 'fixed'; perUse: number; uses: number | null; total: number | null }
  | { kind: 'percent'; percent: number; uses: number | null; atMinimum: number | null; totalAtMinimum: number | null };

const round2 = (n: number) => Math.round(n * 100) / 100;
const pos = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null);
const fmtPercent = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

export function couponMaxCost(i: CouponCostInput): CouponCost {
  const uses = pos(i.maxUses);
  const value = Number.isFinite(i.discountValue) ? i.discountValue : 0;
  if (i.discountType === 'fixed') {
    return { kind: 'fixed', perUse: round2(value), uses, total: uses === null ? null : round2(value * uses) };
  }
  const min = pos(i.minOrderValue);
  const atMinimum = min === null ? null : round2((min * value) / 100);
  return {
    kind: 'percent',
    percent: value,
    uses,
    atMinimum,
    totalAtMinimum: atMinimum === null || uses === null ? null : round2(atMinimum * uses),
  };
}

export function couponCostText(c: CouponCost): { title: string; detail: string } {
  if (c.kind === 'fixed') {
    return c.total === null
      ? { title: 'Sem limite de usos', detail: `Cada uso custa ${formatMoney(c.perUse)} ao DROP.` }
      : { title: `Custo máximo: ${formatMoney(c.total)}`, detail: `Se os ${c.uses} usos acontecerem (${formatMoney(c.perUse)} cada).` };
  }
  const title = `Cada uso custa ${fmtPercent(c.percent)}% do pedido`;
  if (c.atMinimum === null) {
    return { title, detail: 'Sem pedido mínimo, não há teto: o custo cresce com o valor do pedido.' };
  }
  const total = c.totalAtMinimum === null ? '' : ` ${c.uses} usos nesse valor somam ${formatMoney(c.totalAtMinimum)}.`;
  return { title, detail: `No pedido mínimo são ${formatMoney(c.atMinimum)} por uso.${total} Pedidos maiores custam mais.` };
}
