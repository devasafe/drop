/** Fase C2 — Task 34. Modo direto: cupom do DROP recusado já na validação; loja pausada = "indisponível". */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@c2direto.test';
const PREFIX = 'C2T34';
const ORIGINAL_KYC = process.env.KYC_ENFORCED;
let restore: () => Promise<void>;
beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => {
  await restore();
  if (ORIGINAL_KYC === undefined) delete process.env.KYC_ENFORCED; else process.env.KYC_ENFORCED = ORIGINAL_KYC;
  await prisma.$disconnect();
});
beforeEach(async () => { process.env.KYC_ENFORCED = 'true'; await updatePlatformConfig({ settlementMode: 'direto' } as any, 'test'); });
afterEach(async () => {
  await prisma.coupon.deleteMany({ where: { code: { startsWith: PREFIX } } });
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  await prisma.storeSaasBilling.deleteMany({ where: { storeId: { in: stores.map((s) => s.id) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function loja(billing?: Record<string, unknown>) {
  const dono = await createTestUser('lojista', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Eletro T34', neighborhood: 'Pinheiros', city: 'São Paulo', isOpen: true, isVerified: true } as any });
  if (billing) await prisma.storeSaasBilling.create({ data: { storeId: store.id, trialEndsAt: new Date(Date.now() - 30 * 86400000), ...billing } as any });
  return store;
}
async function cupom(type: 'global' | 'store', storeId?: string) {
  const code = `${PREFIX}${type.toUpperCase()}${Date.now()}`;
  await prisma.coupon.create({ data: { code, type, discountType: 'fixed', discountValue: 10, storeId: storeId ?? null, validFrom: new Date(Date.now() - 86400000), validUntil: new Date(Date.now() + 86400000), createdBy: 'test' } as any });
  return code;
}

it('modo direto: cupom do DROP é recusado já ao validar, com o motivo', async () => {
  const store = await loja();
  const cliente = await createTestUser('cliente', DOMAIN);
  const code = await cupom('global');
  const r = await request(app).post('/api/coupons/validate').set('Authorization', bearer(cliente)).send({ code, storeId: store.id, orderValue: 100 });
  expect(r.status).toBe(400);
  expect(r.body).toEqual({ error: 'Cupons do DROP não valem nesta compra; cupons da loja sim.', code: 'COUPON_NOT_ALLOWED' });
});

it('modo direto: cupom da própria loja continua valendo; custódia aceita o do DROP', async () => {
  const store = await loja();
  const cliente = await createTestUser('cliente', DOMAIN);
  const daLoja = await cupom('store', store.id);
  expect((await request(app).post('/api/coupons/validate').set('Authorization', bearer(cliente)).send({ code: daLoja, storeId: store.id, orderValue: 100 })).status).toBe(200);
  await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');
  const global = await cupom('global');
  expect((await request(app).post('/api/coupons/validate').set('Authorization', bearer(cliente)).send({ code: global, storeId: store.id, orderValue: 100 })).status).toBe(200);
});

it('loja pausada pela mensalidade: 404 "indisponível" com o resumo público, sem o motivo', async () => {
  const store = await loja({ status: 'paused', pausedAt: new Date() });
  const r = await request(app).get(`/api/stores/${store.id}`);
  expect(r.status).toBe(404);
  expect(r.body).toEqual({ error: 'Store not found', code: 'STORE_UNAVAILABLE', store: { _id: store.id, id: store.id, name: 'Eletro T34', neighborhood: 'Pinheiros', city: 'São Paulo' } });
  expect(JSON.stringify(r.body)).not.toMatch(/paused|billing|mensalidade/i);
});

it('loja que não existe: o 404 de sempre, sem code', async () => {
  const r = await request(app).get('/api/stores/nao-existe-t34');
  expect(r.status).toBe(404);
  expect(r.body.code).toBeUndefined();
});
