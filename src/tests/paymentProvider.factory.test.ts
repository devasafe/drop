import { getPaymentProvider } from '../services/paymentProvider';

describe('getPaymentProvider', () => {
  it('resolve o AsaasProvider por nome', () => {
    expect(getPaymentProvider('asaas').name).toBe('asaas');
  });
  it('lança para provedor ainda não implementado (mercadopago)', () => {
    expect(() => getPaymentProvider('mercadopago')).toThrow(/não implementado/i);
  });
});
