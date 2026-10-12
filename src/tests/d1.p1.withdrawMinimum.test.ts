import request from 'supertest';
import app from '../app';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import * as socketEmitter from '../utils/socketEmitter';

const DOMAIN = '@d1minsaque.test';
const ORDER_PREFIX = 'ord_d1min_';
const ORIGINAL_OUT = env.PAYOUT_GATEWAY;
let restore: () => Promise<void>;
let seq = 0;

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); (env as any).PAYOUT_GATEWAY = ORIGINAL_OUT; });
beforeEach(async () => {
  (env as any).PAYOUT_GATEWAY = 'manual';
  await updatePlatformConfig({ settlementMode: 'custodia', autoApproveWithdrawals: false, storeMinimumWithdraw: 10, motoboyMinimumWithdraw: 10 } as any, 'test');
  jest.spyOn(socketEmitter, 'emitAdminNotification').mockImplementation(() => {});
});
afterEach(async () => {
  jest.restoreAllMocks();
  await prisma.payout.deleteMany({ where: { orderId: { startsWith: ORDER_PREFIX } } });
  await prisma.withdrawalRequest.deleteMany({ where: { motoboyEmail: { endsWith: DOMAIN } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

const released = (recipientType: 'store' | 'motoboy', recipientId: string, amount: number) =>
  prisma.payout.create({ data: { recipientType, recipientId, orderId: `${ORDER_PREFIX}${seq++}`, amount, status: 'released', releasedAt: new Date() } });

async function loja(): Promise<{ owner: TestUser; storeId: string }> {
  const owner = await createTestUser('lojista', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: owner.userId, name: 'Loja Saque', isOpen: true } as any });
  return { owner, storeId: store.id };
}
const sacarLoja = (owner: TestUser, storeId: string, amount: number | 'all') =>
  request(app).post('/api/withdrawals/request').set('Authorization', bearer(owner)).send({ amount, storeId });
const sacarMotoboy = (m: TestUser, amount: number | 'all') =>
  request(app).post('/api/withdrawals/request').set('Authorization', bearer(m)).send({ amount });
const wrCount = (recipientId: string) => prisma.withdrawalRequest.count({ where: { motoboyId: recipientId } });

describe('saque mínimo da loja', () => {
  it('"sacar tudo" com R$ 8 disponíveis: 400 BELOW_MINIMUM_WITHDRAW e nada muda', async () => {
    const { owner, storeId } = await loja();
    const p = await released('store', storeId, 8);
    const res = await sacarLoja(owner, storeId, 'all');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BELOW_MINIMUM_WITHDRAW');
    expect(res.body.error).toBe('O saque mínimo é R$ 10,00');
    expect(res.body.minimum).toBe(10);
    expect(await wrCount(storeId)).toBe(0);
    expect((await prisma.payout.findUnique({ where: { id: p.id } }))?.status).toBe('released');
  });

  it('R$ 9,99 com R$ 30 disponíveis: 400', async () => {
    const { owner, storeId } = await loja();
    await released('store', storeId, 30);
    const res = await sacarLoja(owner, storeId, 9.99);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BELOW_MINIMUM_WITHDRAW');
    expect(await wrCount(storeId)).toBe(0);
  });

  it('exatamente R$ 10: 200 e o saque é criado com R$ 10', async () => {
    const { owner, storeId } = await loja();
    await released('store', storeId, 30);
    const res = await sacarLoja(owner, storeId, 10);
    expect(res.status).toBe(200);
    const wr = await prisma.withdrawalRequest.findFirst({ where: { motoboyId: storeId } });
    expect(Number(wr?.amount)).toBe(10);
  });

  it('o mínimo vem do PlatformConfig (R$ 25 configurado)', async () => {
    await updatePlatformConfig({ storeMinimumWithdraw: 25 } as any, 'test');
    const { owner, storeId } = await loja();
    await released('store', storeId, 30);
    const res = await sacarLoja(owner, storeId, 20);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('O saque mínimo é R$ 25,00');
  });

  it('valor que não é número: 400 e nenhum saque', async () => {
    const { owner, storeId } = await loja();
    await released('store', storeId, 30);
    const res = await request(app).post('/api/withdrawals/request').set('Authorization', bearer(owner)).send({ amount: 'abc', storeId });
    expect(res.status).toBe(400);
    expect(await wrCount(storeId)).toBe(0);
  });
});

describe('saque mínimo do motoboy (antes era ignorado)', () => {
  it('"sacar tudo" com R$ 9,99: 400 BELOW_MINIMUM_WITHDRAW', async () => {
    const m = await createTestUser('motoboy', DOMAIN);
    await released('motoboy', m.userId, 9.99);
    const res = await sacarMotoboy(m, 'all');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BELOW_MINIMUM_WITHDRAW');
    expect(await wrCount(m.userId)).toBe(0);
  });

  it('com mínimo do motoboy em R$ 5, os mesmos R$ 9,99 saem', async () => {
    await updatePlatformConfig({ motoboyMinimumWithdraw: 5 } as any, 'test');
    const m = await createTestUser('motoboy', DOMAIN);
    await released('motoboy', m.userId, 9.99);
    const res = await sacarMotoboy(m, 'all');
    expect(res.status).toBe(200);
    expect(await wrCount(m.userId)).toBe(1);
  });
});

describe('GET /api/settings/platform-config (D14)', () => {
  it('expõe os dois mínimos de saque', async () => {
    await updatePlatformConfig({ storeMinimumWithdraw: 12, motoboyMinimumWithdraw: 7 } as any, 'test');
    const res = await request(app).get('/api/settings/platform-config');
    expect(res.status).toBe(200);
    expect(res.body.storeMinimumWithdraw).toBe(12);
    expect(res.body.motoboyMinimumWithdraw).toBe(7);
  });
});
