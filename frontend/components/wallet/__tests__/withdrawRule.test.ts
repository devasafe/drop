import { parseWithdrawInput, toWithdrawInput, checkWithdraw, withdrawPayload } from '../withdrawRule';

test('parse e formatação (parse da D1: "50.5" vale 50,50; ambíguo falha fechado)', () => {
  expect(parseWithdrawInput('1.234,56')).toBe(1234.56);
  expect(parseWithdrawInput('50')).toBe(50);
  expect(parseWithdrawInput('50.5')).toBe(50.5);
  for (const v of ['abc', '', '1.000', '1,000,5', '49.999']) expect(Number.isNaN(parseWithdrawInput(v))).toBe(true);
  expect(toWithdrawInput(318.4)).toBe('318,40');
  expect(toWithdrawInput(500)).toBe('500,00');
});

test('checkWithdraw: disponível comparado em centavos (sem erro de ponto flutuante)', () => {
  expect(checkWithdraw('318,40', 318.4)).toMatchObject({ valid: true, isAll: true, overAvailable: false });
  expect(checkWithdraw('318,41', 318.4)).toMatchObject({ valid: false, overAvailable: true });
  expect(checkWithdraw('318,42', 318.4)).toMatchObject({ valid: false, overAvailable: true });
  expect(checkWithdraw('0,1', 0.3)).toMatchObject({ valid: true, isAll: false });
  expect(checkWithdraw('100', 318.4)).toMatchObject({ valid: true, isAll: false, value: 100 });
  expect(checkWithdraw('50.5', 318.4)).toMatchObject({ valid: true, value: 50.5 });
  expect(checkWithdraw('0', 318.4).valid).toBe(false);
  expect(checkWithdraw('', 318.4)).toMatchObject({ valid: false, invalid: false });
});

test('checkWithdraw: valor ambíguo é inválido e nunca vale', () => {
  expect(checkWithdraw('1.000', 5000)).toMatchObject({ valid: false, invalid: true });
});

test('checkWithdraw: mínimo do servidor (null = o servidor decide)', () => {
  expect(checkWithdraw('30', 318.4, 50)).toMatchObject({ valid: false, belowMinimum: true });
  expect(checkWithdraw('50', 318.4, 50)).toMatchObject({ valid: true, belowMinimum: false });
  expect(checkWithdraw('30', 318.4, null)).toMatchObject({ valid: true, belowMinimum: false });
});

test('withdrawPayload: tudo → "all"; senão o valor com 2 casas', () => {
  expect(withdrawPayload(checkWithdraw('318,40', 318.4))).toBe('all');
  expect(withdrawPayload(checkWithdraw('50,55', 318.4))).toBe(50.55);
  expect(withdrawPayload(checkWithdraw('1.234,56', 5000))).toBe(1234.56);
});
