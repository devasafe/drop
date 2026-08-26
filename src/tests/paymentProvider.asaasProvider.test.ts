import { AsaasProvider } from '../services/paymentProvider/asaasProvider';

const releaseOrderViaAsaas = jest.fn();
const refundOrderCharge = jest.fn();
const ensureAsaasCustomer = jest.fn();
const createPixCharge = jest.fn();
const createCardCharge = jest.fn();
const getPaymentStatus = jest.fn();
const cancelCharge = jest.fn();
jest.mock('../services/asaas/release', () => ({ releaseOrderViaAsaas: (...a: any[]) => releaseOrderViaAsaas(...a) }));
jest.mock('../services/asaas/refund', () => ({ refundOrderCharge: (...a: any[]) => refundOrderCharge(...a) }));
jest.mock('../services/asaas/payment', () => ({
  ensureAsaasCustomer: (...a: any[]) => ensureAsaasCustomer(...a),
  createPixCharge: (...a: any[]) => createPixCharge(...a),
  createCardCharge: (...a: any[]) => createCardCharge(...a),
  getPaymentStatus: (...a: any[]) => getPaymentStatus(...a),
  cancelCharge: (...a: any[]) => cancelCharge(...a),
}));

describe('AsaasProvider (adaptador)', () => {
  beforeEach(() => {
    releaseOrderViaAsaas.mockReset();
    refundOrderCharge.mockReset();
    ensureAsaasCustomer.mockReset();
    createPixCharge.mockReset();
    createCardCharge.mockReset();
    getPaymentStatus.mockReset();
    cancelCharge.mockReset();
  });

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

  describe('createCharge — branch pix', () => {
    it('delega para ensureAsaasCustomer + createPixCharge e mapeia PixCharge -> ChargeResult', async () => {
      ensureAsaasCustomer.mockResolvedValue('cus_123');
      createPixCharge.mockResolvedValue({
        paymentId: 'pay_pix_1',
        status: 'PENDING',
        qrCodeImage: 'img-base64',
        qrCodePayload: 'copia-e-cola',
        expiresAt: '2026-09-01T00:00:00Z',
      });

      const result = await new AsaasProvider().createCharge({
        orderId: 'order-1',
        buyerUserId: 'user-1',
        value: 42.5,
        method: 'pix',
        description: 'Pedido order-1',
      });

      expect(ensureAsaasCustomer).toHaveBeenCalledWith('user-1');
      expect(createPixCharge).toHaveBeenCalledWith({
        customerId: 'cus_123', value: 42.5, orderId: 'order-1', description: 'Pedido order-1',
      });
      expect(result).toEqual({
        providerPaymentId: 'pay_pix_1',
        status: 'PENDING',
        paidSynchronously: false,
        pix: { qrCodeImage: 'img-base64', qrCodePayload: 'copia-e-cola', expiresAt: '2026-09-01T00:00:00Z' },
      });
      expect(createCardCharge).not.toHaveBeenCalled();
    });
  });

  describe('createCharge — branch cartão', () => {
    const cardExtra = {
      remoteIp: '1.2.3.4',
      card: { holderName: 'Fulano', number: '4111111111111111', expiryMonth: '12', expiryYear: '2030', ccv: '123' },
      holder: { name: 'Fulano', email: 'fulano@example.com', cpfCnpj: '12345678900', postalCode: '01001000', addressNumber: '10', phone: '11999999999' },
    };

    it('delega para ensureAsaasCustomer + createCardCharge repassando TODOS os campos do card sem dropar/renomear, e mapeia paidSynchronously=true em CONFIRMED', async () => {
      ensureAsaasCustomer.mockResolvedValue('cus_456');
      createCardCharge.mockResolvedValue({ paymentId: 'pay_card_1', status: 'CONFIRMED' });

      const result = await new AsaasProvider().createCharge({
        orderId: 'order-2',
        buyerUserId: 'user-2',
        value: 100,
        method: 'credit_card',
        card: cardExtra,
      });

      expect(ensureAsaasCustomer).toHaveBeenCalledWith('user-2');
      expect(createCardCharge).toHaveBeenCalledWith({
        customerId: 'cus_456', value: 100, orderId: 'order-2', ...cardExtra,
      });
      // campos do spread individualmente — nada foi dropado/renomeado no repasse
      const forwarded = createCardCharge.mock.calls[0][0];
      expect(forwarded.holder).toEqual(cardExtra.holder);
      expect(forwarded.remoteIp).toBe(cardExtra.remoteIp);
      expect(forwarded.card).toEqual(cardExtra.card);
      expect(result).toEqual({ providerPaymentId: 'pay_card_1', status: 'CONFIRMED', paidSynchronously: true });
      expect(createPixCharge).not.toHaveBeenCalled();
    });

    it('mapeia paidSynchronously=true também para RECEIVED', async () => {
      ensureAsaasCustomer.mockResolvedValue('cus_456');
      createCardCharge.mockResolvedValue({ paymentId: 'pay_card_2', status: 'RECEIVED' });

      const result = await new AsaasProvider().createCharge({
        orderId: 'order-3', buyerUserId: 'user-2', value: 20, method: 'credit_card', card: cardExtra,
      });

      expect(result.paidSynchronously).toBe(true);
    });

    it('mapeia paidSynchronously=false quando o status do Asaas não é CONFIRMED/RECEIVED', async () => {
      ensureAsaasCustomer.mockResolvedValue('cus_456');
      createCardCharge.mockResolvedValue({ paymentId: 'pay_card_3', status: 'PENDING' });

      const result = await new AsaasProvider().createCharge({
        orderId: 'order-4', buyerUserId: 'user-2', value: 20, method: 'credit_card', card: cardExtra,
      });

      expect(result).toEqual({ providerPaymentId: 'pay_card_3', status: 'PENDING', paidSynchronously: false });
    });
  });
});
