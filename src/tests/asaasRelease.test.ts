
jest.mock('../services/asaas/client', () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn() },
}));

import asaasClient from '../services/asaas/client';
import { fakeObjectId } from './helpers/ids';

import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createPayout, findPayout, findPayouts } from './helpers/financePg';
import { releaseOrderViaAsaas } from '../services/asaas/release';
import { ownerIdForStore } from './helpers/storeOwner';

const post = (asaasClient as any).post as jest.Mock;

afterAll(async () => {
});
afterEach(async () => {
  await cleanupUsersByEmailDomain('@arel.test');
  post.mockReset();
});

describe('releaseOrderViaAsaas (Fase 3)', () => {
  it('transfere p/ subcontas e marca os Payouts como released', async () => {
    post.mockResolvedValue({ id: 'tr_1', status: 'PENDING' });

    const orderId = fakeObjectId();
    const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore('@arel.test'), name: 'Loja', asaas: { status: 'active', walletId: 'wlt_store' } } });
    const motoboy = await prisma.user.create({ data: {
      name: 'Moto', email: `m-${Date.now()}@arel.test`, passwordHash: 'x', role: 'motoboy', roles: ['motoboy'], activeRole: 'motoboy',
      asaas: { status: 'active', walletId: 'wlt_moto' },
    } });

    await createPayout({ recipientType: 'store', recipientId: store.id, orderId, amount: 90, status: 'pending' });
    await createPayout({ recipientType: 'motoboy', recipientId: motoboy.id, orderId, amount: 8, status: 'pending' });

    await releaseOrderViaAsaas(String(orderId));

    expect(post).toHaveBeenCalledTimes(2);
    // valores transferidos corretos
    const valores = post.mock.calls.map((c) => c[1].value).sort();
    expect(valores).toEqual([8, 90]);
    // walletIds usados
    const wallets = post.mock.calls.map((c) => c[1].walletId).sort();
    expect(wallets).toEqual(['wlt_moto', 'wlt_store']);

    const payouts = await findPayouts({ orderId });
    expect(payouts.every((p) => p.status === 'released')).toBe(true);
    expect(payouts.every((p) => p.gatewayProvider === 'asaas' && p.gatewayTransferId === 'tr_1')).toBe(true);
  });

  it('recebedor sem subconta → Payout segue pending, sem transferir', async () => {
    const orderId = fakeObjectId();
    const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore('@arel.test'), name: 'Loja sem subconta' } }); // sem asaas.walletId
    await createPayout({ recipientType: 'store', recipientId: store.id, orderId, amount: 50, status: 'pending' });

    await releaseOrderViaAsaas(String(orderId));

    expect(post).not.toHaveBeenCalled();
    const payout = await findPayout({ orderId });
    expect(payout!.status).toBe('pending');
  });

  it('é idempotente — payout já released não é transferido de novo', async () => {
    post.mockResolvedValue({ id: 'tr_2', status: 'PENDING' });
    const orderId = fakeObjectId();
    const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore('@arel.test'), name: 'Loja', asaas: { status: 'active', walletId: 'wlt_store' } } });
    await createPayout({ recipientType: 'store', recipientId: store.id, orderId, amount: 90, status: 'released' });

    await releaseOrderViaAsaas(String(orderId));
    expect(post).not.toHaveBeenCalled();
  });
});
