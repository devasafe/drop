import {
  bankSummary, isResolvable, isWithdrawalAlreadyHandled, isWithdrawalUncertain, STALE_IN_FLIGHT_MS, withdrawalStatus,
  type Withdrawal,
} from '../withdrawalRules';

const base: Withdrawal = { _id: 'w', amount: 10, status: 'approved', requestedAt: '2026-10-08T10:00:00Z' };
const err = (status: number, code?: string, extra: Record<string, unknown> = {}) => ({ response: { status, data: { error: 'x', ...(code ? { code } : {}), ...extra } } });

describe('isResolvable (igual à página antiga)', () => {
  const now = Date.parse('2026-10-08T12:00:00Z');
  it('só approved', () => {
    expect(isResolvable({ ...base, status: 'pending', uncertainAt: '2026-10-08T11:00:00Z' }, now)).toBe(false);
    expect(isResolvable({ ...base, status: 'processed' }, now)).toBe(false);
    expect(isResolvable(null, now)).toBe(false);
  });
  it('incerto: sempre', () => {
    expect(isResolvable({ ...base, uncertainAt: '2026-10-08T11:59:00Z' }, now)).toBe(true);
  });
  it('em voo: só depois de 10 min', () => {
    expect(isResolvable({ ...base, approvedAt: new Date(now - STALE_IN_FLIGHT_MS + 1000).toISOString() }, now)).toBe(false);
    expect(isResolvable({ ...base, approvedAt: new Date(now - STALE_IN_FLIGHT_MS - 1000).toISOString() }, now)).toBe(true);
    expect(isResolvable({ ...base, approvedAt: null }, now)).toBe(false);
  });
});

describe('"já feito" do lote de aprovação (POST /withdrawals/approve)', () => {
  it('409 WITHDRAWAL_NOT_PENDING com currentStatus processed é "já feito" (E8)', () => {
    expect(isWithdrawalAlreadyHandled(err(409, 'WITHDRAWAL_NOT_PENDING', { currentStatus: 'processed' }))).toBe(true);
  });
  it('409 WITHDRAWAL_NOT_PENDING com approved, rejected ou sem currentStatus NÃO é "já feito" (E8)', () => {
    expect(isWithdrawalAlreadyHandled(err(409, 'WITHDRAWAL_NOT_PENDING', { currentStatus: 'approved' }))).toBe(false);
    expect(isWithdrawalAlreadyHandled(err(409, 'WITHDRAWAL_NOT_PENDING', { currentStatus: 'rejected' }))).toBe(false);
    expect(isWithdrawalAlreadyHandled(err(409, 'WITHDRAWAL_NOT_PENDING'))).toBe(false);
  });
  it('409 WITHDRAWAL_NOT_RESOLVABLE NÃO é "já feito"', () => {
    expect(isWithdrawalAlreadyHandled(err(409, 'WITHDRAWAL_NOT_RESOLVABLE'))).toBe(false);
  });
  it('409 sem código, 502 incerto, 502 do gateway e erro de rede não são "já feito"', () => {
    expect(isWithdrawalAlreadyHandled(err(409))).toBe(false);
    expect(isWithdrawalAlreadyHandled(err(502, 'WITHDRAWAL_UNCERTAIN'))).toBe(false);
    expect(isWithdrawalAlreadyHandled(err(502))).toBe(false);
    expect(isWithdrawalAlreadyHandled(new Error('Network Error'))).toBe(false);
  });
  it('incerto é reconhecido pelo código', () => {
    expect(isWithdrawalUncertain(err(502, 'WITHDRAWAL_UNCERTAIN'))).toBe(true);
    expect(isWithdrawalUncertain(err(502))).toBe(false);
  });
});

describe('rótulos', () => {
  it('situação', () => {
    expect(withdrawalStatus({ ...base, status: 'pending' })).toEqual({ label: 'Pendente', tone: 'warn' });
    expect(withdrawalStatus({ ...base, uncertainAt: '2026-10-08T11:00:00Z' })).toEqual({ label: 'Incerto — conferir no painel Asaas', tone: 'bad' });
    expect(withdrawalStatus({ ...base })).toEqual({ label: 'Em processamento', tone: 'info' });
    expect(withdrawalStatus({ ...base, status: 'processed' })).toEqual({ label: 'Pago', tone: 'ok' });
    expect(withdrawalStatus({ ...base, status: 'rejected' })).toEqual({ label: 'Recusado', tone: 'neutral' });
  });
  it('dados bancários', () => {
    expect(bankSummary({ ...base, bankAccount: { bankName: 'Nubank', accountType: 'savings', routingNumber: '0001', accountNumber: '9-9', ownerName: 'José' } }))
      .toBe('Nubank · Poupança · Ag 0001 · CC 9-9 · José');
    expect(bankSummary({ ...base, bankAccount: null })).toBeNull();
  });
});
