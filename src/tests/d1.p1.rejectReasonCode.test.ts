jest.mock('../utils/socketEmitter', () => {
  const actual = jest.requireActual('../utils/socketEmitter');
  return { __esModule: true, ...actual, emitToRoom: jest.fn(), emitAdminNotification: jest.fn() };
});

import request from 'supertest';
import app from '../app';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@d1reason.test';
const ORIGINAL_GATEWAY = env.PAYMENT_GATEWAY;
let restore: () => Promise<void>;

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); (env as any).PAYMENT_GATEWAY = ORIGINAL_GATEWAY; });
beforeEach(async () => {
  (env as any).PAYMENT_GATEWAY = 'none';
  await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');
});
afterEach(async () => {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  const orders = await prisma.order.findMany({ where: { storeId: { in: stores.map((s) => s.id) } }, select: { id: true } });
  const ids = orders.map((o) => o.id);
  await prisma.appCashboxEntry.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.payout.deleteMany({ where: { orderId: { in: ids } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function pedidoNovo() {
  const lojista = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: lojista.userId, name: 'Loja Motivo', plan: 1, isOpen: true } as any });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Item', price: 20, quantity: 10 } } as any);
  const order = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId: store.id, items: { create: [{ productId: product.id, quantity: 1, price: 20 }] },
      subtotal: 20, totalValue: 20, deliveryFee: 0, status: 'criado', paymentMethod: 'pix', paymentStatus: 'paid', paymentProvider: 'asaas',
    } as any,
  });
  return { lojista, cliente, product, order };
}

const reject = (lojista: any, orderId: string, body: any) =>
  request(app).post(`/api/orders/${orderId}/reject`).set('Authorization', bearer(lojista)).send(body);

describe('POST /orders/:id/reject — reasonCode validado', () => {
  it.each(['banana', 'late_cancellation', 'customer_request', 123])('código %p: 400 e nada muda', async (code) => {
    const { lojista, cliente, product, order } = await pedidoNovo();
    const res = await reject(lojista, order.id, { reason: 'x', reasonCode: code });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect((await prisma.order.findUnique({ where: { id: order.id } }))?.status).toBe('criado');
    expect(await prisma.cancellation.count({ where: { orderId: order.id } })).toBe(0);
    expect((await prisma.product.findUnique({ where: { id: product.id } }))?.quantity).toBe(10);
    // estorno da carteira (fluxo legado) não aconteceu
    const w = await prisma.wallet.findUnique({ where: { owner_ownerType: { owner: cliente.userId, ownerType: 'user' } } });
    expect(Number(w?.balance ?? 0)).toBe(0);
  });

  it.each(['store_closed', 'store_busy', 'not_available', 'payment_issue', 'other', 'store_rejected'])('código %s: 200 e gravado', async (code) => {
    const { lojista, order } = await pedidoNovo();
    const res = await reject(lojista, order.id, { reason: 'motivo', reasonCode: code });
    expect(res.status).toBe(200);
    expect((await prisma.cancellation.findFirst({ where: { orderId: order.id } }))?.reasonCode).toBe(code);
  });

  it('sem reasonCode continua valendo (store_rejected)', async () => {
    const { lojista, order } = await pedidoNovo();
    const res = await reject(lojista, order.id, { reason: 'Sem estoque' });
    expect(res.status).toBe(200);
    expect((await prisma.cancellation.findFirst({ where: { orderId: order.id } }))?.reasonCode).toBe('store_rejected');
  });
});
