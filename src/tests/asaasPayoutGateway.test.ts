
jest.mock('../services/asaas/client', () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn(), postAs: jest.fn(), getAs: jest.fn() },
}));

import asaasClient from '../services/asaas/client';
import { fakeObjectId } from './helpers/ids';
import { AsaasGateway } from '../services/payoutGateway/asaasGateway';

import { createPayout } from './helpers/financePg';
import { encryptSensitiveData } from '../utils/encryption';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { ownerIdForStore } from './helpers/storeOwner';

const postAs = (asaasClient as any).postAs as jest.Mock;
const getAs = (asaasClient as any).getAs as jest.Mock;

afterAll(async () => {
});
afterEach(async () => {
  await cleanupUsersByEmailDomain('@apg.test');
  postAs.mockReset();
  getAs.mockReset();
});

describe('AsaasGateway.transfer (Fase 4 — saque)', () => {
  it('saca via PIX usando a apiKey da subconta e a chave PIX do recebedor', async () => {
    postAs.mockResolvedValue({ id: 'tr_saque', status: 'DONE' });

    const store = await prisma.store.create({ data: {
      ownerId: await ownerIdForStore('@apg.test'),
      name: 'Loja',
      asaas: {
        status: 'active',
        walletId: 'wlt_store',
        apiKeyEncrypted: encryptSensitiveData('$aact_sub_loja'),
        pixKey: 'loja@pix.com',
        pixKeyType: 'EMAIL',
      },
    } });
    const payout = await createPayout({
      recipientType: 'store', recipientId: store.id, orderId: fakeObjectId(), amount: 90, status: 'released',
    });

    const gw = new AsaasGateway();
    const result = await gw.transfer({ payoutIds: [String(payout._id)], bankInfo: {} as any, amount: 90, recipientName: 'Loja' });

    expect(result.status).toBe('paid');
    expect(result.gatewayTransferId).toBe('tr_saque');
    // chamou COM a apiKey decifrada da subconta e os dados de PIX corretos
    expect(postAs).toHaveBeenCalledTimes(1);
    const [usedKey, path, body] = postAs.mock.calls[0];
    expect(usedKey).toBe('$aact_sub_loja');
    expect(path).toBe('/transfers');
    expect(body).toEqual({ value: 90, operationType: 'PIX', pixAddressKey: 'loja@pix.com', pixAddressKeyType: 'EMAIL' });
  });

  it('falha (sem chave PIX) → status failed e não chama o gateway', async () => {
    const store = await prisma.store.create({ data: {
      ownerId: await ownerIdForStore('@apg.test'),
      name: 'Loja sem pix',
      asaas: { status: 'active', walletId: 'w', apiKeyEncrypted: encryptSensitiveData('$aact_x') },
    } });
    const payout = await createPayout({
      recipientType: 'store', recipientId: store.id, orderId: fakeObjectId(), amount: 50, status: 'released',
    });

    const gw = new AsaasGateway();
    const result = await gw.transfer({ payoutIds: [String(payout._id)], bankInfo: {} as any, amount: 50, recipientName: 'Loja' });

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toMatch(/PIX/i);
    expect(postAs).not.toHaveBeenCalled();
  });

  it('limita o saque ao saldo REAL da subconta (diferença de centavos não trava)', async () => {
    getAs.mockResolvedValue({ balance: 15.0 }); // subconta tem R$15,00
    postAs.mockResolvedValue({ id: 'tr_cap', status: 'DONE' });

    const store = await prisma.store.create({ data: {
      ownerId: await ownerIdForStore('@apg.test'),
      name: 'Loja',
      asaas: { status: 'active', walletId: 'w', apiKeyEncrypted: encryptSensitiveData('$k'), pixKey: 'l@x.com', pixKeyType: 'EMAIL' },
    } });
    const payout = await createPayout({
      recipientType: 'store', recipientId: store.id, orderId: fakeObjectId(), amount: 15.01, status: 'released',
    });

    const gw = new AsaasGateway();
    const result = await gw.transfer({ payoutIds: [String(payout._id)], bankInfo: {} as any, amount: 15.01, recipientName: 'Loja' });

    expect(result.status).toBe('paid');
    // transferiu R$15,00 (saldo real), não R$15,01 (espelho)
    expect(postAs.mock.calls[0][2]).toEqual({ value: 15.0, operationType: 'PIX', pixAddressKey: 'l@x.com', pixAddressKeyType: 'EMAIL' });
  });

  it('subconta zerada → falha clara, sem chamar o gateway', async () => {
    getAs.mockResolvedValue({ balance: 0 });
    const store = await prisma.store.create({ data: {
      ownerId: await ownerIdForStore('@apg.test'),
      name: 'Loja',
      asaas: { status: 'active', walletId: 'w', apiKeyEncrypted: encryptSensitiveData('$k'), pixKey: 'l@x.com', pixKeyType: 'EMAIL' },
    } });
    const payout = await createPayout({
      recipientType: 'store', recipientId: store.id, orderId: fakeObjectId(), amount: 10, status: 'released',
    });

    const gw = new AsaasGateway();
    const result = await gw.transfer({ payoutIds: [String(payout._id)], bankInfo: {} as any, amount: 10, recipientName: 'Loja' });

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toMatch(/sem saldo/i);
    expect(postAs).not.toHaveBeenCalled();
  });
});
