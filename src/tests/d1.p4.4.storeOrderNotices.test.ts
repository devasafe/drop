// src/tests/d1.p4.4.storeOrderNotices.test.ts
/** D1 · P4.4 — pedido novo e cancelamento viram aviso da loja com link para /seller/pedido/<id>. */
jest.mock('../services/pushService', () => {
  const actual = jest.requireActual('../services/pushService');
  return { __esModule: true, ...actual, sendPushToUser: jest.fn(async () => {}), notifyStoreOwner: jest.fn() };
});

import fs from 'fs';
import path from 'path';
import request from 'supertest';
import app from '../app';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import { sendPushToUser, notifyStoreOwner } from '../services/pushService';
import { emitOrderCreated } from '../utils/socketEmitter';
import { runStoreAcceptTimeout } from '../jobs/storeAcceptTimeout.job';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig, wipeAppCashbox } from './helpers/pgCleanup';
import { createWallet, createAppCashbox } from './helpers/financePg';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@d1p44.test';
const push = sendPushToUser as jest.Mock;
const ownerPush = notifyStoreOwner as jest.Mock;
const minAgo = (m: number) => new Date(Date.now() - m * 60 * 1000);
let restore: () => Promise<void>;
let gatewayOriginal: any;

async function waitFor<T>(fn: () => Promise<T | null | undefined>, ms = 3000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('waitFor: tempo esgotado');
    await new Promise((r) => setTimeout(r, 50));
  }
}
async function wipeNotifications() {
  const users = await prisma.user.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } });
  await prisma.notification.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
}

beforeAll(async () => {
  gatewayOriginal = env.PAYMENT_GATEWAY;
  restore = await snapshotPlatformConfig();
  const existing = await prisma.platformConfig.findFirst({ orderBy: { updatedAt: 'asc' } });
  if (existing) await prisma.platformConfig.update({ where: { id: existing.id }, data: { storeAcceptTimeoutMin: 10 } });
  else await prisma.platformConfig.create({ data: { storeAcceptTimeoutMin: 10, updatedBy: 'd1p44.test' } });
  await wipeAppCashbox();
});
afterAll(async () => { env.PAYMENT_GATEWAY = gatewayOriginal; await restore(); await prisma.$disconnect(); });
beforeEach(() => { push.mockClear(); ownerPush.mockClear(); });
afterEach(async () => {
  env.PAYMENT_GATEWAY = gatewayOriginal;
  await wipeNotifications();
  await cleanupUsersByEmailDomain(DOMAIN);
  await wipeAppCashbox();
});

async function setup() {
  env.PAYMENT_GATEWAY = undefined as any; // fluxo legado: estorno na carteira, sem rede
  const dono = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  await createWallet({ owner: cliente.userId, ownerType: 'user', balance: 300, totalIncome: 300, totalSpent: 0 });
  await createAppCashbox({ balance: 0, totalIncome: 0, totalExpenses: 0 });
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja P44', isOpen: true } });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Produto P44', price: 50, quantity: 5 } });
  return { dono, cliente, store, product };
}
async function paidOrder(s: Awaited<ReturnType<typeof setup>>, extra: Record<string, any> = {}) {
  return prisma.order.create({
    data: {
      customerId: s.cliente.userId, storeId: s.store.id,
      items: { create: [{ productId: s.product.id, quantity: 1, price: 50 }] },
      totalValue: 50, deliveryFee: 0, paymentMethod: 'pix', status: 'criado', paymentStatus: 'paid',
      ...extra,
    } as any,
  });
}
const noticeOf = (userId: string, entityId: string, title: string) =>
  prisma.notification.findFirst({ where: { userId, entityId, title } });

describe('P4.4 — avisos da loja', () => {
  it('pedido novo (emitOrderCreated): aviso com link do pedido e push no mesmo link; repetir não duplica', async () => {
    const s = await setup();
    const order = await paidOrder(s);
    emitOrderCreated({ _id: order.id, storeId: s.store.id, customerId: s.cliente.userId, totalValue: 50, status: 'criado' });
    const n = await waitFor(() => noticeOf(s.dono.userId, order.id, 'Novo pedido'));
    expect(n).toMatchObject({ type: 'order', link: `/seller/pedido/${order.id}` });
    expect(push).toHaveBeenCalledWith(s.dono.userId, expect.objectContaining({ url: `/seller/pedido/${order.id}` }));

    emitOrderCreated({ _id: order.id, storeId: s.store.id, customerId: s.cliente.userId, totalValue: 50, status: 'criado' });
    await new Promise((r) => setTimeout(r, 300));
    expect(await prisma.notification.count({ where: { userId: s.dono.userId, entityId: order.id } })).toBe(1);
  });

  it('timeout de aceite (cancelOrderWithFullRefund): aviso "Pedido cancelado" com link do pedido', async () => {
    const s = await setup();
    const order = await paidOrder(s, { createdAt: minAgo(25), paidAt: minAgo(11) });
    await runStoreAcceptTimeout();
    expect((await prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe('cancelado');
    const n = await noticeOf(s.dono.userId, order.id, 'Pedido cancelado');
    expect(n).toMatchObject({ type: 'order', link: `/seller/pedido/${order.id}` });
    expect(n!.message).toContain('prazo');
  });

  it('cliente cancela: aviso "Pedido cancelado" com link do pedido (sem /store-dashboard)', async () => {
    const s = await setup();
    const order = await paidOrder(s);
    const r = await request(app).post(`/api/orders/${order.id}/cancel`).set('Authorization', bearer(s.cliente)).send({ reason: 'Mudei de ideia' });
    expect(r.status).toBe(200);
    const n = await noticeOf(s.dono.userId, order.id, 'Pedido cancelado');
    expect(n).toMatchObject({ link: `/seller/pedido/${order.id}` });
    expect(push).toHaveBeenCalledWith(s.dono.userId, expect.objectContaining({ url: `/seller/pedido/${order.id}` }));
    expect(ownerPush).not.toHaveBeenCalledWith(s.store.id, expect.objectContaining({ url: '/store-dashboard' }));
  });

  it('avaliação nova: push leva a /seller/avaliacoes', async () => {
    const s = await setup();
    const order = await paidOrder(s, { status: 'entregue' });
    const r = await request(app).post(`/api/orders/${order.id}/evaluate-store`).set('Authorization', bearer(s.cliente)).send({ storeRating: 5 });
    expect(r.status).toBe(200);
    expect(ownerPush).toHaveBeenCalledWith(s.store.id, expect.objectContaining({ url: '/seller/avaliacoes' }));
  });

  it('nenhum push do backend aponta mais para /store-dashboard', () => {
    const files = ['utils/socketEmitter.ts', 'controllers/cancellationController.ts', 'controllers/orderController.ts'];
    for (const f of files) {
      const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
      expect(src).not.toContain("'/store-dashboard'");
    }
  });
});
