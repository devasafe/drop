/**
 * D3a · leitor de valor em reais digitado no admin (Carteiras, Caixa).
 * Tem que ser exatamente o digitado: só dígitos, com vírgula ou ponto e até 2 casas.
 */
import { AMOUNT_RE, amountFieldError, parseAmount } from '../adminAmount';

describe('parseAmount', () => {
  it.each([
    ['25', 25],
    ['25,5', 25.5],
    ['25.50', 25.5],
    ['500,50', 500.5],
    ['1234.5', 1234.5],
    ['0', 0],
    ['0,00', 0],
  ])('aceita %p → %p', (v, n) => {
    expect(parseAmount(v)).toBe(n);
    expect(AMOUNT_RE.test(v)).toBe(true);
  });

  it.each([
    '', ' ', '1.234,56', '1,234.56', '10abc', 'abc', '1e3', '0,001', '-5', '+5', ' 5', '5 ', ',5', '5,', 'R$ 5',
  ])('recusa %p (null)', (v) => {
    expect(parseAmount(v)).toBeNull();
    expect(AMOUNT_RE.test(v)).toBe(false);
  });
});

describe('amountFieldError', () => {
  it('vazio não tem aviso; formato recusado e zero têm', () => {
    expect(amountFieldError('')).toBeUndefined();
    expect(amountFieldError('25,50')).toBeUndefined();
    expect(amountFieldError('1.234,56')).toBe('Use só números, com até 2 casas (ex.: 25,50).');
    expect(amountFieldError('0,00')).toBe('O valor tem que ser maior que zero.');
  });
});
