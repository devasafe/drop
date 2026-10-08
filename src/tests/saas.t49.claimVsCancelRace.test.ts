/**
 * Pré-deploy item 4 — corrida motoboy aceita × loja recusa / cliente cancela.
 *  a. claimDelivery exige o pedido aberto na mesma escrita (409 ORDER_CLOSED).
 *  b. Na recusa da loja, a entrega `pending` é cancelada por updateMany condicional
 *     (motoboyId null); count 0 = um motoboy aceitou no meio → caminho de compensação.
 *  c. No cancelamento do cliente, motoboyId/statusDevolucao são relidos DEPOIS da trava.
 * Asaas mockado (sem rede); emissões de socket mockadas.
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
import * as directCancellationModule from '../services/asaasLoja/directCancellation';

const DOMAIN = '@saas49.test';
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

/** Invariante: pedido recusado/cancelado nunca fica com motoboy atribuído sem compensação. */
async function expectNoUncompensatedMotoboy(orderId: string, deliveryId: string) {
  const [o, d, ts] = await Promise.all([orderOf(orderId), deliveryOf(deliveryId), transfersOf(orderId)]);
  if (o!.status === 'rejeitado' || o!.status === 'cancelado') {
    if (d!.motoboyId) {
      expect(ts.filter((t) => t.reason === 'cancellation_compensation' && t.motoboyId === d!.motoboyId)).toHaveLength(1);
    }
    expect(d!.status).toBe('cancelled');
  } else {
    expect(d!.status).toBe('assigned');
  }
}

describe('4a — claimDelivery confere o pedido na escrita condicional', () => {
  for (const closed of ['cancelado', 'rejeitado'] as const) {
    it(`pedido ${closed} com entrega ainda pending → 409 ORDER_CLOSED e a entrega não muda`, async () => {
      const s = await scenario({ status: 'aguardando_motoboy', delivery: 'pending' });
      await prisma.order.update({ where: { id: s.order.id }, data: { status: closed } });
      const res = await claim(s.delivery.id, s.m1);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ORDER_CLOSED');
      const d = await deliveryOf(s.delivery.id);
      expect(d!.status).toBe('pending');
      expect(d!.motoboyId).toBeNull();
      expect(d!.pin).toBe('12345');
    });
  }

  it('aceite logo depois da recusa gravada (antes do fim do handler da loja) → 409; nada fica atribuído', async () => {
    const s = await scenario({ status: 'aguardando_motoboy', delivery: 'pending' });
    const real = directCancellationModule.recordCancellationWithCompensation;
    let claimRes: any;
    jest.spyOn(directCancellationModule, 'recordCancellationWithCompensation').mockImplementation((async (...args: any[]) => {
      const out = await (real as any)(...args);
      claimRes = await claim(s.delivery.id, s.m1); // o motoboy aceita na janela pós-commit
      return out;
    }) as any);
    const res = await reject(s);
    expect(res.status).toBe(200);
    expect(claimRes.status).toBe(409);
    const d = await deliveryOf(s.delivery.id);
    expect(d!.motoboyId).toBeNull();
    expect(d!.status).toBe('cancelled');
    expect(await transfersOf(s.order.id)).toHaveLength(0);
  });

  it('Promise.all(aceite, recusa): estado final consistente', async () => {
    for (let i = 0; i < 3; i++) {
      const s = await scenario({ status: 'aguardando_motoboy', delivery: 'pending' });
      await Promise.all([claim(s.delivery.id, s.m1), reject(s)]);
      await expectNoUncompensatedMotoboy(s.order.id, s.delivery.id);
    }
  });
});

