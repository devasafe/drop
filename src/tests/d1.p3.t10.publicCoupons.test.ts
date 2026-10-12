/** D1 · P3.10 — a página pública da loja lista só os cupons públicos que valem agora. */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser } from './helpers/authUser';

const DOMAIN = '@d1p3t10.test';
const DAY = 86400000;
let storeId: string;
let otherStoreId: string;
const codes: string[] = [];

beforeEach(async () => {
  const dono = await createTestUser('lojista', DOMAIN);
  storeId = (await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja P3.10', isOpen: true, isVerified: true } as any })).id;
  const outro = await createTestUser('lojista', DOMAIN);
  otherStoreId = (await prisma.store.create({ data: { ownerId: outro.userId, name: 'Outra P3.10', isOpen: true, isVerified: true } as any })).id;
});
afterEach(async () => {
  await prisma.coupon.deleteMany({ where: { code: { in: codes.splice(0) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});
afterAll(async () => { await prisma.$disconnect(); });

async function cupom(code: string, extra: Record<string, unknown> = {}) {
  codes.push(code);
  return prisma.coupon.create({
    data: {
      code, type: 'store', discountType: 'percent', discountValue: 10, storeId, isPublic: true,
      minOrderValue: 50, validFrom: new Date(Date.now() - DAY), validUntil: new Date(Date.now() + DAY), createdBy: 'test', ...extra,
    } as any,
  });
}

it('só públicos, ativos, não encerrados, na validade, não esgotados e desta loja', async () => {
  const sfx = Date.now().toString(36).toUpperCase();
  const ok = await cupom(`OK${sfx}`);
  await cupom(`SEC${sfx}`, { isPublic: false });
  await cupom(`OFF${sfx}`, { isActive: false });
  await cupom(`END${sfx}`, { endedAt: new Date() });
  await cupom(`OLD${sfx}`, { validUntil: new Date(Date.now() - 1000) });
  await cupom(`FUT${sfx}`, { validFrom: new Date(Date.now() + DAY) });
  await cupom(`ESG${sfx}`, { maxUses: 5, usedCount: 5 });
  await cupom(`OUT${sfx}`, { storeId: otherStoreId });
  await cupom(`GLB${sfx}`, { type: 'global', storeId: null });

  const r = await request(app).get(`/api/stores/${storeId}`);
  expect(r.status).toBe(200);
  expect(r.body.publicCoupons).toEqual([
    { _id: ok.id, code: `OK${sfx}`, discountType: 'percent', discountValue: 10, minOrderValue: 50, validUntil: ok.validUntil.toISOString() },
  ]);
  // Nenhum campo interno do cupom vaza.
  expect(r.body.publicCoupons[0]).not.toHaveProperty('usedCount');
  expect(r.body.publicCoupons[0]).not.toHaveProperty('createdBy');
});

it('loja sem cupom público: lista vazia', async () => {
  const r = await request(app).get(`/api/stores/${storeId}`);
  expect(r.status).toBe(200);
  expect(r.body.publicCoupons).toEqual([]);
});
