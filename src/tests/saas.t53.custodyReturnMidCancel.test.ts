/**
 * Lote pré-deploy 2 — item D: devolução que começa no meio do cancelamento (custódia).
 * No direto, devolução descoberta depois da trava → 409 RETURN_IN_PROGRESS e nada muda. Na
 * custódia o cancelamento seguia: reembolso de 100%, entrega em devolução num pedido
 * 'cancelado', e depois o pos-devolucao "reentrega" gravava 'reassign' num pedido encerrado.
 */
jest.mock('../services/asaas/client', () => {
  const actual = jest.requireActual('../services/asaas/client');
  return {
    __esModule: true,
    ...actual,
    default: {
      ...actual.default,
      get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn(),
      getAs: jest.fn(), postAs: jest.fn(), putAs: jest.fn(), deleteAs: jest.fn(),
    },
  };
});
jest.mock('../utils/socketEmitter', () => {
  const actual = jest.requireActual('../utils/socketEmitter');
  return { __esModule: true, ...actual, emitToRoom: jest.fn(), emitAdminNotification: jest.fn() };
});

import request from 'supertest';
import app from '../app';
import env from '../config/env';
import asaasClient from '../services/asaas/client';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';

const DOMAIN = '@saas53.test';
const STORE_KEY = '$aact_hmlg_LOJA_49XX';
const postAs = asaasClient.postAs as jest.Mock;
const ORIGINAL_GATEWAY = env.PAYMENT_GATEWAY;

let restore: () => Promise<void>;
let testStart = new Date();
beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); (env as any).PAYMENT_GATEWAY = ORIGINAL_GATEWAY; });

beforeEach(async () => {
  testStart = new Date();
  jest.clearAllMocks();
  postAs.mockReset();
  postAs.mockResolvedValue({ id: 'ref_loja', status: 'REFUNDED' });
  (env as any).PAYMENT_GATEWAY = 'none';
  await updatePlatformConfig({
    settlementMode: 'direto', customerAbsentWaitMin: 0, directTransferMaxAmount: 150,
    cancelFeeCustomerPercent: 10, cancelFeeStorePercent: 10, cancelFeeMotoboyPercent: 10, lateCancellationMotoboyShare: 50,
  } as any, 'test');
});

