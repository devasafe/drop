import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

jest.mock('../services/asaas/client', () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn(), postAs: jest.fn(), getAs: jest.fn() },
}));

import asaasClient from '../services/asaas/client';
import { releaseSinglePayoutViaAsaas } from '../services/asaas/release';
import Store from '../models/Store';
import User from '../models/User';
import Payout from '../models/Payout';

const post = (asaasClient as any).post as jest.Mock;
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
  post.mockReset();
});

describe('releaseSinglePayoutViaAsaas (liberação granular)', () => {
  it('libera SÓ o payout da loja, mantendo o do motoboy pendente', async () => {
    post.mockResolvedValue({ id: 'tr_loja', status: 'DONE' });

    const orderId = new mongoose.Types.ObjectId();
    const store = await Store.create({
      ownerId: new mongoose.Types.ObjectId(),
      name: 'Loja',
      asaas: { status: 'active', walletId: 'wlt_loja' },
    });
    const motoboy = await User.create({
      name: 'Moto', email: 'm@x.com', passwordHash: 'x', role: 'motoboy',
      asaas: { status: 'active', walletId: 'wlt_moto' },
    } as any);

    const storePayout = await Payout.create({
      recipientType: 'store', recipientId: store._id, orderId, amount: 70, status: 'pending',
    });
    const motoboyPayout = await Payout.create({
      recipientType: 'motoboy', recipientId: motoboy._id, orderId, amount: 20, status: 'pending',
    });

    await releaseSinglePayoutViaAsaas(String(storePayout._id));

    const storeAfter = await Payout.findById(storePayout._id);
    const motoboyAfter = await Payout.findById(motoboyPayout._id);

    expect(storeAfter?.status).toBe('released');
    expect(motoboyAfter?.status).toBe('pending'); // NÃO foi liberado junto
    expect(post).toHaveBeenCalledTimes(1); // só uma transferência (a da loja)
    expect(post.mock.calls[0][0]).toBe('/transfers');
    expect(post.mock.calls[0][1]).toEqual({ value: 70, walletId: 'wlt_loja' });
  });

  it('relança erro quando o recebedor não tem subconta (admin vê a falha)', async () => {
    const orderId = new mongoose.Types.ObjectId();
    const store = await Store.create({
      ownerId: new mongoose.Types.ObjectId(),
      name: 'Loja sem subconta',
      asaas: { status: 'none' }, // sem walletId
    });
    const payout = await Payout.create({
      recipientType: 'store', recipientId: store._id, orderId, amount: 50, status: 'pending',
    });

    await expect(releaseSinglePayoutViaAsaas(String(payout._id))).rejects.toThrow();
    const after = await Payout.findById(payout._id);
    expect(after?.status).toBe('pending');
    expect(post).not.toHaveBeenCalled();
  });
});
