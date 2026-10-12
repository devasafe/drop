/** D1 · P3.9 — "vendas geradas" por cupom: usos, pedidos pagos, vendas e desconto. */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';

const DOMAIN = '@d1p3t9.test';
let dono: TestUser;
let cliente: TestUser;
let storeId: string;

beforeEach(async () => {
  dono = await createTestUser('lojista', DOMAIN);
  cliente = await createTestUser('cliente', DOMAIN);
  storeId = (await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja P3.9', isOpen: true } as any })).id;
});
afterEach(async () => {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  await prisma.coupon.deleteMany({ where: { storeId: { in: stores.map((s) => s.id) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});
afterAll(async () => { await prisma.$disconnect(); });

async function cupom(usedCount: number) {
  return prisma.coupon.create({
    data: {
      code: `P3T9${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase(),
      type: 'store', discountType: 'fixed', discountValue: 10, storeId, usedCount,
      validFrom: new Date(Date.now() - 86400000), validUntil: new Date(Date.now() + 86400000), createdBy: 'test',
    },
  });
}
const pedido = (couponId: string | null, subtotal: number, deliveryFee: number, totalValue: number, paymentStatus: string) =>
  prisma.order.create({ data: { customerId: cliente.userId, storeId, subtotal, deliveryFee, totalValue, paymentStatus, couponId } as any });

it('soma só os pedidos pagos com o cupom', async () => {
  const c = await cupom(3);
  await pedido(c.id, 100, 7.4, 97.4, 'paid');   // desconto 10
  await pedido(c.id, 50, 0, 40, 'paid');        // desconto 10 (Plano 1, taxa 0)
  await pedido(c.id, 80, 6, 76, 'pending');     // não pago: fora
  await pedido(c.id, 60, 6, 56, 'refunded');    // estornado: fora
  await pedido(null, 999, 0, 999, 'paid');      // sem cupom: fora

  const r = await request(app).get(`/api/coupons/${c.id}/results`).set('Authorization', bearer(dono));
  expect(r.status).toBe(200);
  expect(r.body).toEqual({ success: true, data: { uses: 3, ordersPaid: 2, salesTotal: 150, discountTotal: 20 } });
});

it('cupom sem pedido: zeros', async () => {
  const c = await cupom(0);
  const r = await request(app).get(`/api/coupons/${c.id}/results`).set('Authorization', bearer(dono));
  expect(r.body.data).toEqual({ uses: 0, ordersPaid: 0, salesTotal: 0, discountTotal: 0 });
});

it('outro lojista: 403', async () => {
  const c = await cupom(1);
  const outro = await createTestUser('lojista', DOMAIN);
  await prisma.store.create({ data: { ownerId: outro.userId, name: 'Outra', isOpen: true } as any });
  const r = await request(app).get(`/api/coupons/${c.id}/results`).set('Authorization', bearer(outro));
  expect(r.status).toBe(403);
});
