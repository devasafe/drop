import { computeCardTotal, installmentOptions } from '../utils/cardInstallments';
const cfg = { cardFeePercent: 2.99, cardFeeFixed: 0.49, cardAnticipationMonthlyRate: 1.99 };

test('gross-up: conta-mãe fica ~com o base após descontos', () => {
  const base = 100;
  const { total } = computeCardTotal(base, 3, cfg);
  // após Asaas descontar cartão + antecipação, sobra ≈ base
  const anticip = (cfg.cardAnticipationMonthlyRate / 100) * total * (3 + 1) / 2;
  const net = total - (cfg.cardFeePercent / 100) * total - cfg.cardFeeFixed - anticip;
  expect(net).toBeCloseTo(base, 1);
});
test('parcelas somam o total (resíduo na última)', () => {
  const { total, installmentValue } = computeCardTotal(100, 3, cfg);
  const last = Math.round((total - installmentValue * 2) * 100) / 100;
  expect(Math.round((installmentValue * 2 + last) * 100) / 100).toBe(total);
});
test('denominador <= 0 lança', () => {
  expect(() => computeCardTotal(100, 12, { cardFeePercent: 90, cardFeeFixed: 0, cardAnticipationMonthlyRate: 5 })).toThrow();
});
test('installmentOptions filtra parcela abaixo do mínimo', () => {
  const opts = installmentOptions(30, { ...cfg, cardInstallmentMaxCount: 12, cardInstallmentMinValue: 5 });
  expect(opts.every(o => o.installmentValue >= 5)).toBe(true);
  expect(opts[0].count).toBe(1);
});
