// src/tests/d1.p3.t12.directSummary.test.ts
/** D1 · P3.12 — resumo do mês do modo direto: pedidos pagos, Pix aos motoboys e estornos. */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { monthRangeSaoPaulo } from '../services/asaasLoja/directSummary';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';

const DOMAIN = '@d1p3t12.test';
let dono: TestUser;
let cliente: TestUser;
let storeId: string;
const rid = () => `p312_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

beforeEach(async () => {
  dono = await createTestUser('lojista', DOMAIN);
  cliente = await createTestUser('cliente', DOMAIN);
  storeId = (await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja P3.12', isOpen: true } as any })).id;
});
afterEach(async () => {
  await prisma.motoboyTransfer.deleteMany({ where: { storeId } });
  await prisma.directRefund.deleteMany({ where: { storeId } });
  await cleanupUsersByEmailDomain(DOMAIN);
});
afterAll(async () => { await prisma.$disconnect(); });

const pedido = (extra: Record<string, unknown>) =>
  prisma.order.create({ data: { customerId: cliente.userId, storeId, deliveryFee: 0, paymentProvider: 'asaas_loja', paymentStatus: 'paid', ...extra } as any });
const transfer = (extra: Record<string, unknown>) =>
  prisma.motoboyTransfer.create({
    data: { deliveryId: rid(), orderId: rid(), storeId, motoboyId: rid(), amount: 5, pixKeyEncrypted: 'x', pixKeyType: 'CPF', ...extra } as any,
  });
const refund = (extra: Record<string, unknown>) =>
  prisma.directRefund.create({ data: { orderId: rid(), storeId, asaasPaymentId: rid(), amount: 10, requestedBy: 'test', ...extra } as any });

it('monthRangeSaoPaulo: o mês começa às 03:00 UTC (meia-noite em São Paulo)', () => {
  const r = monthRangeSaoPaulo('2026-09');
  expect(r.month).toBe('2026-09');
  expect(r.start.toISOString()).toBe('2026-09-01T03:00:00.000Z');
  expect(r.end.toISOString()).toBe('2026-10-01T03:00:00.000Z');
  expect(monthRangeSaoPaulo('2026-12').end.toISOString()).toBe('2027-01-01T03:00:00.000Z');
  // 00:30 UTC de 1º/10 ainda é 30/09 em São Paulo
  expect(monthRangeSaoPaulo(undefined, new Date('2026-10-01T00:30:00Z')).month).toBe('2026-09');
});

it('soma o mês pedido no fuso de São Paulo', async () => {
  await pedido({ totalValue: 100, paidAt: new Date('2026-09-10T15:00:00Z') });
  await pedido({ totalValue: 50, paidAt: new Date('2026-10-01T02:30:00Z') });       // 30/09 23:30 em SP: entra
  await pedido({ totalValue: 70, paymentStatus: 'refunded', paidAt: new Date('2026-09-12T12:00:00Z') }); // pago e depois estornado: entra
  await pedido({ totalValue: 999, paidAt: new Date('2026-10-01T03:30:00Z') });     // já é outubro em SP
  await pedido({ totalValue: 999, paidAt: new Date('2026-09-10T15:00:00Z'), paymentProvider: 'asaas' }); // custódia
  await pedido({ totalValue: 999, paymentStatus: 'pending', paidAt: null, createdAt: new Date('2026-09-10T15:00:00Z') });
  await pedido({ totalValue: 30, paidAt: null, createdAt: new Date('2026-09-05T15:00:00Z') }); // antigo, sem paidAt

  await transfer({ status: 'done', amount: 8, doneAt: new Date('2026-09-15T12:00:00Z') });
  await transfer({ status: 'done', amount: 9, doneAt: new Date('2026-10-02T12:00:00Z') }); // outubro
  await transfer({ status: 'failed', amount: 6 });
  await transfer({ status: 'uncertain', amount: 6 });
  await transfer({ status: 'pending', amount: 6 });

  await refund({ status: 'done', amount: 30, doneAt: new Date('2026-09-20T12:00:00Z') });
  await refund({ status: 'pending', amount: 40 });

  const r = await request(app).get(`/api/stores/${storeId}/direct-summary?month=2026-09`).set('Authorization', bearer(dono));
  expect(r.status).toBe(200);
  expect(r.body).toEqual({
    success: true,
    data: {
      month: '2026-09',
      ordersPaid: { count: 4, total: 250 },
      motoboyPix: { sentCount: 1, sentTotal: 8, stuckCount: 2 },
      refunds: { count: 1, total: 30 },
    },
  });
});

it('sem month: mês corrente; mês vazio dá zeros', async () => {
  const r = await request(app).get(`/api/stores/${storeId}/direct-summary`).set('Authorization', bearer(dono));
  expect(r.status).toBe(200);
  expect(r.body.data.month).toMatch(/^\d{4}-\d{2}$/);
  expect(r.body.data).toMatchObject({ ordersPaid: { count: 0, total: 0 }, motoboyPix: { sentCount: 0, sentTotal: 0, stuckCount: 0 }, refunds: { count: 0, total: 0 } });
});

it('month inválido: 400; outro lojista: 403', async () => {
  expect((await request(app).get(`/api/stores/${storeId}/direct-summary?month=2026-13`).set('Authorization', bearer(dono))).status).toBe(400);
  expect((await request(app).get(`/api/stores/${storeId}/direct-summary?month=set-2026`).set('Authorization', bearer(dono))).status).toBe(400);
  const outro = await createTestUser('lojista', DOMAIN);
  const r = await request(app).get(`/api/stores/${storeId}/direct-summary?month=2026-09`).set('Authorization', bearer(outro));
  expect(r.status).toBe(403);
});
