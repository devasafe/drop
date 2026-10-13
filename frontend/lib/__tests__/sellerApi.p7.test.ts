import { payload, apiErrorCode, apiErrorMessage, apiStatus } from '../sellerApi';

describe('sellerApi (P7)', () => {
  test('payload abre { success, data } e devolve o corpo antigo como veio', () => {
    expect(payload({ data: { success: true, data: { pausedUntil: null } } })).toEqual({ pausedUntil: null });
    expect(payload({ data: [{ storeRating: 5 }] })).toEqual([{ storeRating: 5 }]);
    expect(payload({ data: { success: true, type: 'logo', url: 'u' } })).toEqual({ success: true, type: 'logo', url: 'u' });
    expect(payload(null)).toBeUndefined();
  });

  test('erro novo (AppError) e erro antigo ({ error: texto })', () => {
    const novo = { response: { status: 409, data: { success: false, error: { message: 'Cupom encerrado', statusCode: 409, code: 'COUPON_ENDED' } } } };
    const antigo = { response: { status: 400, data: { error: 'Plano inválido' } } };
    const comCodigoSolto = { response: { status: 409, data: { error: 'Há repasse pendente', code: 'STORE_TRANSFER_PENDING' } } };
    expect(apiErrorCode(novo)).toBe('COUPON_ENDED');
    expect(apiErrorMessage(novo, 'x')).toBe('Cupom encerrado');
    expect(apiErrorMessage(antigo, 'x')).toBe('Plano inválido');
    expect(apiErrorCode(antigo)).toBeUndefined();
    expect(apiErrorCode(comCodigoSolto)).toBe('STORE_TRANSFER_PENDING');
    expect(apiErrorMessage(new Error('rede'), 'Tente de novo')).toBe('Tente de novo');
    expect(apiStatus(novo)).toBe(409);
    expect(apiStatus(new Error('rede'))).toBeUndefined();
  });
});
