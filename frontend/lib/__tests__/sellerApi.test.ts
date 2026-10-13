import { apiError, unwrap, formatClock, formatHour, formatDayMonth, formatDateTime, todayISO, currentMonth, parseMoneyInput } from '../sellerApi';

const httpErr = (status: number, data: any) => ({ response: { status, data } });

describe('apiError', () => {
  it('lê o formato antigo { error: string, code }', () => {
    expect(apiError(httpErr(429, { error: 'Muitas tentativas de PIN. Tente novamente em 9 min.', code: 'PIN_LOCKED' })))
      .toEqual({ status: 429, code: 'PIN_LOCKED', message: 'Muitas tentativas de PIN. Tente novamente em 9 min.' });
  });
  it('lê o formato do AppError { success:false, error:{ message, code } }', () => {
    expect(apiError(httpErr(400, { success: false, error: { message: 'O saque mínimo é R$ 10,00', statusCode: 400, code: 'BELOW_MINIMUM_WITHDRAW' } })))
      .toEqual({ status: 400, code: 'BELOW_MINIMUM_WITHDRAW', message: 'O saque mínimo é R$ 10,00' });
  });
  it('sem resposta (rede) devolve tudo nulo', () => {
    expect(apiError(new Error('Network Error'))).toEqual({ status: null, code: null, message: null });
  });
});

describe('unwrap', () => {
  it('abre { success:true, data }', () => {
    expect(unwrap({ data: { success: true, data: { readyAt: '2026-10-12T12:00:00Z' } } })).toEqual({ readyAt: '2026-10-12T12:00:00Z' });
  });
  it('devolve o corpo cru das rotas antigas', () => {
    expect(unwrap({ data: { success: true, orderId: 'o1', refundStatus: 'pending' } })).toEqual({ success: true, orderId: 'o1', refundStatus: 'pending' });
    expect(unwrap({ data: { store: { _id: 's1' } } })).toEqual({ store: { _id: 's1' } });
  });
});

describe('relógio e datas', () => {
  it('formatClock em m:ss e h:mm:ss, nunca negativo', () => {
    expect(formatClock(252000)).toBe('4:12');
    expect(formatClock(600000)).toBe('10:00');
    expect(formatClock(3725000)).toBe('1:02:05');
    expect(formatClock(-5)).toBe('0:00');
  });
  it('formatHour, formatDayMonth e formatDateTime', () => {
    const d = new Date(2026, 9, 10, 9, 5);
    expect(formatHour(d)).toBe('09:05');
    expect(formatDayMonth(d)).toBe('10/10');
    expect(formatDateTime(d)).toBe('10/10 09:05');
    expect(formatHour(null)).toBeNull();
    expect(formatHour('lixo')).toBeNull();
  });
  it('todayISO e currentMonth no fuso local', () => {
    const d = new Date(2026, 0, 7, 23, 59);
    expect(todayISO(d)).toBe('2026-01-07');
    expect(currentMonth(d)).toBe('2026-01');
  });
});

describe('parseMoneyInput', () => {
  it('aceita vírgula ou ponto decimal e milhar com ponto', () => {
    expect(parseMoneyInput('49,90')).toBe(49.9);
    expect(parseMoneyInput('1.842,60')).toBe(1842.6);
    expect(parseMoneyInput('49.90')).toBe(49.9);
    expect(parseMoneyInput('')).toBeNaN();
    expect(parseMoneyInput('abc')).toBeNaN();
  });
});
