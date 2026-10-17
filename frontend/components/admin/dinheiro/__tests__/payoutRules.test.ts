import {
  isPayoutAlreadyReleased, isReadyToRelease, payoutStatus, recipientName, releaseSummary, type Payout,
} from '../payoutRules';

const base: Payout = { _id: 'p', recipientType: 'store', recipientId: 's', orderId: 'o', amount: 10, status: 'pending', createdAt: '2026-10-08T10:00:00Z' };
const conflict = (data: Record<string, unknown>) => ({ response: { status: 409, data: { error: 'x', ...data } } });

describe('"já liberado" pelo 409 PAYOUT_NOT_PENDING (D3b-3)', () => {
  it.each(['released', 'requested', 'paid'])('currentStatus %s e não bloqueado conta como feito', (st) => {
    expect(isPayoutAlreadyReleased(conflict({ code: 'PAYOUT_NOT_PENDING', currentStatus: st, blocked: false }))).toBe(true);
  });
  it('em andamento, bloqueado, cancelado, o texto antigo e rede não contam', () => {
    expect(isPayoutAlreadyReleased(conflict({ code: 'PAYOUT_NOT_PENDING', currentStatus: 'releasing', blocked: false }))).toBe(false);
    expect(isPayoutAlreadyReleased(conflict({ code: 'PAYOUT_NOT_PENDING', currentStatus: 'pending', blocked: true }))).toBe(false);
    expect(isPayoutAlreadyReleased(conflict({ code: 'PAYOUT_NOT_PENDING', currentStatus: 'cancelled', blocked: false }))).toBe(false);
    expect(isPayoutAlreadyReleased({ response: { status: 502, data: { error: 'Payout não está pendente (status atual: released)' } } })).toBe(false);
    expect(isPayoutAlreadyReleased(new Error('Network Error'))).toBe(false);
  });
});

describe('regras de tela', () => {
  it('pronto para liberar = pendente e não bloqueado', () => {
    expect(isReadyToRelease(base)).toBe(true);
    expect(isReadyToRelease({ ...base, blocked: true })).toBe(false);
    expect(isReadyToRelease({ ...base, status: 'released' })).toBe(false);
  });
  it('situação', () => {
    expect(payoutStatus(base)).toEqual({ label: 'Aguardando liberação', tone: 'warn' });
    expect(payoutStatus({ ...base, status: 'released' })).toEqual({ label: 'Liberado', tone: 'info' });
    expect(payoutStatus({ ...base, status: 'requested' })).toEqual({ label: 'Saque pedido', tone: 'info' });
    expect(payoutStatus({ ...base, status: 'paid' })).toEqual({ label: 'Pago', tone: 'ok' });
    expect(payoutStatus({ ...base, status: 'cancelled' })).toEqual({ label: 'Cancelado', tone: 'neutral' });
  });
  it('nome do recebedor', () => {
    expect(recipientName({ ...base, recipient: { id: 's', name: 'Pet Bom', type: 'store' } })).toBe('Pet Bom');
    expect(recipientName(base)).toBe('Loja');
    expect(recipientName({ ...base, recipientType: 'motoboy' })).toBe('Motoboy');
  });
  it('soma por tipo', () => {
    expect(releaseSummary([
      { ...base, amount: 100 }, { ...base, amount: 50.5 },
      { ...base, recipientType: 'motoboy', amount: 9.92 },
    ])).toBe('2 lojas (R$ 150,50) · 1 motoboy (R$ 9,92)');
    expect(releaseSummary([{ ...base, recipientType: 'motoboy', amount: 1 }, { ...base, recipientType: 'motoboy', amount: 2 }]))
      .toBe('2 motoboys (R$ 3,00)');
  });
});
