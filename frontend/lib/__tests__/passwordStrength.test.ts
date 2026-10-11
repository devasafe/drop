import { passwordStrength } from '../passwordStrength';

it.each([
  ['abc', 0, 'Fraca: 3 caracteres', false],
  ['abcdefgh', 1, 'Fraca: 8 caracteres', true],
  ['abcdefg1', 2, 'Ok: 8 caracteres com número', true],
  ['abcdefgh12', 3, 'Boa: 10 caracteres com número', true],
  ['Abcdefgh12', 4, 'Forte: 10 caracteres com número', true],
])('%s → score %i', (pw, score, label, ok) => {
  expect(passwordStrength(pw)).toEqual({ score, label, ok });
});
