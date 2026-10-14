import { parseMotoboyRules, exampleRide } from '../motoboyRules';

const CFG = {
  motoboyCutPerDelivery: '5.00', motoboyCutPerKm: '1.00', motoboyCommissionPercent: '20.00',
  motoboyMinimumWithdraw: '50.00', customerAbsentWaitMin: 15, lateCancellationMotoboyShare: '50.00',
  transferBlockHours: 24, autoApprovePayouts: false, autoApproveWithdrawals: true,
};

it('lê os números do PlatformConfig (Decimal em string)', () => {
  expect(parseMotoboyRules(CFG)).toEqual({
    basePerDelivery: 5, perKm: 1, commissionPercent: 20, minimumWithdraw: 50,
    customerAbsentWaitMin: 15, lateCancellationMotoboyShare: 50, transferBlockHours: 24,
    autoApprovePayouts: false, autoApproveWithdrawals: true,
  });
});

it('mesma regra do servidor: base, km e comissão zerados valem o padrão (5, 1, 20)', () => {
  const r = parseMotoboyRules({ ...CFG, motoboyCutPerDelivery: 0, motoboyCutPerKm: '0', motoboyCommissionPercent: 0 })!;
  expect([r.basePerDelivery, r.perKm, r.commissionPercent]).toEqual([5, 1, 20]);
});

it('fail closed: campo ausente, negativo ou estranho → null', () => {
  expect(parseMotoboyRules(null)).toBeNull();
  expect(parseMotoboyRules({ ...CFG, motoboyMinimumWithdraw: undefined })).toBeNull();
  expect(parseMotoboyRules({ ...CFG, transferBlockHours: -1 })).toBeNull();
  expect(parseMotoboyRules({ ...CFG, motoboyCommissionPercent: 'abc' })).toBeNull();
  expect(parseMotoboyRules({ ...CFG, lateCancellationMotoboyShare: 120 })).toBeNull();
});

it('exemplo ilustrativo de corrida com a fórmula do servidor (custódia)', () => {
  expect(exampleRide(parseMotoboyRules(CFG)!, 3.4)).toEqual({ extra: 3.4, fee: 8.4, sharePercent: 80, mine: 6.72 });
  const outra = parseMotoboyRules({ ...CFG, motoboyCutPerDelivery: 6, motoboyCutPerKm: 2, motoboyCommissionPercent: 25 })!;
  expect(exampleRide(outra, 3.4)).toEqual({ extra: 6.8, fee: 12.8, sharePercent: 75, mine: 9.6 });
  expect(exampleRide(outra, 3.4, 'custodia')).toEqual({ extra: 6.8, fee: 12.8, sharePercent: 75, mine: 9.6 });
});

describe('modo direto (K6)', () => {
  it('usa motoboyShareDirect do PlatformConfig, não a comissão', () => {
    const r = parseMotoboyRules({ ...CFG, motoboyShareDirect: 80 })!;
    expect(r.shareDirectPercent).toBe(80);
    expect(exampleRide(r, 3.4, 'direto')).toEqual({ extra: 3.4, fee: 8.4, sharePercent: 80, mine: 6.72 });
    const cem = parseMotoboyRules({ ...CFG, motoboyShareDirect: '100.00' })!;
    expect(exampleRide(cem, 3.4, 'direto')).toEqual({ extra: 3.4, fee: 8.4, sharePercent: 100, mine: 8.4 });
  });

  it('sem o campo, ou inválido: sem número no direto (null), custódia segue igual', () => {
    const sem = parseMotoboyRules(CFG)!;
    expect(sem.shareDirectPercent).toBeUndefined();
    expect(exampleRide(sem, 3.4, 'direto')).toBeNull();
    for (const bad of ['abc', -5, 150, null]) {
      const r = parseMotoboyRules({ ...CFG, motoboyShareDirect: bad })!;
      expect(r).not.toBeNull();
      expect(exampleRide(r, 3.4, 'direto')).toBeNull();
      expect(exampleRide(r, 3.4)).not.toBeNull();
    }
  });
});
