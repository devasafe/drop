import { loginErrorMessage } from '../authErrors';

const http = (status: number, data: unknown = {}) => ({ response: { status, data } });

it('401 com poucas tentativas: diz quantas faltam antes da pausa', () => {
  expect(loginErrorMessage(http(401, { error: 'Invalid credentials', attemptsLeft: 3 }))).toEqual({
    title: 'E-mail ou senha não conferem', body: 'Faltam 3 tentativas antes de uma pausa de 15 min.',
  });
  expect(loginErrorMessage(http(401, { attemptsLeft: 1 })).body).toBe('Falta 1 tentativa antes de uma pausa de 15 min.');
});
it('401 sem tentativas (ou ainda muitas): só pede para conferir', () => {
  expect(loginErrorMessage(http(401, { attemptsLeft: 20 })).body).toBe('Confira os dados e tente de novo.');
  expect(loginErrorMessage(http(401)).body).toBe('Confira os dados e tente de novo.');
});
it('429 usa a frase do servidor com a hora de volta', () => {
  expect(loginErrorMessage(http(429, { error: 'Muitas tentativas. Tente de novo às 14:32.' }))).toEqual({
    title: 'Muitas tentativas', body: 'Muitas tentativas. Tente de novo às 14:32.',
  });
});
it('403 é conta bloqueada; sem resposta é sem conexão', () => {
  expect(loginErrorMessage(http(403, { reason: 'Uso indevido' }))).toEqual({ title: 'Conta bloqueada', body: 'Uso indevido' });
  expect(loginErrorMessage(new Error('Network Error'))).toEqual({ title: 'Sem conexão', body: 'Confira a internet e tente de novo.' });
});
