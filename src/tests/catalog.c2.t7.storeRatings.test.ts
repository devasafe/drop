// src/tests/catalog.c2.t7.storeRatings.test.ts
/** Fase C2 — Task 7. Nota média da loja (≥ 3 avaliações) nas listas públicas e na loja. */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser } from './helpers/authUser';

const DOMAIN = '@c2rating.test';
const ORIGINAL_KYC = process.env.KYC_ENFORCED;
let restore: () => Promise<void>;
beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => {
  await restore();
  if (ORIGINAL_KYC === undefined) delete process.env.KYC_ENFORCED; else process.env.KYC_ENFORCED = ORIGINAL_KYC;
  await prisma.$disconnect();
});
beforeEach(async () => {
  process.env.KYC_ENFORCED = 'true';
  await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');
});
afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });

async function lojaComNotas(nome: string, notas: number[]) {
  const dono = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const store = await prisma.store.create({
    data: { ownerId: dono.userId, name: nome, isOpen: true, isVerified: true, latitude: '-23.5610', longitude: '-46.6560' } as any,
  });
  for (const n of notas) {
    await prisma.order.create({
      data: { customerId: cliente.userId, storeId: store.id, totalValue: 10, deliveryFee: 0, status: 'entregue', paymentMethod: 'pix', paymentStatus: 'paid', storeRating: n } as any,
    });
  }
  return store;
}

it('3 ou mais notas: média com uma casa e contagem, na loja e nas listas', async () => {
  const s = await lojaComNotas(`Loja Nota C2 ${Date.now()}`, [5, 4, 5]);
  const one = await request(app).get(`/api/stores/${s.id}`);
  expect(one.status).toBe(200);
  expect(one.body).toMatchObject({ ratingAverage: 4.7, ratingCount: 3 });

  const list = await request(app).get('/api/stores');
  expect(list.body.find((x: any) => x._id === s.id)).toMatchObject({ ratingAverage: 4.7, ratingCount: 3 });

  const near = await request(app).get('/api/stores/nearby?lat=-23.5615&lng=-46.6565');
  expect(near.status).toBe(200);
  expect(near.body.data.find((x: any) => x._id === s.id)).toMatchObject({ ratingAverage: 4.7, ratingCount: 3 });

  const found = await request(app).get(`/api/search?type=stores&q=${encodeURIComponent(s.name)}`);
  expect(found.body.data.items.find((x: any) => x._id === s.id)).toMatchObject({ ratingAverage: 4.7, ratingCount: 3 });
});

it('menos de 3 notas: sem média (null), com a contagem', async () => {
  const s = await lojaComNotas(`Loja Pouca Nota ${Date.now()}`, [5, 5]);
  const one = await request(app).get(`/api/stores/${s.id}`);
  expect(one.body).toMatchObject({ ratingAverage: null, ratingCount: 2 });
});

it('sem nenhuma nota: null e 0', async () => {
  const s = await lojaComNotas(`Loja Sem Nota ${Date.now()}`, []);
  const one = await request(app).get(`/api/stores/${s.id}`);
  expect(one.body).toMatchObject({ ratingAverage: null, ratingCount: 0 });
});
