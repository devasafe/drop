/** D1 · P3.2 — a loja responde a avaliação; a resposta sai na lista pública. */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';

const DOMAIN = '@d1p3t2.test';
let dono: TestUser;
let cliente: TestUser;
let storeId: string;

beforeEach(async () => {
  dono = await createTestUser('lojista', DOMAIN);
  cliente = await createTestUser('cliente', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: `Loja P3.2 ${Date.now()}`, isOpen: true, isVerified: true } as any });
  storeId = store.id;
});
afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });
afterAll(async () => { await prisma.$disconnect(); });

async function pedido(sid: string, extra: Record<string, unknown> = {}) {
  return prisma.order.create({
    data: { customerId: cliente.userId, storeId: sid, totalValue: 10, deliveryFee: 0, status: 'entregue', paymentStatus: 'paid', ...extra } as any,
  });
}
const reply = (u: TestUser, sid: string, orderId: string, body: any) =>
  request(app).put(`/api/stores/${sid}/ratings/${orderId}/reply`).set('Authorization', bearer(u)).send(body);

it('dono responde, edita e a resposta aparece no GET público', async () => {
  const o = await pedido(storeId, { storeRating: 5, storeComment: 'Chegou rápido' });

  const r1 = await reply(dono, storeId, o.id, { text: '  Obrigado pela compra!  ' });
  expect(r1.status).toBe(200);
  expect(r1.body.success).toBe(true);
  expect(r1.body.data).toMatchObject({ orderId: o.id, storeReply: 'Obrigado pela compra!' });
  expect(typeof r1.body.data.storeRepliedAt).toBe('string');

  const r2 = await reply(dono, storeId, o.id, { text: 'Volte sempre' });
  expect(r2.status).toBe(200);
  const db = await prisma.order.findUnique({ where: { id: o.id } });
  expect(db!.storeReply).toBe('Volte sempre');

  const list = await request(app).get(`/api/stores/${storeId}/ratings`);
  expect(list.status).toBe(200);
  expect(Array.isArray(list.body)).toBe(true);
  expect(list.body[0]).toMatchObject({ orderId: o.id, storeRating: 5, storeComment: 'Chegou rápido', storeReply: 'Volte sempre' });
  expect(list.body[0].storeRepliedAt).toBeTruthy();
  expect(list.body[0]).not.toHaveProperty('customerId');
});

it('outro lojista não responde avaliação desta loja (403)', async () => {
  const o = await pedido(storeId, { storeRating: 4 });
  const outro = await createTestUser('lojista', DOMAIN);
  const r = await reply(outro, storeId, o.id, { text: 'Invasão' });
  expect(r.status).toBe(403);
  expect(r.body.error.code).toBe('FORBIDDEN');
  expect((await prisma.order.findUnique({ where: { id: o.id } }))!.storeReply).toBeNull();
});

it('pedido sem nota ou de outra loja: 404 RATING_NOT_FOUND', async () => {
  const semNota = await pedido(storeId);
  const r1 = await reply(dono, storeId, semNota.id, { text: 'Oi' });
  expect(r1.status).toBe(404);
  expect(r1.body.error.code).toBe('RATING_NOT_FOUND');

  const outroDono = await createTestUser('lojista', DOMAIN);
  const outraLoja = await prisma.store.create({ data: { ownerId: outroDono.userId, name: 'Outra', isOpen: true } as any });
  const deOutra = await pedido(outraLoja.id, { storeRating: 5 });
  const r2 = await reply(dono, storeId, deOutra.id, { text: 'Oi' });
  expect(r2.status).toBe(404);
  expect((await prisma.order.findUnique({ where: { id: deOutra.id } }))!.storeReply).toBeNull();
});

it('texto vazio, só espaços ou acima de 500 caracteres: 400', async () => {
  const o = await pedido(storeId, { storeRating: 3 });
  expect((await reply(dono, storeId, o.id, { text: '' })).status).toBe(400);
  expect((await reply(dono, storeId, o.id, { text: '    ' })).status).toBe(400);
  expect((await reply(dono, storeId, o.id, { text: 'a'.repeat(501) })).status).toBe(400);
  expect((await reply(dono, storeId, o.id, {})).status).toBe(400);
  expect((await prisma.order.findUnique({ where: { id: o.id } }))!.storeReply).toBeNull();
});
