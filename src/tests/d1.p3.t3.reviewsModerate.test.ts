/** D1 · P3.3 — moderação apaga a resposta da loja (reviews:moderate). */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { ALL_PERMISSIONS } from '../controllers/rolePermissionsController';
import { hasPermission } from '../utils/walletCalculations';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';

const DOMAIN = '@d1p3t3.test';
let dono: TestUser;
let orderId: string;

beforeEach(async () => {
  dono = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja P3.3', isOpen: true } as any });
  const o = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId: store.id, totalValue: 10, deliveryFee: 0, status: 'entregue',
      storeRating: 2, storeComment: 'Demorou', storeReply: 'Você é chato', storeRepliedAt: new Date(),
    } as any,
  });
  orderId = o.id;
});
afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });
afterAll(async () => { await prisma.$disconnect(); });

const del = (u: TestUser, id: string) => request(app).delete(`/api/admin/ratings/${id}/reply`).set('Authorization', bearer(u));

it('a permissão está no catálogo e na matriz padrão só de quem modera loja', () => {
  expect(ALL_PERMISSIONS.map((p) => p.key)).toContain('reviews:moderate');
  expect(hasPermission('gerente_geral', 'reviews:moderate')).toBe(true);
  expect(hasPermission('gerente_lojistas', 'reviews:moderate')).toBe(true);
  for (const role of ['marketing', 'gerente_clientes', 'gerente_motoboys', 'lojista', 'cliente', 'motoboy']) {
    expect(hasPermission(role, 'reviews:moderate')).toBe(false);
  }
});

it('CEO apaga a resposta; nota e comentário do cliente ficam', async () => {
  const ceo = await createTestUser('ceo', DOMAIN);
  const r = await del(ceo, orderId);
  expect(r.status).toBe(200);
  expect(r.body).toEqual({ success: true, data: { orderId, storeReply: null, storeRepliedAt: null } });
  const db = await prisma.order.findUnique({ where: { id: orderId } });
  expect(db!.storeReply).toBeNull();
  expect(db!.storeRepliedAt).toBeNull();
  expect(db!.storeRating).toBe(2);
  expect(db!.storeComment).toBe('Demorou');

  const again = await del(ceo, orderId);
  expect(again.status).toBe(404);
  expect(again.body.error.code).toBe('REPLY_NOT_FOUND');
});

it('lojista (mesmo o dono) e cliente não moderam: 403 e a resposta fica', async () => {
  expect((await del(dono, orderId)).status).toBe(403);
  const cliente = await createTestUser('cliente', DOMAIN);
  expect((await del(cliente, orderId)).status).toBe(403);
  expect((await prisma.order.findUnique({ where: { id: orderId } }))!.storeReply).toBe('Você é chato');
});

it('sem login: 401', async () => {
  expect((await request(app).delete(`/api/admin/ratings/${orderId}/reply`)).status).toBe(401);
});