describe('4b — recusa da loja cancela a entrega pending de forma condicional', () => {
  it('direto: sem aceite → entrega cancelada na transação, sem compensação', async () => {
    const s = await scenario({ status: 'aguardando_motoboy', delivery: 'pending' });
    const real = directCancellationModule.recordCancellationWithCompensation;
    let deliveryAfterRecord: any;
    jest.spyOn(directCancellationModule, 'recordCancellationWithCompensation').mockImplementation((async (...args: any[]) => {
      const out = await (real as any)(...args);
      deliveryAfterRecord = await deliveryOf(s.delivery.id);
      return out;
    }) as any);
    const res = await reject(s);
    expect(res.status).toBe(200);
    // Já cancelada quando a transação do registro termina (não só no fim do handler).
    expect(deliveryAfterRecord.status).toBe('cancelled');
    expect(await transfersOf(s.order.id)).toHaveLength(0);
  });

  it('direto: motoboy aceitou entre o guard e a trava → compensação ao motoboy e entrega cancelada', async () => {
    const s = await scenario({ status: 'aguardando_motoboy', delivery: 'assigned', motoboy: 'm1' });
    staleFirstDeliveryRead({ id: s.delivery.id, status: 'pending', motoboyId: null });
    const res = await reject(s);
    expect(res.status).toBe(200);
    const ts = await transfersOf(s.order.id);
    expect(ts).toHaveLength(1);
    expect(ts[0].motoboyId).toBe(s.m1.userId);
    expect(ts[0].reason).toBe('cancellation_compensation');
    expect((await deliveryOf(s.delivery.id))!.status).toBe('cancelled');
  });

  it('custódia: motoboy aceitou entre o guard e a trava → Payout de compensação ao motoboy', async () => {
    const s = await scenario({ status: 'aguardando_motoboy', delivery: 'assigned', motoboy: 'm1', provider: 'asaas' });
    staleFirstDeliveryRead({ id: s.delivery.id, status: 'pending', motoboyId: null });
    const res = await reject(s);
    expect(res.status).toBe(200);
    // calculateCancellationFee(store, motoboy envolvido): 12 × 10% = 1,20; motoboy 50% = 0,60.
    const payouts = await prisma.payout.findMany({ where: { orderId: s.order.id, recipientType: 'motoboy' } });
    expect(payouts).toHaveLength(1);
    expect(payouts[0].recipientId).toBe(s.m1.userId);
    expect(Number(payouts[0].amount)).toBe(0.6);
    expect(await transfersOf(s.order.id)).toHaveLength(0);
  });
});

describe('4c — cancelamento do cliente relê a entrega depois da trava', () => {
  it('direto: motoboy desistiu (devolução em andamento) depois da leitura → 409 RETURN_IN_PROGRESS, nada cancelado nem pago', async () => {
    const s = await scenario({ status: 'enviado', delivery: 'picked', motoboy: 'm1', statusDevolucao: 'aguardando_confirmacao' });
    staleFirstDeliveryRead({ motoboyId: s.m1.userId, statusDevolucao: null });
    const res = await cancelByCustomer(s);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('RETURN_IN_PROGRESS');
    expect((await orderOf(s.order.id))!.status).toBe('enviado');
    expect(await transfersOf(s.order.id)).toHaveLength(0);
    expect(await prisma.cancellation.count({ where: { orderId: s.order.id } })).toBe(0);
  });

  it('direto: a entrega trocou de motoboy entre a leitura e a trava → compensação a quem está na entrega', async () => {
    const s = await scenario({ status: 'enviado', delivery: 'picked', motoboy: 'm2' });
    staleFirstDeliveryRead({ motoboyId: s.m1.userId, statusDevolucao: null });
    const res = await cancelByCustomer(s);
    expect(res.status).toBe(200);
    const ts = await transfersOf(s.order.id);
    expect(ts).toHaveLength(1);
    expect(ts[0].motoboyId).toBe(s.m2.userId);
    expect(Number(ts[0].amount)).toBe(12);
  });

  it('direto: motoboy apareceu na entrega depois da leitura (envolvimento mudou) → 409 para o cliente tentar de novo, nada cancelado', async () => {
    const s = await scenario({ status: 'enviado', delivery: 'picked', motoboy: 'm1' });
    staleFirstDeliveryRead({ motoboyId: null, statusDevolucao: null });
    const res = await cancelByCustomer(s);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DELIVERY_CHANGED');
    expect((await orderOf(s.order.id))!.status).toBe('enviado');
    expect(await transfersOf(s.order.id)).toHaveLength(0);
    // Nova tentativa (sem leitura velha): taxa da entrega e compensação ao motoboy.
    const again = await cancelByCustomer(s);
    expect(again.status).toBe(200);
    expect(again.body.refundAmount).toBe(40);
    expect((await transfersOf(s.order.id))[0].motoboyId).toBe(s.m1.userId);
  });

  it('custódia: a entrega trocou de motoboy entre a leitura e a trava → Payout a quem está na entrega', async () => {
    const s = await scenario({ status: 'enviado', delivery: 'picked', motoboy: 'm2', provider: 'asaas' });
    staleFirstDeliveryRead({ motoboyId: s.m1.userId, statusDevolucao: null });
    const res = await cancelByCustomer(s);
    expect(res.status).toBe(200);
    const payouts = await prisma.payout.findMany({ where: { orderId: s.order.id, recipientType: 'motoboy' } });
    expect(payouts).toHaveLength(1);
    expect(payouts[0].recipientId).toBe(s.m2.userId);
  });

  it('custódia: motoboy desistiu depois da leitura → não recebe compensação', async () => {
    const s = await scenario({ status: 'enviado', delivery: 'picked', motoboy: 'm1', statusDevolucao: 'aguardando_confirmacao', provider: 'asaas' });
    staleFirstDeliveryRead({ motoboyId: s.m1.userId, statusDevolucao: null });
    await cancelByCustomer(s);
    expect(await prisma.payout.count({ where: { orderId: s.order.id, recipientType: 'motoboy' } })).toBe(0);
  });
});
