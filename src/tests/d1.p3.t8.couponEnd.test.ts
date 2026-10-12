/** D1 · P3.8 — encerrar cupom: não volta a valer (toggle 409) e o checkout recusa. */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { computeCouponDiscount } from '../controllers/couponController';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';

const DOMAIN = '@d1p3t8.test';
let dono: TestUser;
let storeId: string;

beforeEach(async () => {
  dono = await createTestUser('lojista', DOMAIN);
  storeId = (await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja P3.8', isOpen: true } as any })).id;
});
afterEach(async () => {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  await prisma.coupon.deleteMany({ where: { storeId: { in: stores.map((s) => s.id) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});
afterAll(async () => { await prisma.$disconnect(); });

async function cupom(extra: Record<string, unknown> = {}) {
  return prisma.coupon.create({
    data: {
      code: `P3T8${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase(),
      type: 'store', discountType: 'fixed', discountValue: 5, storeId,
      validFrom: new Date(Date.now() - 86400000), validUntil: new Date(Date.now() + 86400000), createdBy: 'test', ...extra,
    } as any,
  });
}

it('dono encerra: isActive=false e endedAt; encerrar de novo dá 409', async () => {
  const c = await cupom();
  const r = await request(app).post(`/api/coupons/${c.id}/end`).set('Authorization', bearer(dono));
  expect(r.status).toBe(200);
  expect(r.body.success).toBe(true);
  expect(r.body.data).toMatchObject({ _id: c.id, isActive: false });
  expect(r.body.data.endedAt).toBeTruthy();

  const again = await request(app).post(`/api/coupons/${c.id}/end`).set('Authorization', bearer(dono));
  expect(again.status).toBe(409);
  expect(again.body.error.code).toBe('COUPON_ENDED');
});

it('toggle de cupom encerrado: 409 COUPON_ENDED e continua inativo', async () => {
  const c = await cupom({ isActive: false, endedAt: new Date() });
  const r = await request(app).put(`/api/coupons/${c.id}/toggle`).set('Authorization', bearer(dono));
  expect(r.status).toBe(409);
  expect(r.body.error.code).toBe('COUPON_ENDED');
  expect((await prisma.coupon.findUnique({ where: { id: c.id } }))!.isActive).toBe(false);
});

it('toggle de cupom NÃO encerrado segue funcionando', async () => {
  const c = await cupom();
  const r = await request(app).put(`/api/coupons/${c.id}/toggle`).set('Authorization', bearer(dono));
  expect(r.status).toBe(200);
  expect(r.body).toEqual({ success: true, isActive: false });
});

it('outro lojista não encerra (403)', async () => {
  const c = await cupom();
  const outro = await createTestUser('lojista', DOMAIN);
  await prisma.store.create({ data: { ownerId: outro.userId, name: 'Outra', isOpen: true } as any });
  const r = await request(app).post(`/api/coupons/${c.id}/end`).set('Authorization', bearer(outro));
  expect(r.status).toBe(403);
  expect((await prisma.coupon.findUnique({ where: { id: c.id } }) as any).endedAt).toBeNull();
});

it('validação (checkout e POST /coupons/validate) recusa cupom encerrado, mesmo com isActive=true no banco', async () => {
  const c = await cupom({ isActive: true, endedAt: new Date() });
  const unit = await computeCouponDiscount(c.code, storeId, 100);
  expect(unit).toMatchObject({ valid: false, discount: 0, reason: 'Cupom encerrado' });

  const cliente = await createTestUser('cliente', DOMAIN);
  const r = await request(app).post('/api/coupons/validate').set('Authorization', bearer(cliente)).send({ code: c.code, storeId, orderValue: 100 });
  expect(r.status).toBe(400);
  expect(r.body.error).toBe('Cupom encerrado');
});
