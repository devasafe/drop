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
  it('lê d.message e tolera data nulo', () => {
    expect(apiError(httpErr(500, { message: 'Falha interna' }))).toEqual({ status: 500, code: null, message: 'Falha interna' });
    expect(apiError(httpErr(502, null))).toEqual({ status: 502, code: null, message: null });
  });
  it('sem resposta (rede) devolve tudo nulo', () => {
    expect(apiError(new Error('Network Error'))).toEqual({ status: null, code: null, message: null });
  });
});

describe('unwrap', () => {
  it('abre { success:true, data }', () => {
    expect(unwrap({ data: { success: true, data: { readyAt: '2026-10-12T12:00:00Z' } } })).toEqual({ readyAt: '2026-10-12T12:00:00Z' });
  });
  it('tolera null e undefined', () => {
    expect(unwrap(null)).toBeUndefined();
    expect(unwrap(undefined)).toBeUndefined();
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
    const d = new Date('2026-10-10T12:05:00Z'); // 09:05 em SP, em qualquer fuso do aparelho
    expect(formatHour(d)).toBe('09:05');
    expect(formatDayMonth(d)).toBe('10/10');
    expect(formatDateTime(d)).toBe('10/10 09:05');
    expect(formatHour(null)).toBeNull();
    expect(formatHour('lixo')).toBeNull();
  });
  it('hora e data sempre em America/Sao_Paulo, qualquer que seja o fuso do aparelho', () => {
    const d = new Date('2026-10-12T02:30:00Z'); // 23:30 de 11/10 em SP
    expect(formatHour(d)).toBe('23:30');
    expect(formatDayMonth(d)).toBe('11/10');
    expect(formatDateTime(d)).toBe('11/10 23:30');
    expect(formatHour('2026-10-10T12:05:00Z')).toBe('09:05');
    expect(formatHour(null)).toBeNull();
    expect(formatHour('lixo')).toBeNull();
  });
  it('todayISO e currentMonth em America/Sao_Paulo', () => {
    expect(todayISO(new Date('2026-10-12T02:30:00Z'))).toBe('2026-10-11');
    expect(currentMonth(new Date('2026-11-01T01:00:00Z'))).toBe('2026-10');
    expect(todayISO(new Date('2026-01-07T12:00:00Z'))).toBe('2026-01-07');
    expect(currentMonth(new Date('2026-01-07T12:00:00Z'))).toBe('2026-01');
  });
});

describe('parseMoneyInput', () => {
  it('aceita formatos válidos', () => {
    expect(parseMoneyInput('49,90')).toBe(49.9);
    expect(parseMoneyInput('49.90')).toBe(49.9);
    expect(parseMoneyInput('49.9')).toBe(49.9);
    expect(parseMoneyInput('1.234,56')).toBe(1234.56);
    expect(parseMoneyInput('1.842,60')).toBe(1842.6);
    expect(parseMoneyInput('1234,56')).toBe(1234.56);
    expect(parseMoneyInput('10')).toBe(10);
    expect(parseMoneyInput(' 10,5 ')).toBe(10.5);
  });
  it('falha fechado (NaN) em entrada ambígua ou inválida', () => {
    for (const bad of ['1.000', '49.999', '1.234.567', '49,999', '1,234.56', '49,9,0', '-10', '-10,50', '', '   ', 'abc', '1.23,4', '12.3456', '1.2.3', ',50', '49,', 'R$ 10']) {
      expect(parseMoneyInput(bad)).toBeNaN();
    }
  });
});
