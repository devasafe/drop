/** D1 · P3.7 — cupom público: create, update (só isPublic) e listagem do dono. */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';

const DOMAIN = '@d1p3t7.test';
let dono: TestUser;
let storeId: string;

const newCode = () => `P3T7${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
const payload = (extra: Record<string, unknown> = {}) => ({
  code: newCode(), type: 'store', discountType: 'percent', discountValue: 10,
  validFrom: new Date(Date.now() - 1000).toISOString(), validUntil: new Date(Date.now() + 86400000).toISOString(), ...extra,
});

beforeEach(async () => {
  dono = await createTestUser('lojista', DOMAIN);
  storeId = (await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja P3.7', isOpen: true } as any })).id;
});
afterEach(async () => {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  await prisma.coupon.deleteMany({ where: { storeId: { in: stores.map((s) => s.id) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});
afterAll(async () => { await prisma.$disconnect(); });

it('create aceita isPublic; sem o campo nasce secreto', async () => {
  const pub = await request(app).post('/api/coupons').set('Authorization', bearer(dono)).send(payload({ isPublic: true }));
  expect(pub.status).toBe(201);
  expect(pub.body.isPublic).toBe(true);
  const sec = await request(app).post('/api/coupons').set('Authorization', bearer(dono)).send(payload());
  expect(sec.status).toBe(201);
  expect(sec.body.isPublic).toBe(false);
  const fake = await request(app).post('/api/coupons').set('Authorization', bearer(dono)).send(payload({ isPublic: 'sim' }));
  expect(fake.status).toBe(201);
  expect(fake.body.isPublic).toBe(false);
});

it('PUT /coupons/:id troca a visibilidade; GET lista isPublic e endedAt', async () => {
  const created = await request(app).post('/api/coupons').set('Authorization', bearer(dono)).send(payload());
  const id = created.body._id;
  const r = await request(app).put(`/api/coupons/${id}`).set('Authorization', bearer(dono)).send({ isPublic: true });
  expect(r.status).toBe(200);
  expect(r.body).toMatchObject({ success: true, data: { _id: id, isPublic: true } });

  const list = await request(app).get('/api/coupons').set('Authorization', bearer(dono));
  expect(list.status).toBe(200);
  const mine = list.body.find((c: any) => c._id === id);
  expect(mine.isPublic).toBe(true);
  expect(mine).toHaveProperty('endedAt', null);
});

it('PUT só aceita isPublic (corpo estrito): outro campo → 400 e nada muda', async () => {
  const created = await request(app).post('/api/coupons').set('Authorization', bearer(dono)).send(payload());
  const r = await request(app).put(`/api/coupons/${created.body._id}`).set('Authorization', bearer(dono)).send({ isPublic: true, discountValue: 99 });
  expect(r.status).toBe(400);
  const db = await prisma.coupon.findUnique({ where: { id: created.body._id } });
  expect(Number(db!.discountValue)).toBe(10);
  expect((db as any).isPublic).toBe(false);
});

it('outro lojista: 403; cupom inexistente: 404; cupom encerrado: 409 COUPON_ENDED', async () => {
  const created = await request(app).post('/api/coupons').set('Authorization', bearer(dono)).send(payload());
  const outro = await createTestUser('lojista', DOMAIN);
  await prisma.store.create({ data: { ownerId: outro.userId, name: 'Outra', isOpen: true } as any });
  const r403 = await request(app).put(`/api/coupons/${created.body._id}`).set('Authorization', bearer(outro)).send({ isPublic: true });
  expect(r403.status).toBe(403);

  const r404 = await request(app).put('/api/coupons/nao-existe').set('Authorization', bearer(dono)).send({ isPublic: true });
  expect(r404.status).toBe(404);
  expect(r404.body.error.code).toBe('COUPON_NOT_FOUND');

  await prisma.coupon.update({ where: { id: created.body._id }, data: { endedAt: new Date(), isActive: false } as any });
  const r409 = await request(app).put(`/api/coupons/${created.body._id}`).set('Authorization', bearer(dono)).send({ isPublic: true });
  expect(r409.status).toBe(409);
  expect(r409.body.error.code).toBe('COUPON_ENDED');
});
