/**
 * Revisão final — estorno direto (C1, I4/M9, I7, M8): resposta do POST × trava de autorização,
 * aceito-em-andamento concluído pelo webhook, reaper, alertas ao admin, pending órfão e 408.
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

import crypto from 'crypto';
import request from 'supertest';
import app from '../app';
import asaasClient from '../services/asaas/client';
import { emitToRoom, emitAdminNotification } from '../utils/socketEmitter';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser } from './helpers/authUser';
import { ownerIdForStore } from './helpers/storeOwner';
import { grantStoreConsent } from './helpers/storeConsent';
import { requestDirectRefund, executeDirectRefund } from '../services/asaasLoja/refund';
import { runDirectRefunds } from '../jobs/directRefunds.job';

const DOMAIN = '@saas41.test';
const STORE_KEY = '$aact_hmlg_LOJA_41XX';
const WH_TOKEN = 'd'.repeat(48);
const AUTH_TOKEN = 'tok_auth_loja_41_abcdefabcdefabcdefabcdef';
const sha = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const postAs = asaasClient.postAs as jest.Mock;
const emit = emitToRoom as jest.Mock;
const adminNotify = emitAdminNotification as jest.Mock;
const MIN = 60000;
const HOUR = 60 * MIN;

beforeEach(() => {
  jest.clearAllMocks();
  postAs.mockReset();
  emit.mockReset();
  adminNotify.mockReset();
});

afterEach(async () => {
  await prisma.webhookEvent.deleteMany({ where: { eventId: { contains: 'evt_t41_' } } });
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  await prisma.directRefund.deleteMany({ where: { storeId: { in: stores.map((s) => s.id) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function setup() {
  const store = await prisma.store.create({
    data: { ownerId: await ownerIdForStore(DOMAIN), name: 'Loja 41', isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any,
  });
  await prisma.storeAsaasAccount.create({
    data: {
      storeId: store.id, apiKeyEncrypted: encryptSensitiveData(STORE_KEY), apiKeyLast4: '41XX', environment: 'sandbox', status: 'valid',
      paymentWebhookId: 'wh_41', paymentWebhookTokenHash: sha(WH_TOKEN), authWebhookTokenHash: sha(AUTH_TOKEN),
    },
  });
  await grantStoreConsent(store.id);
  const cliente = await createTestUser('cliente', DOMAIN);
  const order = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId: store.id, totalValue: 50, deliveryFee: 0,
      status: 'cancelado', paymentMethod: 'pix', paymentStatus: 'paid', asaasChargeStatus: 'received',
      asaasPaymentId: `pay_41_${Math.random().toString(36).slice(2, 8)}`, paymentProvider: 'asaas_loja',
    } as any,
  });
  const cancellation = await prisma.cancellation.create({
    data: { orderId: order.id, cancelledBy: 'customer', reason: 'x', reasonCode: 'customer_request', refundAmount: 30, refundStatus: 'pending' } as any,
  });
  const refund = await requestDirectRefund({ orderId: order.id, cancellationId: cancellation.id, amount: 30, requestedBy: 'system' });
  return { store, order, cancellation, refund };
}

const rowOf = (id: string) => prisma.directRefund.findUnique({ where: { id } }) as Promise<any>;

const authorize = (storeId: string, paymentId: string, over: any = {}) =>
  request(app).post(`/webhooks/asaas/loja/${storeId}/autorizacao`).set('asaas-access-token', AUTH_TOKEN)
    .send({ type: 'PIX_REFUND', pixRefund: { paymentId, value: 30, ...over } });

const refundedEvent = (storeId: string, paymentId: string, event = 'PAYMENT_REFUNDED') =>
  request(app).post(`/webhooks/asaas/loja/${storeId}`).set('asaas-access-token', WH_TOKEN)
    .send({ id: `evt_t41_${Math.random().toString(36).slice(2, 10)}`, event, payment: { id: paymentId, status: 'REFUNDED', value: 50 } });

describe('C1 — autorização PIX_REFUND chegando depois do done', () => {
  it('done recente (< 24 h): APPROVED uma vez e vincula; mesmo id → APPROVED; outro id → REFUSED ALREADY_AUTHORIZED', async () => {
    const s = await setup();
    postAs.mockResolvedValue({ id: s.order.asaasPaymentId, status: 'REFUNDED' });
    expect(await executeDirectRefund(s.refund.id)).toBe('done');

    const r1 = await authorize(s.store.id, s.order.asaasPaymentId!, { id: 'rfd_1' });
    expect(r1.body).toEqual({ status: 'APPROVED' });
    const row = await rowOf(s.refund.id);
    expect(row.authorizedAt).toBeInstanceOf(Date);
    expect(row.asaasRefundId).toBe('rfd_1');

    expect((await authorize(s.store.id, s.order.asaasPaymentId!, { id: 'rfd_1' })).body).toEqual({ status: 'APPROVED' });
    const r3 = await authorize(s.store.id, s.order.asaasPaymentId!, { id: 'rfd_2' });
    expect(r3.body).toEqual({ status: 'REFUSED', refuseReason: 'ALREADY_AUTHORIZED' });
    expect((await rowOf(s.refund.id)).asaasRefundId).toBe('rfd_1');
  });

  it('done antigo (> 24 h), valor diferente ou outra loja → REFUSED', async () => {
    const s = await setup();
    await prisma.directRefund.update({ where: { id: s.refund.id }, data: { status: 'done', doneAt: new Date(Date.now() - 25 * HOUR) } });
    expect((await authorize(s.store.id, s.order.asaasPaymentId!, { id: 'rfd_1' })).body.status).toBe('REFUSED');

    await prisma.directRefund.update({ where: { id: s.refund.id }, data: { doneAt: new Date() } });
    expect((await authorize(s.store.id, s.order.asaasPaymentId!, { id: 'rfd_1', value: 29.99 })).body.status).toBe('REFUSED');
    expect((await rowOf(s.refund.id)).authorizedAt).toBeNull();
  });

  it('requested: vincula o id do estorno; segundo id diferente → REFUSED', async () => {
    const s = await setup();
    await prisma.directRefund.update({ where: { id: s.refund.id }, data: { status: 'requested' } });
    expect((await authorize(s.store.id, s.order.asaasPaymentId!, { id: 'rfd_a' })).body).toEqual({ status: 'APPROVED' });
    expect((await authorize(s.store.id, s.order.asaasPaymentId!, { id: 'rfd_b' })).body).toEqual({ status: 'REFUSED', refuseReason: 'ALREADY_AUTHORIZED' });
  });
});

describe('C1 — 200 do POST com estorno em andamento', () => {
  it('REFUND_IN_PROGRESS → requested com acceptedAt; o webhook PAYMENT_REFUNDED conclui', async () => {
    const s = await setup();
    postAs.mockResolvedValue({ id: s.order.asaasPaymentId, status: 'REFUND_IN_PROGRESS' });

    expect(await executeDirectRefund(s.refund.id)).toBe('requested');

    let row = await rowOf(s.refund.id);
    expect(row.status).toBe('requested');
    expect(row.acceptedAt).toBeInstanceOf(Date);
    expect((await prisma.cancellation.findUnique({ where: { id: s.cancellation.id } }))!.refundStatus).toBe('pending');
    expect((await prisma.order.findUnique({ where: { id: s.order.id } }))!.paymentStatus).toBe('paid');

    expect((await authorize(s.store.id, s.order.asaasPaymentId!, { id: 'rfd_x' })).body).toEqual({ status: 'APPROVED' });

    expect((await refundedEvent(s.store.id, s.order.asaasPaymentId!)).status).toBe(200);
    row = await rowOf(s.refund.id);
    expect(row.status).toBe('done');
    expect(row.resolvedBy).toBe('webhook');
    expect((await prisma.cancellation.findUnique({ where: { id: s.cancellation.id } }))!.refundStatus).toBe('processed');
  });

  it('refunds[] com o estorno PENDING também fica requested+acceptedAt', async () => {
    const s = await setup();
    postAs.mockResolvedValue({ id: s.order.asaasPaymentId, status: 'RECEIVED', refunds: [{ id: 'rfd_p', status: 'PENDING', value: 30 }] });
    expect(await executeDirectRefund(s.refund.id)).toBe('requested');
    expect((await rowOf(s.refund.id)).acceptedAt).toBeInstanceOf(Date);
  });

  it('reaper: aceito há 2 h não vira uncertain; aceito há 25 h → uncertain ACCEPTED_NOT_CONFIRMED', async () => {
    const s = await setup();
    await prisma.directRefund.update({
      where: { id: s.refund.id },
      data: { status: 'requested', attempts: 1, acceptedAt: new Date(Date.now() - 2 * HOUR), updatedAt: new Date(Date.now() - 2 * HOUR) } as any,
    });
    await runDirectRefunds();
    expect((await rowOf(s.refund.id)).status).toBe('requested');

    await prisma.directRefund.update({
      where: { id: s.refund.id },
      data: { acceptedAt: new Date(Date.now() - 25 * HOUR), updatedAt: new Date(Date.now() - 25 * HOUR) } as any,
    });
    await runDirectRefunds();
    const row = await rowOf(s.refund.id);
    expect(row.status).toBe('uncertain');
    expect(row.lastError).toBe('ACCEPTED_NOT_CONFIRMED');
    expect(postAs).not.toHaveBeenCalled();
  });
});
