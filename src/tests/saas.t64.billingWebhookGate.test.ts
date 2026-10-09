/**
 * B3 — mensalidade SaaS: webhook da assinatura (conta-mãe) e bloqueio da loja pausada.
 * Asaas mockado em services/asaas/client (sem rede); rota mockada em routeService.
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
jest.mock('../services/routeService', () => {
  const actual = jest.requireActual('../services/routeService');
  return { __esModule: true, ...actual, getRoute: jest.fn() };
});

import request from 'supertest';
import app from '../app';
import env from '../config/env';
import logger from '../config/logger';
import { prisma } from '../lib/prisma';
import { getRoute } from '../services/routeService';
import { encryptSensitiveData } from '../utils/encryption';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import { ownerIdForStore, productIdForItem } from './helpers/storeOwner';
import { grantStoreConsent } from './helpers/storeConsent';

const DOMAIN = '@saas64.test';
const WEBHOOK_TOKEN = 'test-webhook-token';
const DAY = 24 * 60 * 60 * 1000;
const ORIGINAL_TOKEN = env.ASAAS_WEBHOOK_TOKEN;
let restore: () => Promise<void>;

const rand = () => Math.random().toString(36).slice(2, 10);
const evtId = () => `evt_t64_${rand()}`;

function randomCpf(): string {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (n.every((d) => d === n[0])) n[0] = (n[0] + 1) % 10;
  const dv = (base: number[]) => {
    const s = base.reduce((acc, d, i) => acc + d * (base.length + 1 - i), 0);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  n.push(dv(n));
  n.push(dv(n));
  return n.join('');
}

const hook = (body: any) => request(app).post('/webhooks/asaas').set('asaas-access-token', WEBHOOK_TOKEN).send(body);

async function makeStore(data: Record<string, unknown> = {}) {
  return prisma.store.create({
    data: { ownerId: await ownerIdForStore(DOMAIN), name: `Loja t64 ${rand()}`, isOpen: true, isVerified: true, latitude: '-22.90', longitude: '-43.20', ...data } as any,
  });
}

async function billingFor(storeId: string, data: Record<string, unknown> = {}) {
  return prisma.storeSaasBilling.create({
    data: { storeId, trialEndsAt: new Date(Date.now() - 30 * DAY), ...data } as any,
  });
}

/** Loja pausada: teste vencido há 30 dias, sem pagamento. */
const pausedData = () => ({ status: 'paused', pausedAt: new Date() });

