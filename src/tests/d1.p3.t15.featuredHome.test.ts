/** D1 · P3.15 — o banner do Premium só aparece na Home (e na vitrine) com o Plano 3 ativo. */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { toPublicStore } from '../repositories/store.repository';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser } from './helpers/authUser';

const DOMAIN = '@d1p3t15.test';
const created: string[] = [];

afterEach(async () => {
  await prisma.storeSubscription.deleteMany({ where: { storeId: { in: created.splice(0) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});
afterAll(async () => { await prisma.$disconnect(); });

async function loja(plan: number, currentPlan?: 'plan1' | 'plan2' | 'plan3') {
  const dono = await createTestUser('lojista', DOMAIN);
  const s = await prisma.store.create({
    data: { ownerId: dono.userId, name: `Loja P3.15 ${plan}${currentPlan ?? ''}`, isOpen: true, isVerified: true, plan, featuredBannerUrl: `https://img.test/${Math.random()}.png` } as any,
  });
  created.push(s.id);
  if (currentPlan) await prisma.storeSubscription.create({ data: { storeId: s.id, storeName: s.name, currentPlan } });
  return s;
}

it('/stores/featured: só Plano 3 ativo (assinatura plan3 ou loja legada sem assinatura)', async () => {
  const pendente = await loja(1, 'plan1');        // banner guardado antes da aprovação
  const ativo = await loja(3, 'plan3');
  const dessincronizada = await loja(3, 'plan2'); // Store.plan ficou 3, assinatura diz plan2
  const legado = await loja(3);                   // sem StoreSubscription

  const r = await request(app).get('/api/stores/featured');
  expect(r.status).toBe(200);
  const ids = r.body.map((s: any) => s._id);
  expect(ids).toContain(ativo.id);
  expect(ids).toContain(legado.id);
  expect(ids).not.toContain(pendente.id);
  expect(ids).not.toContain(dessincronizada.id);
});

it('vitrine pública não expõe o banner guardado de quem não é Premium', async () => {
  const pendente = await loja(1, 'plan1');
  const one = await request(app).get(`/api/stores/${pendente.id}`);
  expect(one.status).toBe(200);
  expect(one.body.featuredBannerUrl).toBeNull();

  const ativo = await loja(3, 'plan3');
  const two = await request(app).get(`/api/stores/${ativo.id}`);
  expect(two.body.featuredBannerUrl).toMatch(/^https:\/\/img\.test\//);
});

it('toPublicStore: banner só com plan 3; sem banner continua sem', () => {
  expect(toPublicStore({ id: 'a', plan: 2, featuredBannerUrl: 'x' }).featuredBannerUrl).toBeNull();
  expect(toPublicStore({ id: 'b', plan: 3, featuredBannerUrl: 'x' }).featuredBannerUrl).toBe('x');
  expect(toPublicStore({ id: 'c', plan: 3 })).not.toHaveProperty('featuredBannerUrl');
});
