import { adminErrorMessage, isHttpStatus, isAlreadyDoneConflict } from '../adminErrors';

const http = (status: number, data?: unknown) => ({ response: { status, data } });

describe('adminErrorMessage (spec 6.1)', () => {
  it('403: "Você não tem permissão para isso", mesmo com texto do servidor', () => {
    expect(adminErrorMessage(http(403, { error: 'Permissão negada. Você precisa de: payout:release' })))
      .toBe('Você não tem permissão para isso');
  });
  it('usa o texto do servidor (error ou message)', () => {
    expect(adminErrorMessage(http(400, { error: 'Saldo insuficiente' }))).toBe('Saldo insuficiente');
    expect(adminErrorMessage(http(409, { message: 'Repasse já liberado' }))).toBe('Repasse já liberado');
  });
  it('sem resposta (rede): mensagem de conexão', () => {
    expect(adminErrorMessage({ message: 'Network Error' })).toBe('Sem conexão com o servidor. Tente de novo.');
  });
  it('desconhecido: o texto padrão ou o da tela', () => {
    expect(adminErrorMessage(new Error('x'))).toBe('Não deu certo. Tente de novo.');
    expect(adminErrorMessage(http(500, {}), 'Erro ao liberar')).toBe('Erro ao liberar');
  });
});

describe('isHttpStatus / isAlreadyDoneConflict', () => {
  it('lê o status da resposta', () => {
    expect(isHttpStatus(http(409), 409)).toBe(true);
    expect(isHttpStatus(http(400), 409)).toBe(false);
    expect(isHttpStatus(new Error('x'), 409)).toBe(false);
    expect(isAlreadyDoneConflict(http(409))).toBe(true);
    expect(isAlreadyDoneConflict(http(500))).toBe(false);
  });
});
