/**
 * Pré-deploy item 3 (Ruling R23) — no modo direto, o saldo antigo da carteira de repasse
 * (loja/motoboy: Payouts `released` da custódia) tem caminho de saque:
 * POST /wallets/{store/:storeId|motoboy/:motoboyId}/transfer-to-owner abre com
 * requireCustodyOrLeftover SÓ quando a carteira de origem tem saldo; o dinheiro vai para a
 * carteira `user`, que saca via /withdrawals/request-user. Nenhuma outra rota de custódia abre.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';

const DOMAIN = '@saas48.test';
const ORDER_PREFIX = 'ord_48_';
let restore: () => Promise<void>;
let seq = 0;

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); });
beforeEach(async () => { await updatePlatformConfig({ settlementMode: 'direto' } as any, 'test'); });
afterEach(async () => {
  await prisma.payout.deleteMany({ where: { orderId: { startsWith: ORDER_PREFIX } } });
  await prisma.withdrawalRequest.deleteMany({ where: { motoboyEmail: { endsWith: DOMAIN } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

const released = (recipientType: 'store' | 'motoboy', recipientId: string, amount: number) =>
  prisma.payout.create({ data: { recipientType, recipientId, orderId: `${ORDER_PREFIX}${seq++}`, amount, status: 'released', releasedAt: new Date() } });

const userBalance = async (userId: string) => {
  const w = await prisma.wallet.findUnique({ where: { owner_ownerType: { owner: userId, ownerType: 'user' } } });
  return w ? Number(w.balance) : 0;
};

async function lojistaWithStore(): Promise<{ owner: TestUser; storeId: string }> {
  const owner = await createTestUser('lojista', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: owner.userId, name: 'Loja 48', isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any });
  return { owner, storeId: store.id };
}

const BANK = { bankName: 'Banco', accountNumber: '123', ownerName: 'Fulano' };

describe('modo direto — motoboy → própria carteira user', () => {
  it('com saldo: 200, payouts viram paid, a carteira user recebe e saca via request-user', async () => {
    const m = await createTestUser('motoboy', DOMAIN);
    const p1 = await released('motoboy', m.userId, 12.5);
    const p2 = await released('motoboy', m.userId, 7.5);
    const r = await request(app).post(`/api/wallets/motoboy/${m.userId}/transfer-to-owner`).set('Authorization', bearer(m)).send({});
    expect(r.status).toBe(200);
    expect(r.body.transferred).toBe(20);
    expect(await userBalance(m.userId)).toBe(20);
    const after = await prisma.payout.findMany({ where: { id: { in: [p1.id, p2.id] } } });
    expect(after.every((p) => p.status === 'paid')).toBe(true);

    const w = await request(app).post('/api/withdrawals/request-user').set('Authorization', bearer(m)).send({ amount: 20, bankAccount: BANK });
    expect(w.status).toBe(200);
    expect(await userBalance(m.userId)).toBe(0);
  });

  it('sem saldo na carteira de origem → 404 FEATURE_DISABLED (mesmo com saldo na carteira user)', async () => {
    const m = await createTestUser('motoboy', DOMAIN);
    const r = await request(app).post(`/api/wallets/motoboy/${m.userId}/transfer-to-owner`).set('Authorization', bearer(m)).send({});
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('FEATURE_DISABLED');
    // Saldo só na carteira user (leftover): a origem continua vazia → 404.
    await prisma.wallet.create({ data: { owner: m.userId, ownerType: 'user', balance: 5 } });
    const r2 = await request(app).post(`/api/wallets/motoboy/${m.userId}/transfer-to-owner`).set('Authorization', bearer(m)).send({});
    expect(r2.status).toBe(404);
    expect(r2.body.code).toBe('FEATURE_DISABLED');
  });

  it('carteira de outro motoboy → 403 e nada se move', async () => {
    const m = await createTestUser('motoboy', DOMAIN);
    const other = await createTestUser('motoboy', DOMAIN);
    await released('motoboy', m.userId, 3); // o atacante tem leftover próprio (passa o gate)
    const victim = await released('motoboy', other.userId, 10);
    const r = await request(app).post(`/api/wallets/motoboy/${other.userId}/transfer-to-owner`).set('Authorization', bearer(m)).send({});
    expect(r.status).toBe(403);
    expect((await prisma.payout.findUnique({ where: { id: victim.id } }))!.status).toBe('released');
    expect(await userBalance(m.userId)).toBe(0);
  });

  it('duas transferências simultâneas: só uma credita (trava condicional no payout)', async () => {
    const m = await createTestUser('motoboy', DOMAIN);
    await released('motoboy', m.userId, 10);
    const call = () => request(app).post(`/api/wallets/motoboy/${m.userId}/transfer-to-owner`).set('Authorization', bearer(m)).send({});
    const rs = await Promise.all([call(), call(), call()]);
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await userBalance(m.userId)).toBe(10);
  });
});

describe('modo direto — loja → carteira user do dono', () => {
  it('com saldo: 200 e o dono recebe na carteira user', async () => {
    const { owner, storeId } = await lojistaWithStore();
    await released('store', storeId, 30);
    const r = await request(app).post(`/api/wallets/store/${storeId}/transfer-to-owner`).set('Authorization', bearer(owner)).send({});
    expect(r.status).toBe(200);
    expect(r.body.transferred).toBe(30);
    expect(await userBalance(owner.userId)).toBe(30);
  });

  it('sem saldo → 404', async () => {
    const { owner, storeId } = await lojistaWithStore();
    const r = await request(app).post(`/api/wallets/store/${storeId}/transfer-to-owner`).set('Authorization', bearer(owner)).send({});
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('FEATURE_DISABLED');
  });

  it('loja de outro dono → 403 e nada se move', async () => {
    const a = await lojistaWithStore();
    const b = await lojistaWithStore();
    await released('store', b.storeId, 5); // B tem leftover próprio (passa o gate)
    const victim = await released('store', a.storeId, 40);
    const r = await request(app).post(`/api/wallets/store/${a.storeId}/transfer-to-owner`).set('Authorization', bearer(b.owner)).send({});
    expect(r.status).toBe(403);
    expect((await prisma.payout.findUnique({ where: { id: victim.id } }))!.status).toBe('released');
    expect(await userBalance(b.owner.userId)).toBe(0);
  });
});

describe('modo direto — demais rotas de custódia continuam fechadas, mesmo com leftover', () => {
  it('recarga e transferências entre usuários → 404 FEATURE_DISABLED', async () => {
    const m = await createTestUser('motoboy', DOMAIN);
    const other = await createTestUser('cliente', DOMAIN);
    await released('motoboy', m.userId, 10);
    await prisma.wallet.create({ data: { owner: m.userId, ownerType: 'user', balance: 50 } });
    const calls = [
      request(app).post(`/api/wallets/${m.userId}/topup`).set('Authorization', bearer(m)).send({ amount: 10 }),
      request(app).post('/api/wallets/transfer').set('Authorization', bearer(m)).send({ toUserId: other.userId, amount: 5 }),
      request(app).post('/api/wallets/transfer-to-motoboy').set('Authorization', bearer(m)).send({ motoboyId: m.userId, amount: 5 }),
    ];
    for (const r of await Promise.all(calls)) {
      expect(r.status).toBe(404);
      expect(r.body.code).toBe('FEATURE_DISABLED');
    }
    expect(await userBalance(m.userId)).toBe(50);
  });
});

describe('modo custódia — comportamento antigo', () => {
  it('sem saldo → 400 (não 404)', async () => {
    await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');
    const m = await createTestUser('motoboy', DOMAIN);
    const r = await request(app).post(`/api/wallets/motoboy/${m.userId}/transfer-to-owner`).set('Authorization', bearer(m)).send({});
    expect(r.status).toBe(400);
  });
});
