import {
  isPayoutAlreadyReleased, isReadyToRelease, payoutStatus, recipientName, releaseSummary, type Payout,
} from '../payoutRules';

const base: Payout = { _id: 'p', recipientType: 'store', recipientId: 's', orderId: 'o', amount: 10, status: 'pending', createdAt: '2026-10-08T10:00:00Z' };
const err = (status: number, error: string) => ({ response: { status, data: { error } } });

describe('"já liberado" pelo texto exato do servidor', () => {
  it.each(['released', 'requested', 'paid'])('status atual %s conta como feito (Asaas, 502)', (st) => {
    expect(isPayoutAlreadyReleased(err(502, `Transferência no Asaas não concluída: Payout não está pendente (status atual: ${st})`))).toBe(true);
  });
  it('o mesmo texto com 400 também (caminho sem Asaas do mesmo serviço)', () => {
    expect(isPayoutAlreadyReleased(err(400, 'Payout não está pendente (status atual: released)'))).toBe(true);
  });
  it('cancelado, bloqueado, sem subconta, sem status, 409 e rede não contam', () => {
    expect(isPayoutAlreadyReleased(err(502, 'Payout não está pendente (status atual: cancelled)'))).toBe(false);
    expect(isPayoutAlreadyReleased(err(400, 'Payout bloqueado: Fraude'))).toBe(false);
    expect(isPayoutAlreadyReleased(err(502, 'Transferência no Asaas não concluída: Recebedor sem subconta Asaas configurada'))).toBe(false);
    expect(isPayoutAlreadyReleased(err(400, 'Payout p1 não encontrado ou não está pending'))).toBe(false);
    expect(isPayoutAlreadyReleased(err(409, '(status atual: released)'))).toBe(false);
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
