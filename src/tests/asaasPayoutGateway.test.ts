import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

jest.mock('../services/asaas/client', () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn(), postAs: jest.fn(), getAs: jest.fn() },
}));

import asaasClient from '../services/asaas/client';
import { AsaasGateway } from '../services/payoutGateway/asaasGateway';
import Store from '../models/Store';
import Payout from '../models/Payout';
import { encryptSensitiveData } from '../utils/encryption';

const postAs = (asaasClient as any).postAs as jest.Mock;
let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
afterEach(async () => {
  for (const key in mongoose.connection.collections) {
    await mongoose.connection.collections[key].deleteMany({});
  }
  postAs.mockReset();
});

describe('AsaasGateway.transfer (Fase 4 — saque)', () => {
  it('saca via PIX usando a apiKey da subconta e a chave PIX do recebedor', async () => {
    postAs.mockResolvedValue({ id: 'tr_saque', status: 'DONE' });

    const store = await Store.create({
      ownerId: new mongoose.Types.ObjectId(),
      name: 'Loja',
      asaas: {
        status: 'active',
        walletId: 'wlt_store',
        apiKeyEncrypted: encryptSensitiveData('$aact_sub_loja'),
        pixKey: 'loja@pix.com',
        pixKeyType: 'EMAIL',
      },
    });
    const payout = await Payout.create({
      recipientType: 'store', recipientId: store._id, orderId: new mongoose.Types.ObjectId(), amount: 90, status: 'released',
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
    expect(body).toEqual({ value: 90, operationType: 'PIX', pixAddressKey: 'loja@pix.com' });
  });

  it('falha (sem chave PIX) → status failed e não chama o gateway', async () => {
    const store = await Store.create({
      ownerId: new mongoose.Types.ObjectId(),
      name: 'Loja sem pix',
      asaas: { status: 'active', walletId: 'w', apiKeyEncrypted: encryptSensitiveData('$aact_x') },
    });
    const payout = await Payout.create({
      recipientType: 'store', recipientId: store._id, orderId: new mongoose.Types.ObjectId(), amount: 50, status: 'released',
    });

    const gw = new AsaasGateway();
    const result = await gw.transfer({ payoutIds: [String(payout._id)], bankInfo: {} as any, amount: 50, recipientName: 'Loja' });

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toMatch(/PIX/i);
    expect(postAs).not.toHaveBeenCalled();
  });
});
