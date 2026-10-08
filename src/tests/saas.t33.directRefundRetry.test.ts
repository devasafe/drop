/**
 * Task 3.3 — retentativa (backoff P5), reaper de 'requested' preso e reconciliação por webhook.
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
  return { __esModule: true, ...actual, emitToRoom: jest.fn() };
});

import crypto from 'crypto';
import request from 'supertest';
import app from '../app';
import asaasClient, { AsaasApiError } from '../services/asaas/client';
import { emitToRoom } from '../utils/socketEmitter';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser } from './helpers/authUser';
import { ownerIdForStore } from './helpers/storeOwner';
import { grantStoreConsent } from './helpers/storeConsent';
import { requestDirectRefund, executeDirectRefund } from '../services/asaasLoja/refund';
import { runDirectRefunds } from '../jobs/directRefunds.job';

const DOMAIN = '@saas33.test';
const STORE_KEY = '$aact_hmlg_LOJA_33XX';
const WH_TOKEN = 'c'.repeat(48);
const sha = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const postAs = asaasClient.postAs as jest.Mock;
const emit = emitToRoom as jest.Mock;
const MIN = 60000;

beforeEach(() => {
  jest.clearAllMocks();
  postAs.mockReset();
  emit.mockReset();
});

afterEach(async () => {
  await prisma.webhookEvent.deleteMany({ where: { eventId: { contains: 'evt_t33_' } } });
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  await prisma.directRefund.deleteMany({ where: { storeId: { in: stores.map((s) => s.id) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function setup() {
  const store = await prisma.store.create({
    data: { ownerId: await ownerIdForStore(DOMAIN), name: 'Loja 33', isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any,
  });
  await prisma.storeAsaasAccount.create({
    data: {
      storeId: store.id, apiKeyEncrypted: encryptSensitiveData(STORE_KEY), apiKeyLast4: '33XX', environment: 'sandbox', status: 'valid',
      paymentWebhookId: 'wh_33', paymentWebhookTokenHash: sha(WH_TOKEN),
    },
  });
  await grantStoreConsent(store.id);
  const cliente = await createTestUser('cliente', DOMAIN);
  const order = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId: store.id, totalValue: 50, deliveryFee: 0,
      status: 'cancelado', paymentMethod: 'pix', paymentStatus: 'paid', asaasChargeStatus: 'received',
      asaasPaymentId: `pay_33_${Math.random().toString(36).slice(2, 8)}`, paymentProvider: 'asaas_loja',
    } as any,
  });
  const cancellation = await prisma.cancellation.create({
    data: { orderId: order.id, cancelledBy: 'customer', reason: 'x', reasonCode: 'customer_request', refundAmount: 50, refundStatus: 'pending' } as any,
  });
  const refund = await requestDirectRefund({ orderId: order.id, cancellationId: cancellation.id, amount: 50, requestedBy: 'system' });
  return { store, order, cancellation, refund };
}

const rowOf = (id: string) => prisma.directRefund.findUnique({ where: { id } });
const fail400 = () => new AsaasApiError(400, [{ code: 'x', description: 'Saldo insuficiente' } as any]);

describe('runDirectRefunds', () => {
  it('failed vencido e reexecutado; sucesso -> done', async () => {
    const s = await setup();
    await prisma.directRefund.update({ where: { id: s.refund.id }, data: { status: 'failed', attempts: 1, nextAttemptAt: new Date(Date.now() - MIN) } });
    postAs.mockResolvedValue({ id: 'ref' });

    const out = await runDirectRefunds();

    expect(out).toEqual({ retried: 1, finalFailed: 0 });
    expect(postAs).toHaveBeenCalledTimes(1);
    const row = await rowOf(s.refund.id);
    expect(row!.status).toBe('done');
    expect(row!.attempts).toBe(2);
  });

  it('failed com nextAttemptAt futuro -> nao chama o Asaas', async () => {
    const s = await setup();
    await prisma.directRefund.update({ where: { id: s.refund.id }, data: { status: 'failed', attempts: 1, nextAttemptAt: new Date(Date.now() + 10 * MIN) } });
    const out = await runDirectRefunds();
    expect(out).toEqual({ retried: 0, finalFailed: 0 });
    expect(postAs).not.toHaveBeenCalled();
    expect((await rowOf(s.refund.id))!.status).toBe('failed');
  });

  it.each(['uncertain', 'done', 'failed_final'])('%s -> o job nao toca', async (st) => {
    const s = await setup();
    await prisma.directRefund.update({ where: { id: s.refund.id }, data: { status: st, nextAttemptAt: new Date(Date.now() - 60 * MIN) } });
    await runDirectRefunds();
    expect(postAs).not.toHaveBeenCalled();
    expect((await rowOf(s.refund.id))!.status).toBe(st);
  });

  it('duas execucoes concorrentes -> no maximo 1 chamada por estorno', async () => {
    const s = await setup();
    await prisma.directRefund.update({ where: { id: s.refund.id }, data: { status: 'failed', attempts: 1, nextAttemptAt: new Date(Date.now() - MIN) } });
    postAs.mockImplementation(() => new Promise((res) => setTimeout(() => res({ id: 'ref' }), 50)));
    await Promise.all([runDirectRefunds(), runDirectRefunds()]);
    expect(postAs).toHaveBeenCalledTimes(1);
    expect((await rowOf(s.refund.id))!.status).toBe('done');
  });

  it('failed_final na 6a falha: conta em finalFailed e alerta no admin', async () => {
    const s = await setup();
    await prisma.directRefund.update({ where: { id: s.refund.id }, data: { status: 'failed', attempts: 5, nextAttemptAt: new Date(Date.now() - MIN) } });
    postAs.mockRejectedValue(fail400());

    const out = await runDirectRefunds();

    expect(out).toEqual({ retried: 1, finalFailed: 1 });
    expect((await rowOf(s.refund.id))!.status).toBe('failed_final');
    expect(emit.mock.calls.some((c) => c[0] === 'admin' && c[1] === 'refund:failed_final')).toBe(true);
  });

  describe('reaper de requested preso', () => {
    it('requested ha mais de 10 min -> uncertain STUCK_REQUESTED, alerta no admin, sem chamar o Asaas', async () => {
      const s = await setup();
      await prisma.directRefund.update({ where: { id: s.refund.id }, data: { status: 'requested', attempts: 1, updatedAt: new Date(Date.now() - 11 * MIN) } });

      await runDirectRefunds();

      const row = await rowOf(s.refund.id);
      expect(row!.status).toBe('uncertain');
      expect(row!.lastError).toBe('STUCK_REQUESTED');
      expect(postAs).not.toHaveBeenCalled();
      expect(emit.mock.calls.some((c) => c[0] === 'admin' && c[1] === 'refund:uncertain')).toBe(true);
    });

    it('requested recente (< 10 min) -> intacto', async () => {
      const s = await setup();
      await prisma.directRefund.update({ where: { id: s.refund.id }, data: { status: 'requested', attempts: 1, updatedAt: new Date(Date.now() - 2 * MIN) } });
      await runDirectRefunds();
      expect((await rowOf(s.refund.id))!.status).toBe('requested');
    });
  });
});

describe('backoff P5 em executeDirectRefund', () => {
  it.each([
    [0, 5 * MIN], [1, 15 * MIN], [2, 60 * MIN], [3, 180 * MIN], [4, 360 * MIN],
  ])('apos %i falha(s) previas, a proxima falha agenda +%i ms', async (prev, delay) => {
    const s = await setup();
    await prisma.directRefund.update({ where: { id: s.refund.id }, data: { status: prev === 0 ? 'pending' : 'failed', attempts: prev } });
    postAs.mockRejectedValue(fail400());
    const before = Date.now();

    expect(await executeDirectRefund(s.refund.id)).toBe('failed');

    const row = await rowOf(s.refund.id);
    expect(row!.attempts).toBe(prev + 1);
    const delta = row!.nextAttemptAt.getTime() - before;
    expect(delta).toBeGreaterThan(delay - 5000);
    expect(delta).toBeLessThan(delay + 5000);
  });

  it('6a falha -> failed_final, alerta refund:failed_final no admin', async () => {
    const s = await setup();
    await prisma.directRefund.update({ where: { id: s.refund.id }, data: { status: 'failed', attempts: 5 } });
    postAs.mockRejectedValue(fail400());

    expect(await executeDirectRefund(s.refund.id)).toBe('failed_final');

    const row = await rowOf(s.refund.id);
    expect(row!.status).toBe('failed_final');
    expect(row!.attempts).toBe(6);
    expect(emit.mock.calls.some((c) => c[0] === 'admin' && c[1] === 'refund:failed_final')).toBe(true);
  });
});

describe('webhook PAYMENT_REFUNDED da loja reconcilia o DirectRefund', () => {
  const send = (storeId: string, paymentId: string) =>
    request(app).post(`/webhooks/asaas/loja/${storeId}`).set('asaas-access-token', WH_TOKEN)
      .send({ id: `evt_t33_${Math.random().toString(36).slice(2, 10)}`, event: 'PAYMENT_REFUNDED', payment: { id: paymentId, status: 'REFUNDED', value: 50 } });

  it.each(['uncertain', 'failed', 'requested'])('%s -> done, resolvedBy webhook, cancelamento processed', async (st) => {
    const s = await setup();
    await prisma.directRefund.update({ where: { id: s.refund.id }, data: { status: st, attempts: 1 } });

    const res = await send(s.store.id, s.order.asaasPaymentId!);

    expect(res.status).toBe(200);
    const row = await rowOf(s.refund.id);
    expect(row!.status).toBe('done');
    expect(row!.resolvedBy).toBe('webhook');
    expect((await prisma.cancellation.findUnique({ where: { id: s.cancellation.id } }))!.refundStatus).toBe('processed');
    expect((await prisma.order.findUnique({ where: { id: s.order.id } }))!.paymentStatus).toBe('refunded');
  });

  it('pedido de OUTRA loja -> ignorado', async () => {
    const a = await setup();
    const b = await setup();
    await prisma.directRefund.update({ where: { id: a.refund.id }, data: { status: 'uncertain', attempts: 1 } });

    const res = await send(b.store.id, a.order.asaasPaymentId!);

    expect(res.status).toBe(200);
    expect((await rowOf(a.refund.id))!.status).toBe('uncertain');
    expect((await prisma.cancellation.findUnique({ where: { id: a.cancellation.id } }))!.refundStatus).toBe('pending');
  });
});
