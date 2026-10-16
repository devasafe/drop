import { adminErrorMessage } from '../../../../lib/adminErrors';
import { flattenServerError, serverErrorCode, serverErrorMessage } from '../serverError';

describe('serverError', () => {
  it('lê { error: "texto" } das rotas antigas', () => {
    expect(serverErrorMessage({ response: { status: 400, data: { error: 'Valor inválido' } } })).toBe('Valor inválido');
  });

  it('lê { error: { message, code } } do AppError (modo direto)', () => {
    const err = { response: { status: 409, data: { success: false, error: { message: 'Este estorno já foi concluído', code: 'REFUND_ALREADY_DONE' } } } };
    expect(serverErrorMessage(err)).toBe('Este estorno já foi concluído');
    expect(serverErrorCode(err)).toBe('REFUND_ALREADY_DONE');
  });

  it('lê o code no topo da resposta (rotas de saque)', () => {
    const err = { response: { status: 409, data: { error: 'Saque não está pendente', code: 'WITHDRAWAL_NOT_PENDING' } } };
    expect(serverErrorCode(err)).toBe('WITHDRAWAL_NOT_PENDING');
  });

  it('sem code: null', () => {
    expect(serverErrorCode({ response: { status: 500, data: { error: 'x' } } })).toBeNull();
    expect(serverErrorCode(new Error('rede'))).toBeNull();
  });

  it('403 vira o texto de permissão', () => {
    expect(serverErrorMessage({ response: { status: 403, data: { error: { message: 'FORBIDDEN' } } } })).toBe('Você não tem permissão para isso');
  });

  it('sem resposta: texto padrão', () => {
    expect(serverErrorMessage(new Error('x'), 'Falhou.')).toBe('Falhou.');
  });

  it('flattenServerError: a AdminSheet passa a mostrar a mensagem e o código do AppError', () => {
    const flat = flattenServerError({ response: { status: 409, data: { error: { message: 'Este estorno já foi concluído', code: 'REFUND_ALREADY_DONE' } } } });
    expect(flat).toEqual({ response: { status: 409, data: { error: 'Este estorno já foi concluído', code: 'REFUND_ALREADY_DONE' } } });
    expect(adminErrorMessage(flat)).toBe('Este estorno já foi concluído');
  });
});
