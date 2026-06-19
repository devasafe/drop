import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

jest.mock('../services/asaas/client', () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn() },
}));

import asaasClient from '../services/asaas/client';
import Store from '../models/Store';
import User from '../models/User';
import Payout from '../models/Payout';
import { releaseOrderViaAsaas } from '../services/asaas/release';

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

describe('releaseOrderViaAsaas (Fase 3)', () => {
  it('transfere p/ subcontas e marca os Payouts como released', async () => {
    post.mockResolvedValue({ id: 'tr_1', status: 'PENDING' });

    const orderId = new mongoose.Types.ObjectId();
    const store = await Store.create({ ownerId: new mongoose.Types.ObjectId(), name: 'Loja', asaas: { status: 'active', walletId: 'wlt_store' } });
    const motoboy = await User.create({
      name: 'Moto', email: `m-${Date.now()}@t.com`, passwordHash: 'x', role: 'motoboy', roles: ['motoboy'], activeRole: 'motoboy',
      asaas: { status: 'active', walletId: 'wlt_moto' },
    });

    await Payout.create({ recipientType: 'store', recipientId: store._id, orderId, amount: 90, status: 'pending' });
    await Payout.create({ recipientType: 'motoboy', recipientId: motoboy._id, orderId, amount: 8, status: 'pending' });

    await releaseOrderViaAsaas(String(orderId));

    expect(post).toHaveBeenCalledTimes(2);
    // valores transferidos corretos
    const valores = post.mock.calls.map((c) => c[1].value).sort();
    expect(valores).toEqual([8, 90]);
    // walletIds usados
    const wallets = post.mock.calls.map((c) => c[1].walletId).sort();
    expect(wallets).toEqual(['wlt_moto', 'wlt_store']);

    const payouts = await Payout.find({ orderId });
    expect(payouts.every((p) => p.status === 'released')).toBe(true);
    expect(payouts.every((p) => p.gatewayProvider === 'asaas' && p.gatewayTransferId === 'tr_1')).toBe(true);
  });

  it('recebedor sem subconta → Payout segue pending, sem transferir', async () => {
    const orderId = new mongoose.Types.ObjectId();
    const store = await Store.create({ ownerId: new mongoose.Types.ObjectId(), name: 'Loja sem subconta' }); // sem asaas.walletId
    await Payout.create({ recipientType: 'store', recipientId: store._id, orderId, amount: 50, status: 'pending' });

    await releaseOrderViaAsaas(String(orderId));

    expect(post).not.toHaveBeenCalled();
    const payout = await Payout.findOne({ orderId });
    expect(payout!.status).toBe('pending');
  });

  it('é idempotente — payout já released não é transferido de novo', async () => {
    post.mockResolvedValue({ id: 'tr_2', status: 'PENDING' });
    const orderId = new mongoose.Types.ObjectId();
    const store = await Store.create({ ownerId: new mongoose.Types.ObjectId(), name: 'Loja', asaas: { status: 'active', walletId: 'wlt_store' } });
    await Payout.create({ recipientType: 'store', recipientId: store._id, orderId, amount: 90, status: 'released' });

    await releaseOrderViaAsaas(String(orderId));
    expect(post).not.toHaveBeenCalled();
  });
});
