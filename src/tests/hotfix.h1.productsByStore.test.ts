/**
 * H1 — GET /products aceita `storeId` (página da loja via todos os produtos dela, não só os
 * 20 primeiros do app) e tem ordem estável (createdAt desc, id desc). O filtro por loja não
 * fura o gate de KYC nem o de mensalidade (modo direto).
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser } from './helpers/authUser';

const DOMAIN = '@hotfixh1.test';
let restore: () => Promise<void>;
const kycOriginal = process.env.KYC_ENFORCED;

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); });
beforeEach(async () => { await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test'); });
afterEach(async () => {
  if (kycOriginal === undefined) delete process.env.KYC_ENFORCED;
  else process.env.KYC_ENFORCED = kycOriginal;
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function loja(opts: { verified?: boolean; produtos?: number } = {}) {
  const dono = await createTestUser('lojista', DOMAIN);
  const store = await prisma.store.create({
    data: { ownerId: dono.userId, name: 'Loja h1', isOpen: true, isVerified: opts.verified !== false, plan: 2 } as any,
  });
  const n = opts.produtos ?? 1;
  for (let i = 0; i < n; i++) {
    await prisma.product.create({ data: { storeId: store.id, name: `Prod h1 ${i}`, price: 10, quantity: 5 } as any });
  }
  return { dono, store };
}

describe('H1 — GET /products por loja e com ordem estável', () => {
  it('loja com 25 produtos: ?storeId=X&limit=100 devolve os 25 (e só dela)', async () => {
    const outra = await loja({ produtos: 3 });
    const { store } = await loja({ produtos: 25 });
    const res = await request(app).get(`/api/products?storeId=${store.id}&limit=100`);
    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(25);
    expect(res.body.products.every((p: any) => p.storeId === store.id)).toBe(true);
    expect(res.body.pagination.total).toBe(25);
    expect(res.body.products.some((p: any) => p.storeId === outra.store.id)).toBe(false);
  });

  it('sem storeId a ordem é createdAt desc (mais novo primeiro)', async () => {
    const { store } = await loja({ produtos: 0 });
    const base = Date.now() + 365 * 86400000; // no futuro: ficam no topo da listagem
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const p = await prisma.product.create({
        data: { storeId: store.id, name: `Ordem ${i}`, price: 10, quantity: 1, createdAt: new Date(base + i * 1000) } as any,
      });
      ids.push(p.id);
    }
    const res = await request(app).get('/api/products?limit=100');
    expect(res.status).toBe(200);
    const lista = res.body.products as any[];
    expect(lista.slice(0, 3).map((p) => p._id)).toEqual([ids[2], ids[1], ids[0]]);
    for (let i = 1; i < lista.length; i++) {
      expect(new Date(lista[i - 1].createdAt).getTime()).toBeGreaterThanOrEqual(new Date(lista[i].createdAt).getTime());
    }
  });

  it('modo direto: storeId de loja pausada não vaza produtos', async () => {
    await updatePlatformConfig({ settlementMode: 'direto' } as any, 'test');
    const { store } = await loja({ produtos: 2 });
    await prisma.storeSaasBilling.create({
      data: { storeId: store.id, trialEndsAt: new Date(Date.now() - 30 * 86400000), status: 'paused', pausedAt: new Date() } as any,
    });
    const res = await request(app).get(`/api/products?storeId=${store.id}&limit=100`);
    expect(res.status).toBe(200);
    expect(res.body.products).toEqual([]);
  });

  it('KYC_ENFORCED: storeId de loja não verificada não vaza produtos', async () => {
    process.env.KYC_ENFORCED = 'true';
    const { store } = await loja({ verified: false, produtos: 2 });
    const res = await request(app).get(`/api/products?storeId=${store.id}&limit=100`);
    expect(res.status).toBe(200);
    expect(res.body.products).toEqual([]);
  });

  it('KYC_ENFORCED: storeId de loja verificada lista os produtos', async () => {
    process.env.KYC_ENFORCED = 'true';
    const { store } = await loja({ produtos: 2 });
    const res = await request(app).get(`/api/products?storeId=${store.id}&limit=100`);
    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(2);
  });
});