beforeAll(async () => {
  restore = await snapshotPlatformConfig();
  env.ASAAS_WEBHOOK_TOKEN = WEBHOOK_TOKEN;
});
afterAll(async () => {
  await restore();
  env.ASAAS_WEBHOOK_TOKEN = ORIGINAL_TOKEN;
});
beforeEach(async () => {
  jest.clearAllMocks();
  (getRoute as jest.Mock).mockResolvedValue({ distanceKm: 3, durationSeconds: 600, polyline: 'abc', source: 'google' });
  await updatePlatformConfig({ settlementMode: 'direto', saasMonthlyFee: 49.9, saasTrialDays: 14, saasGraceDays: 5 } as any, 'test');
});
afterEach(async () => {
  jest.restoreAllMocks();
  await prisma.webhookEvent.deleteMany({ where: { eventId: { startsWith: 'evt_t64_' } } });
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  await prisma.storeAsaasCustomer.deleteMany({ where: { storeId: { in: stores.map((s) => s.id) } } });
  await prisma.storeAsaasAudit.deleteMany({ where: { storeId: { in: stores.map((s) => s.id) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

describe('t64 — webhook da assinatura SaaS (conta-mãe)', () => {
  it('PAYMENT_RECEIVED com subscription da loja → active, paidUntil = dueDate + 1 mês, fatura gravada; não cai no fluxo de pedido', async () => {
    const store = await makeStore();
    const subId = `sub_t64_${rand()}`;
    const billing = await billingFor(store.id, { asaasSubscriptionId: subId, status: 'past_due' });
    const warn = jest.spyOn(logger, 'warn');
    const payId = `pay_t64_${rand()}`;

    const res = await hook({
      id: evtId(), event: 'PAYMENT_RECEIVED',
      payment: { id: payId, subscription: subId, status: 'RECEIVED', dueDate: '2026-10-15', value: 49.9, invoiceUrl: 'https://asaas/i/1', paymentDate: '2026-10-14' },
    });

    expect(res.status).toBe(200);
    const row = await prisma.storeSaasBilling.findUnique({ where: { id: billing.id } });
    expect(row!.status).toBe('active');
    expect(row!.paidUntil!.toISOString()).toBe('2026-11-15T00:00:00.000Z');
    const pays = await prisma.saasBillingPayment.findMany({ where: { billingId: billing.id } });
    expect(pays).toHaveLength(1);
    expect(pays[0]).toMatchObject({ asaasPaymentId: payId, status: 'RECEIVED', invoiceUrl: 'https://asaas/i/1' });
    expect(warn).not.toHaveBeenCalledWith('Webhook de pagamento sem pedido correspondente', expect.anything());
  });

  it('mesmo evento 2x (mesmo id) → efeito uma vez', async () => {
    const store = await makeStore();
    const subId = `sub_t64_${rand()}`;
    const billing = await billingFor(store.id, { asaasSubscriptionId: subId });
    const body = {
      id: evtId(), event: 'PAYMENT_CONFIRMED',
      payment: { id: `pay_t64_${rand()}`, subscription: subId, status: 'CONFIRMED', dueDate: '2026-10-15', value: 49.9 },
    };
    expect((await hook(body)).status).toBe(200);
    const second = await hook(body);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);

    const row = await prisma.storeSaasBilling.findUnique({ where: { id: billing.id } });
    expect(row!.paidUntil!.toISOString()).toBe('2026-11-15T00:00:00.000Z');
    expect(await prisma.saasBillingPayment.count({ where: { billingId: billing.id } })).toBe(1);
  });

  it('externalReference saas-sub:<billingId> (sem subscription) também roteia', async () => {
    const store = await makeStore();
    const billing = await billingFor(store.id);
    const res = await hook({
      id: evtId(), event: 'PAYMENT_RECEIVED',
      payment: { id: `pay_t64_${rand()}`, externalReference: `saas-sub:${billing.id}`, status: 'RECEIVED', dueDate: '2026-12-01', value: 49.9 },
    });
    expect(res.status).toBe(200);
    const row = await prisma.storeSaasBilling.findUnique({ where: { id: billing.id } });
    expect(row!.status).toBe('active');
    expect(row!.paidUntil!.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('PAYMENT_CREATED grava a fatura pendente; PAYMENT_OVERDUE → past_due com overdueSince', async () => {
    const store = await makeStore();
    const subId = `sub_t64_${rand()}`;
    const billing = await billingFor(store.id, { asaasSubscriptionId: subId, status: 'trialing' });
    const payment = { id: `pay_t64_${rand()}`, subscription: subId, status: 'PENDING', dueDate: '2026-10-15', value: 49.9 };

    await hook({ id: evtId(), event: 'PAYMENT_CREATED', payment });
    let pay = await prisma.saasBillingPayment.findUnique({ where: { asaasPaymentId: payment.id } });
    expect(pay!.status).toBe('PENDING');

    await hook({ id: evtId(), event: 'PAYMENT_OVERDUE', payment: { ...payment, status: 'OVERDUE' } });
    const row = await prisma.storeSaasBilling.findUnique({ where: { id: billing.id } });
    expect(row!.status).toBe('past_due');
    expect(row!.overdueSince!.toISOString()).toBe('2026-10-15T00:00:00.000Z');
    pay = await prisma.saasBillingPayment.findUnique({ where: { asaasPaymentId: payment.id } });
    expect(pay!.status).toBe('OVERDUE');
  });

  it('PAYMENT_DELETED só marca a fatura; PAYMENT_REFUNDED marca e avisa, sem recuar paidUntil', async () => {
    const store = await makeStore();
    const subId = `sub_t64_${rand()}`;
    const billing = await billingFor(store.id, { asaasSubscriptionId: subId });

    const pending = { id: `pay_t64_${rand()}`, subscription: subId, status: 'PENDING', dueDate: '2026-11-15', value: 49.9 };
    await hook({ id: evtId(), event: 'PAYMENT_CREATED', payment: pending });
    await hook({ id: evtId(), event: 'PAYMENT_DELETED', payment: { ...pending, deleted: true } });
    expect((await prisma.saasBillingPayment.findUnique({ where: { asaasPaymentId: pending.id } }))!.status).toBe('DELETED');

    const paid = { id: `pay_t64_${rand()}`, subscription: subId, status: 'RECEIVED', dueDate: '2026-10-15', value: 49.9 };
    await hook({ id: evtId(), event: 'PAYMENT_RECEIVED', payment: paid });
    const warn = jest.spyOn(logger, 'warn');
    const res = await hook({ id: evtId(), event: 'PAYMENT_REFUNDED', payment: { ...paid, status: 'REFUNDED' } });
    expect(res.status).toBe(200);

    expect((await prisma.saasBillingPayment.findUnique({ where: { asaasPaymentId: paid.id } }))!.status).toBe('REFUNDED');
    const row = await prisma.storeSaasBilling.findUnique({ where: { id: billing.id } });
    expect(row!.status).toBe('active');
    expect(row!.paidUntil!.toISOString()).toBe('2026-11-15T00:00:00.000Z');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('estornada'), expect.objectContaining({ asaasPaymentId: paid.id }));
  });

  it('regressão: webhook de pedido normal continua confirmando o pedido', async () => {
    const cliente = await createTestUser('cliente', DOMAIN);
    const store = await makeStore();
    const payId = `pay_t64_${rand()}`;
    const order = await prisma.order.create({ data: {
      customerId: cliente.userId, storeId: store.id,
      items: { create: [{ productId: await productIdForItem(DOMAIN, 100), quantity: 1, price: 100 }] },
      totalValue: 100, deliveryFee: 0, status: 'criado', paymentMethod: 'pix', paymentStatus: 'pending',
      asaasPaymentId: payId, asaasChargeStatus: 'pending',
      walletDistribution: { storeAmount: 90, appCommission: 10, commissionPercent: 10 },
    } as any });

    const res = await hook({ id: evtId(), event: 'PAYMENT_RECEIVED', payment: { id: payId, status: 'RECEIVED', externalReference: String(order.id) } });
    expect(res.status).toBe(200);
    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated!.paymentStatus).toBe('paid');
    expect(await prisma.saasBillingPayment.count({ where: { asaasPaymentId: payId } })).toBe(0);
  });
});

describe('t64 — loja pausada não vende e some da vitrine (modo direto)', () => {
  it('loja paused some de GET /stores e GET /stores/:id → 404; loja sem linha de billing continua visível', async () => {
    const paused = await makeStore();
    await billingFor(paused.id, pausedData());
    const cancelled = await makeStore();
    await billingFor(cancelled.id, { status: 'cancelled' });
    const semLinha = await makeStore();
    const emDia = await makeStore();
    await billingFor(emDia.id, { status: 'active', paidUntil: new Date(Date.now() + 10 * DAY) });

    const list = await request(app).get('/api/stores');
    expect(list.status).toBe(200);
    const ids = list.body.map((s: any) => s._id ?? s.id);
    expect(ids).not.toContain(paused.id);
    expect(ids).not.toContain(cancelled.id);
    expect(ids).toContain(semLinha.id);
    expect(ids).toContain(emDia.id);

    expect((await request(app).get(`/api/stores/${paused.id}`)).status).toBe(404);
    expect((await request(app).get(`/api/stores/${cancelled.id}`)).status).toBe(404);
    expect((await request(app).get(`/api/stores/${semLinha.id}`)).status).toBe(200);
  });

  it('loja paused some dos destaques', async () => {
    const paused = await makeStore({ plan: 3, featuredBannerUrl: 'https://img/x.png' });
    await billingFor(paused.id, pausedData());
    const ok = await makeStore({ plan: 3, featuredBannerUrl: 'https://img/y.png' });
    const res = await request(app).get('/api/stores/featured');
    const ids = res.body.map((s: any) => s._id ?? s.id);
    expect(ids).not.toContain(paused.id);
    expect(ids).toContain(ok.id);
  });

  it('produtos da loja paused somem de GET /products', async () => {
    const before = (await request(app).get('/api/products')).body.pagination.total;
    const paused = await makeStore();
    await billingFor(paused.id, pausedData());
    await prisma.product.create({ data: { storeId: paused.id, name: 'Escondido', price: 10, quantity: 5 } } as any);
    const visible = await makeStore();
    await prisma.product.create({ data: { storeId: visible.id, name: 'Visível', price: 10, quantity: 5 } } as any);

    const after = (await request(app).get('/api/products')).body.pagination.total;
    expect(after - before).toBe(1);
  });

  it('criar pedido direto para loja bloqueada → 409 STORE_BILLING_PAUSED, sem expor inadimplência', async () => {
    const cliente = await createTestUser('cliente', DOMAIN);
    await prisma.user.update({ where: { id: cliente.userId }, data: { cpf: randomCpf() } });
    const store = await makeStore();
    await prisma.storeAsaasAccount.create({
      data: { storeId: store.id, apiKeyEncrypted: encryptSensitiveData('$aact_hmlg_LOJA'), apiKeyLast4: 'LOJA', environment: 'sandbox', status: 'valid' },
    });
    await grantStoreConsent(store.id);
    // Status ainda `past_due` (o job não rodou), mas já passou da carência: bloqueia pela política.
    await billingFor(store.id, { status: 'past_due', asaasSubscriptionId: `sub_t64_${rand()}` });
    const product = await prisma.product.create({ data: { storeId: store.id, name: 'Item', price: 20, quantity: 10 } } as any);

    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send({
      storeId: store.id, products: [{ productId: product.id, quantity: 1 }], paymentMethod: 'pix',
      deliveryDistanceKm: 0, address: 'Rua X, 1 - Centro', latitude: -22.95, longitude: -43.25,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STORE_BILLING_PAUSED');
    expect(res.body.error).toBe('Esta loja está temporariamente indisponível.');
    expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0);
    expect((await prisma.product.findUnique({ where: { id: product.id } }))!.quantity).toBe(10);
  });

  it('modo custódia: loja com billing paused continua visível (nada se aplica)', async () => {
    await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');
    const before = (await request(app).get('/api/products')).body.pagination.total;
    const paused = await makeStore();
    await billingFor(paused.id, pausedData());
    await prisma.product.create({ data: { storeId: paused.id, name: 'Custódia', price: 10, quantity: 5 } } as any);

    const ids = (await request(app).get('/api/stores')).body.map((s: any) => s._id ?? s.id);
    expect(ids).toContain(paused.id);
    expect((await request(app).get(`/api/stores/${paused.id}`)).status).toBe(200);
    const after = (await request(app).get('/api/products')).body.pagination.total;
    expect(after - before).toBe(1);
  });
});
