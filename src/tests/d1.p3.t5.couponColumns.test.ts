/** D1 · P3.5 — Coupon ganha isPublic (padrão secreto) e endedAt. */
import { prisma } from '../lib/prisma';

const codes: string[] = [];
const code = () => { const c = `P3T5${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase(); codes.push(c); return c; };
afterEach(async () => { await prisma.coupon.deleteMany({ where: { code: { in: codes.splice(0) } } }); });
afterAll(async () => { await prisma.$disconnect(); });

const base = () => ({
  code: code(), type: 'store' as const, discountType: 'percent' as const, discountValue: 10,
  validFrom: new Date(), validUntil: new Date(Date.now() + 86400000), createdBy: 'test',
});

it('cupom novo nasce secreto e sem encerramento', async () => {
  const c: any = await prisma.coupon.create({ data: base() as any });
  expect(c.isPublic).toBe(false);
  expect(c.endedAt).toBeNull();
});

it('grava isPublic e endedAt', async () => {
  const ended = new Date();
  const c: any = await prisma.coupon.create({ data: { ...base(), isPublic: true, endedAt: ended, isActive: false } as any });
  expect(c.isPublic).toBe(true);
  expect(c.endedAt.toISOString()).toBe(ended.toISOString());
});
