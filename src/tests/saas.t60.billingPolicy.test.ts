import { effectiveFee, coveredUntil, isBillingBlocked, nextPaidUntil } from '../services/saasBilling/policy';

const d = (s: string) => new Date(s + 'T12:00:00.000Z');

describe('t60 — política da mensalidade SaaS (pura)', () => {
  describe('effectiveFee', () => {
    it('usa o valor especial da loja', () => {
      expect(effectiveFee({ customFee: 49.9 }, { saasMonthlyFee: 99 })).toBe(49.9);
    });
    it('valor especial 0 vale (loja isenta)', () => {
      expect(effectiveFee({ customFee: 0 }, { saasMonthlyFee: 99 })).toBe(0);
    });
    it('sem valor especial usa o padrão', () => {
      expect(effectiveFee({ customFee: null }, { saasMonthlyFee: 99 })).toBe(99);
      expect(effectiveFee(null, { saasMonthlyFee: 99 })).toBe(99);
    });
    it('aceita objeto tipo Decimal', () => {
      expect(effectiveFee({ customFee: { toString: () => '12.5' } as any }, { saasMonthlyFee: 99 })).toBe(12.5);
    });
  });

  describe('coveredUntil', () => {
    it('é o maior entre trialEndsAt e paidUntil', () => {
      expect(coveredUntil({ trialEndsAt: d('2026-10-10'), paidUntil: null })).toEqual(d('2026-10-10'));
      expect(coveredUntil({ trialEndsAt: d('2026-10-10'), paidUntil: d('2026-11-10') })).toEqual(d('2026-11-10'));
      expect(coveredUntil({ trialEndsAt: d('2026-12-10'), paidUntil: d('2026-11-10') })).toEqual(d('2026-12-10'));
    });
  });

  describe('isBillingBlocked', () => {
    const now = d('2026-10-20');
    it('sem linha de cobrança: não bloqueia (fail open proposital)', () => {
      expect(isBillingBlocked(null, now, 5)).toBe(false);
    });
    it('em teste dentro do prazo', () => {
      expect(isBillingBlocked({ status: 'trialing', trialEndsAt: d('2026-10-25'), paidUntil: null }, now, 5)).toBe(false);
    });
    it('teste vencido dentro da tolerância', () => {
      expect(isBillingBlocked({ status: 'past_due', trialEndsAt: d('2026-10-17'), paidUntil: null }, now, 5)).toBe(false);
    });
    it('teste vencido além da tolerância', () => {
      expect(isBillingBlocked({ status: 'past_due', trialEndsAt: d('2026-10-10'), paidUntil: null }, now, 5)).toBe(true);
    });
    it('pago com paidUntil futuro', () => {
      expect(isBillingBlocked({ status: 'active', trialEndsAt: d('2026-09-01'), paidUntil: d('2026-11-01') }, now, 5)).toBe(false);
    });
    it('pago vencido além da tolerância', () => {
      expect(isBillingBlocked({ status: 'past_due', trialEndsAt: d('2026-09-01'), paidUntil: d('2026-10-01') }, now, 5)).toBe(true);
    });
    it('cancelada sempre bloqueia', () => {
      expect(isBillingBlocked({ status: 'cancelled', trialEndsAt: d('2027-01-01'), paidUntil: d('2027-01-01') }, now, 5)).toBe(true);
    });
  });

  describe('nextPaidUntil', () => {
    it('avança 1 mês a partir do vencimento', () => {
      expect(nextPaidUntil(null, d('2026-10-10'))).toEqual(d('2026-11-10'));
      expect(nextPaidUntil(d('2026-10-10'), d('2026-10-10'))).toEqual(d('2026-11-10'));
    });
    it('não regride se o atual é maior', () => {
      expect(nextPaidUntil(d('2027-03-01'), d('2026-10-10'))).toEqual(d('2027-03-01'));
    });
    it('fim de mês: 31/01 + 1 mês = último dia de fevereiro', () => {
      expect(nextPaidUntil(null, d('2026-01-31'))).toEqual(d('2026-02-28'));
      expect(nextPaidUntil(null, d('2028-01-31'))).toEqual(d('2028-02-29'));
    });
  });
});
