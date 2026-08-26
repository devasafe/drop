import { getActivePaymentProviderName } from '../services/paymentProvider/activeProvider';

const findFirst = jest.fn();
jest.mock('../lib/prisma', () => ({
  prisma: { platformConfig: { findFirst: (...a: any[]) => findFirst(...a) } },
}));

describe('getActivePaymentProviderName', () => {
  beforeEach(() => findFirst.mockReset());

  it('retorna o provedor gravado no PlatformConfig', async () => {
    findFirst.mockResolvedValue({ paymentProvider: 'mercadopago' });
    await expect(getActivePaymentProviderName()).resolves.toBe('mercadopago');
  });

  it('cai para asaas quando não há config', async () => {
    findFirst.mockResolvedValue(null);
    await expect(getActivePaymentProviderName()).resolves.toBe('asaas');
  });
});
