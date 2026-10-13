/** D1 · revisão final T31 — aprovar/recusar × cancelar a troca de plano: só um vence. */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';

const DOMAIN = '@d1t31.test';
let dono: TestUser;
let ceo: TestUser;
let storeId: string;
let subId: string;

beforeEach(async () => {
  dono = await createTestUser('lojista', DOMAIN);
  ceo = await createTestUser('ceo', DOMAIN);
  storeId = (await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja T31', isOpen: true, plan: 1 } as any })).id;
  const r = await request(app).post('/api/settings/store-subscription/request-change').set('Authorization', bearer(dono)).send({ newPlan: 'plan3' });
  expect(r.status).toBe(200);
  subId = (await prisma.storeSubscription.findUnique({ where: { storeId } }))!.id;
});
afterEach(async () => {
  await prisma.storeSubscription.deleteMany({ where: { storeId } });
  await cleanupUsersByEmailDomain(DOMAIN);
});
afterAll(async () => { await prisma.$disconnect(); });

const cancel = () => request(app).delete('/api/settings/store-subscription/request-change').set('Authorization', bearer(dono));
const approve = () => request(app).post('/api/settings/approve-plan-change').set('Authorization', bearer(ceo)).send({ subscriptionId: subId });
const reject = () => request(app).post('/api/settings/reject-plan-change').set('Authorization', bearer(ceo)).send({ subscriptionId: subId, reason: 'não' });
const state = async () => ({
  sub: (await prisma.storeSubscription.findUnique({ where: { storeId } }))!,
  store: (await prisma.store.findUnique({ where: { id: storeId } }))!,
});

it('aprovar depois do cancelamento: 409 PLAN_CHANGE_NOT_PENDING e o plano não muda', async () => {
  expect((await cancel()).status).toBe(200);
  const r = await approve();
  expect(r.status).toBe(409);
  expect(typeof r.body.error).toBe('string');
  expect(r.body.code).toBe('PLAN_CHANGE_NOT_PENDING');
  const { sub, store } = await state();
  expect(sub.currentPlan).toBe('plan1');
  expect(sub.planChangeStatus).toBe('none');
  expect(store.plan).toBe(1);
});

it('recusar depois do cancelamento: 409 e fica como cancelado (não vira rejected)', async () => {
  expect((await cancel()).status).toBe(200);
  const r = await reject();
  expect(r.status).toBe(409);
  expect(typeof r.body.error).toBe('string');
  expect(r.body.code).toBe('PLAN_CHANGE_NOT_PENDING');
  expect((await state()).sub.planChangeStatus).toBe('none');
});

it('aprovar duas vezes: a segunda dá 409', async () => {
  expect((await approve()).status).toBe(200);
  expect((await approve()).status).toBe(409);
  const { sub, store } = await state();
  expect(sub.currentPlan).toBe('plan3');
  expect(store.plan).toBe(3);
});

it.each([0, 1, 2, 3])('cancelar e aprovar ao mesmo tempo (rodada %i): só um vence e o estado fica coerente', async () => {
  const [c, a] = await Promise.all([cancel(), approve()]);
  const { sub, store } = await state();
  expect([c.status, a.status].sort()).toEqual([200, 409]);
  if (a.status === 200) {
    expect(c.status).toBe(409);
    expect(sub.currentPlan).toBe('plan3');
    expect(store.plan).toBe(3);
  } else {
    expect(typeof a.body.error).toBe('string');
    expect(a.body.code).toBe('PLAN_CHANGE_NOT_PENDING');
    expect(sub.currentPlan).toBe('plan1');
    expect(store.plan).toBe(1);
  }
});

it('cancelar e recusar ao mesmo tempo: só um vence', async () => {
  const [c, r] = await Promise.all([cancel(), reject()]);
  expect([c.status, r.status].sort()).toEqual([200, 409]);
});