afterEach(async () => {
  jest.restoreAllMocks();
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  const storeIds = stores.map((s) => s.id);
  const orders = await prisma.order.findMany({ where: { storeId: { in: storeIds } }, select: { id: true } });
  const ids = orders.map((o) => o.id);
  await prisma.motoboyTransfer.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.directRefund.deleteMany({ where: { storeId: { in: storeIds } } });
  await prisma.payout.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.appCashboxEntry.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.appCashbox.deleteMany({ where: { createdAt: { gte: testStart }, entries: { none: {} } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function scenario(sc: {
  status: 'pago' | 'aguardando_motoboy' | 'enviado';
  delivery: 'pending' | 'assigned' | 'picked';
  motoboy?: 'none' | 'm1' | 'm2';
  statusDevolucao?: string;
  provider?: 'asaas_loja' | 'asaas';
}) {
  const cliente = await createTestUser('cliente', DOMAIN);
  const lojista = await createTestUser('lojista', DOMAIN);
  const m1 = await createTestUser('motoboy', DOMAIN);
  const m2 = await createTestUser('motoboy', DOMAIN);
  for (const m of [m1, m2]) {
    await prisma.user.update({ where: { id: m.userId }, data: { asaas: { status: 'none', pixKey: '12345678909', pixKeyType: 'CPF' } } as any });
  }
  const store = await prisma.store.create({
    data: { ownerId: lojista.userId, name: 'Loja 49', isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any,
  });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Item', price: 20, quantity: 10 } } as any);
  await prisma.storeAsaasAccount.create({
    data: { storeId: store.id, apiKeyEncrypted: encryptSensitiveData(STORE_KEY), apiKeyLast4: '49XX', environment: 'sandbox', status: 'valid' },
  });
  // Custódia: a taxa da loja sai da carteira dela.
  await prisma.wallet.create({ data: { owner: store.id, ownerType: 'store', balance: 500, totalIncome: 500 } });
  const order = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId: store.id,
      items: { create: [{ productId: product.id, quantity: 2, price: 20 }] },
      subtotal: 40, totalValue: 52, deliveryFee: 12, status: sc.status, paymentMethod: 'pix',
      paymentStatus: 'paid', asaasChargeStatus: 'received',
      asaasPaymentId: `pay_49_${Math.random().toString(36).slice(2, 8)}`, paymentProvider: sc.provider ?? 'asaas_loja',
      acceptedAt: new Date(),
      walletDistribution: { storeAmount: 52, appCommission: 0, commissionPercent: 0 },
    } as any,
  });
  const who = sc.motoboy ?? (sc.delivery === 'pending' ? 'none' : 'm1');
  const delivery = await prisma.delivery.create({
    data: {
      orderId: order.id, status: sc.delivery, fee: 12, distance: 4, pin: '12345', pinRetirada: '54321',
      motoboyId: who === 'none' ? null : who === 'm1' ? m1.userId : m2.userId,
      statusDevolucao: sc.statusDevolucao ?? null,
    } as any,
  });
  await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });
  return { cliente, lojista, m1, m2, store, order, delivery };
}

const claim = (deliveryId: string, m: TestUser) => request(app).post(`/api/deliveries/${deliveryId}/claim`).set('Authorization', bearer(m)).send({});
const reject = (s: any) => request(app).post(`/api/orders/${s.order.id}/reject`).set('Authorization', bearer(s.lojista)).send({ reason: 'sem estoque' });
const cancelByCustomer = (s: any) => request(app).post(`/api/orders/${s.order.id}/cancel`).set('Authorization', bearer(s.cliente)).send({});
const transfersOf = (orderId: string) => prisma.motoboyTransfer.findMany({ where: { orderId } });
const deliveryOf = (id: string) => prisma.delivery.findUnique({ where: { id } });
const orderOf = (id: string) => prisma.order.findUnique({ where: { id } });

/** A leitura ANTES da trava devolve `stale` (o mundo mudou entre a leitura e a trava). */
function staleFirstDeliveryRead(stale: Record<string, unknown>) {
  const real = prisma.delivery.findUnique.bind(prisma.delivery);
  jest.spyOn(prisma.delivery, 'findUnique')
    .mockImplementationOnce((async () => stale) as any)
    .mockImplementation(real as any);
}


describe('D — custódia: devolução em andamento descoberta depois da leitura', () => {
  it('409 RETURN_IN_PROGRESS; pedido volta ao status anterior e nenhum dinheiro/estoque se move', async () => {
    const s = await scenario({ status: 'enviado', delivery: 'picked', motoboy: 'm1', statusDevolucao: 'aguardando_confirmacao', provider: 'asaas' });
    staleFirstDeliveryRead({ motoboyId: s.m1.userId, statusDevolucao: null });
    const res = await cancelByCustomer(s);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('RETURN_IN_PROGRESS');
    const o = await orderOf(s.order.id);
    expect(o!.status).toBe('enviado');
    expect(o!.cancelledAt).toBeNull();
    expect(o!.paymentStatus).toBe('paid');
    expect(await prisma.cancellation.count({ where: { orderId: s.order.id } })).toBe(0);
    expect(await prisma.payout.count({ where: { orderId: s.order.id } })).toBe(0);
    expect(await prisma.walletEntry.count({ where: { relatedId: s.order.id } })).toBe(0);
    expect((await prisma.product.findFirst({ where: { storeId: s.store.id } }))!.quantity).toBe(10);
    const d = await deliveryOf(s.delivery.id);
    expect(d!.statusDevolucao).toBe('aguardando_confirmacao');
  });

  it('sem devolução, o cancelamento da custódia segue (200)', async () => {
    const s = await scenario({ status: 'aguardando_motoboy', delivery: 'pending', provider: 'asaas' });
    const res = await cancelByCustomer(s);
    expect(res.status).toBe(200);
    expect((await orderOf(s.order.id))!.status).toBe('cancelado');
  });
});

describe('D — pos-devolucao com pedido encerrado', () => {
  const posDevolucao = (s: any, escolha: string) =>
    request(app).post(`/api/orders/${s.order.id}/pos-devolucao`).set('Authorization', bearer(s.cliente)).send({ escolha });

  for (const closed of ['cancelado', 'rejeitado'] as const) {
    for (const escolha of ['reentrega', 'reembolso']) {
      it(`pedido ${closed} + ${escolha} → 409 ORDER_CLOSED sem gravar nada`, async () => {
        const s = await scenario({ status: 'enviado', delivery: 'picked', motoboy: 'm1', statusDevolucao: 'aguardando_confirmacao', provider: 'asaas' });
        await prisma.order.update({ where: { id: s.order.id }, data: { status: closed } });
        const res = await posDevolucao(s, escolha);
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('ORDER_CLOSED');
        const d = await deliveryOf(s.delivery.id);
        expect(d!.pendingReturnAction).toBeNull();
        expect(await prisma.cancellation.count({ where: { orderId: s.order.id } })).toBe(0);
        expect(await prisma.payout.count({ where: { orderId: s.order.id } })).toBe(0);
      });
    }
  }

  it('pedido aberto + reentrega → 200 e marca reassign (fluxo de sempre)', async () => {
    const s = await scenario({ status: 'enviado', delivery: 'picked', motoboy: 'm1', statusDevolucao: 'aguardando_confirmacao', provider: 'asaas' });
    const res = await posDevolucao(s, 'reentrega');
    expect(res.status).toBe(200);
    expect((await deliveryOf(s.delivery.id))!.pendingReturnAction).toBe('reassign');
  });
});
