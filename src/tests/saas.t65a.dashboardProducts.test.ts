/**
 * B5 — o painel do lojista não depende da vitrine pública: GET /stores/dashboard devolve
 * os produtos do dono, inclusive quando a loja está pausada (sumiu de GET /products).
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@saas65a.test';
let restore: () => Promise<void>;

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); });
beforeEach(async () => {
  await updatePlatformConfig({ settlementMode: 'direto' } as any, 'test');
});
afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });

describe('t65a — dashboard do lojista traz os produtos (loja pausada inclusive)', () => {
  it('loja pausada: some da vitrine mas o dono vê os produtos na dashboard', async () => {
    const dono = await createTestUser('lojista', DOMAIN);
    const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja t65a', isOpen: true, isVerified: true } });
    await prisma.storeSaasBilling.create({ data: { storeId: store.id, status: 'paused', pausedAt: new Date(), trialEndsAt: new Date(Date.now() - 30 * 86400000) } as any });
    const prod = await prisma.product.create({ data: { storeId: store.id, name: 'Prod t65a', price: 12.5, quantity: 3 } as any });

    const pub = await request(app).get('/api/products');
    expect((pub.body.products || []).some((p: any) => p._id === prod.id)).toBe(false);

    const res = await request(app).get('/api/stores/dashboard').set('Authorization', bearer(dono));
    expect(res.status).toBe(200);
    expect(res.body.store._id).toBe(store.id);
    expect(Array.isArray(res.body.products)).toBe(true);
    const found = res.body.products.find((p: any) => p._id === prod.id);
    expect(found).toBeTruthy();
    expect(found.price).toBe(12.5);
    expect(found.storeId).toBe(store.id);
  });
});
