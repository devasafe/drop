/** D1 · P3.13 — a loja desiste da troca de plano que ainda está pendente. */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';

const DOMAIN = '@d1p3t13.test';
let dono: TestUser;
let storeId: string;

beforeEach(async () => {
  dono = await createTestUser('lojista', DOMAIN);
  storeId = (await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja P3.13', isOpen: true } as any })).id;
});
afterEach(async () => {
  await prisma.storeSubscription.deleteMany({ where: { storeId } });
  await cleanupUsersByEmailDomain(DOMAIN);
});
afterAll(async () => { await prisma.$disconnect(); });

const cancel = (u: TestUser) => request(app).delete('/api/settings/store-subscription/request-change').set('Authorization', bearer(u));

it('pedido pendente: cancela e devolve a assinatura limpa; repetir dá 409', async () => {
  await request(app).post('/api/settings/store-subscription/request-change').set('Authorization', bearer(dono)).send({ newPlan: 'plan3' });
  expect((await prisma.storeSubscription.findUnique({ where: { storeId } }))!.planChangeStatus).toBe('pending');

  const r = await cancel(dono);
  expect(r.status).toBe(200);
  expect(r.body.success).toBe(true);
  expect(r.body.data).toMatchObject({ storeId, currentPlan: 'plan1', planChangeStatus: 'none', requestedPlan: null, requestedAt: null });

  const again = await cancel(dono);
  expect(again.status).toBe(409);
  expect(again.body.error.code).toBe('NO_PENDING_PLAN_CHANGE');

  // Depois de cancelar, pode pedir de novo.
  const novo = await request(app).post('/api/settings/store-subscription/request-change').set('Authorization', bearer(dono)).send({ newPlan: 'plan2' });
  expect(novo.status).toBe(200);
});

it('troca já recusada ou sem assinatura: 409 e nada muda', async () => {
  await prisma.storeSubscription.create({ data: { storeId, storeName: 'Loja P3.13', currentPlan: 'plan2', requestedPlan: 'plan3', planChangeStatus: 'rejected', rejectionReason: 'x' } });
  const r = await cancel(dono);
  expect(r.status).toBe(409);
  const sub = await prisma.storeSubscription.findUnique({ where: { storeId } });
  expect(sub!.planChangeStatus).toBe('rejected');
  expect(sub!.currentPlan).toBe('plan2');
});

it('usuário sem loja: 404 STORE_NOT_FOUND', async () => {
  const semLoja = await createTestUser('lojista', DOMAIN);
  const r = await cancel(semLoja);
  expect(r.status).toBe(404);
  expect(r.body.error.code).toBe('STORE_NOT_FOUND');
});
