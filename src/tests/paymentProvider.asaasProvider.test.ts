import { AsaasProvider } from '../services/paymentProvider/asaasProvider';

const releaseOrderViaAsaas = jest.fn();
const refundOrderCharge = jest.fn();
jest.mock('../services/asaas/release', () => ({ releaseOrderViaAsaas: (...a: any[]) => releaseOrderViaAsaas(...a) }));
jest.mock('../services/asaas/refund', () => ({ refundOrderCharge: (...a: any[]) => refundOrderCharge(...a) }));

describe('AsaasProvider (adaptador)', () => {
  beforeEach(() => { releaseOrderViaAsaas.mockReset(); refundOrderCharge.mockReset(); });

  it('capabilities do Asaas: escrow, saque e topup habilitados', () => {
    const p = new AsaasProvider();
    expect(p.capabilities).toEqual({ supportsEscrow: true, supportsAppWithdrawal: true, supportsWalletTopup: true });
  });

  it('onDeliveryConfirmed delega para releaseOrderViaAsaas', async () => {
    await new AsaasProvider().onDeliveryConfirmed('order-1');
    expect(releaseOrderViaAsaas).toHaveBeenCalledWith('order-1');
  });

  it('refund delega para refundOrderCharge com o paymentId e valor', async () => {
    refundOrderCharge.mockResolvedValue(undefined);
    const r = await new AsaasProvider().refund('order-1', 'pay-9', 50);
    expect(refundOrderCharge).toHaveBeenCalledWith('pay-9', 50);
    expect(r.status).toBe('done');
  });

  it('refund retorna failed quando o Asaas lança', async () => {
    refundOrderCharge.mockRejectedValue(new Error('sem saldo'));
    const r = await new AsaasProvider().refund('order-1', 'pay-9', 50);
    expect(r.status).toBe('failed');
    expect(r.errorMessage).toContain('sem saldo');
  });
});
