
jest.mock('../services/asaas/client', () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn(), postAs: jest.fn(), getAs: jest.fn() },
}));

import asaasClient from '../services/asaas/client';
import { fakeObjectId } from './helpers/ids';
import { releasePayoutAsAdmin } from '../services/payoutRelease.service';

import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createPayout, findPayoutById } from './helpers/financePg';
import { ownerIdForStore } from './helpers/storeOwner';
import { createTestUser } from './helpers/authUser';

const post = (asaasClient as any).post as jest.Mock;

afterAll(async () => {
});
afterEach(async () => {
  await cleanupUsersByEmailDomain('@arels.test');
  post.mockReset();
});

// D3b-3: releaseSinglePayoutViaAsaas saiu; a liberação granular do admin é releasePayoutAsAdmin
// (mesmas garantias + reivindicação e linha de registro).
describe('releasePayoutAsAdmin (liberação granular)', () => {
  it('libera SÓ o payout da loja, mantendo o do motoboy pendente', async () => {
    post.mockResolvedValue({ id: 'tr_loja', status: 'DONE' });
    const ceo = await createTestUser('ceo', '@arels.test');

    const orderId = fakeObjectId();
    const store = await prisma.store.create({ data: {
      ownerId: await ownerIdForStore('@arels.test'),
      name: 'Loja',
      asaas: { status: 'active', walletId: 'wlt_loja' },
    } });
    const motoboy = await prisma.user.create({ data: {
      name: 'Moto', email: `m-${Date.now()}-${Math.random().toString(36).slice(2)}@arels.test`, passwordHash: 'x', role: 'motoboy',
      asaas: { status: 'active', walletId: 'wlt_moto' },
    } } as any);

    const storePayout = await createPayout({
      recipientType: 'store', recipientId: store.id, orderId, amount: 70, status: 'pending',
    });
    const motoboyPayout = await createPayout({
      recipientType: 'motoboy', recipientId: motoboy.id, orderId, amount: 20, status: 'pending',
    });

    await releasePayoutAsAdmin(String(storePayout._id), { id: ceo.userId, role: 'ceo' }, true);

    const storeAfter = await findPayoutById(storePayout._id);
    const motoboyAfter = await findPayoutById(motoboyPayout._id);

    expect(storeAfter?.status).toBe('released');
    expect(motoboyAfter?.status).toBe('pending'); // NÃO foi liberado junto
    expect(post).toHaveBeenCalledTimes(1); // só uma transferência (a da loja)
    expect(post.mock.calls[0][0]).toBe('/transfers');
    expect(post.mock.calls[0][1]).toEqual({ value: 70, walletId: 'wlt_loja' });
    expect(await prisma.adminMoneyAction.count({ where: { targetId: String(storePayout._id), type: 'payout_release' } })).toBe(1);
  });

  it('relança erro quando o recebedor não tem subconta (admin vê a falha)', async () => {
    const ceo = await createTestUser('ceo', '@arels.test');
    const orderId = fakeObjectId();
    const store = await prisma.store.create({ data: {
      ownerId: await ownerIdForStore('@arels.test'),
      name: 'Loja sem subconta',
      asaas: { status: 'none' }, // sem walletId
    } });
    const payout = await createPayout({
      recipientType: 'store', recipientId: store.id, orderId, amount: 50, status: 'pending',
    });

    await expect(releasePayoutAsAdmin(String(payout._id), { id: ceo.userId, role: 'ceo' }, true)).rejects.toMatchObject({ code: 'PAYOUT_TRANSFER_REFUSED' });
    const after = await findPayoutById(payout._id);
    expect(after?.status).toBe('pending');
    expect(post).not.toHaveBeenCalled();
  });
});
