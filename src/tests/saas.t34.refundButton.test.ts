/**
 * Task 3.4 — Botão "Estornar": POST /api/orders/:id/refund-direct (dono/admin),
 * GET /api/admin/direct-refunds e POST /api/admin/direct-refunds/:id/resolve. Asaas mockado.
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

import request from 'supertest';
import app from '../app';
import asaasClient, { AsaasApiError } from '../services/asaas/client';
import logger from '../config/logger';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import { grantStoreConsent } from './helpers/storeConsent';
import { requestDirectRefund } from '../services/asaasLoja/refund';

const DOMAIN = '@saas34.test';
const STORE_KEY = '$aact_hmlg_LOJA_34XX';
const postAs = asaasClient.postAs as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); postAs.mockReset(); });

afterEach(async () => {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  await prisma.directRefund.deleteMany({ where: { storeId: { in: stores.map((s) => s.id) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function setup() {
  const owner = await createTestUser('lojista', DOMAIN);
  const other = await createTestUser('lojista', DOMAIN);
  const ceo = await createTestUser('ceo', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const store = await prisma.store.create({
    data: { ownerId: owner.userId, name: 'Loja 34', isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any,
  });
  await prisma.storeAsaasAccount.create({
    data: { storeId: store.id, apiKeyEncrypted: encryptSensitiveData(STORE_KEY), apiKeyLast4: '34XX', environment: 'sandbox', status: 'valid' },
  });
  await grantStoreConsent(store.id);
  const order = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId: store.id, totalValue: 50, deliveryFee: 0,
      status: 'cancelado', paymentMethod: 'pix', paymentStatus: 'paid', asaasChargeStatus: 'received',
      asaasPaymentId: `pay_34_${Math.random().toString(36).slice(2, 8)}`, paymentProvider: 'asaas_loja',
    } as any,
  });
  const cancellation = await prisma.cancellation.create({
    data: { orderId: order.id, cancelledBy: 'customer', reason: 'x', reasonCode: 'customer_request', refundAmount: 50, refundStatus: 'pending' } as any,
  });
  const refund = await requestDirectRefund({ orderId: order.id, cancellationId: cancellation.id, amount: 50, requestedBy: 'system' });
  return { owner, other, ceo, cliente, store, order, cancellation, refund };
}

type S = Awaited<ReturnType<typeof setup>>;
const post = (s: S, who: { token: string; userId: string; role: string }) =>
  request(app).post(`/api/orders/${s.order.id}/refund-direct`).set('Authorization', bearer(who)).send({});
const setStatus = (id: string, status: string, extra: any = {}) =>
  prisma.directRefund.update({ where: { id }, data: { status, ...extra } });

describe('POST /api/orders/:id/refund-direct', () => {
  it('dono -> 200, estorno executado, sem chave na resposta', async () => {
    const s = await setup();
    postAs.mockResolvedValue({ id: 'ref', status: 'DONE' });
    const r = await post(s, s.owner);
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('done');
    expect(postAs).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(r.body)).not.toContain(STORE_KEY);
    expect(JSON.stringify(r.body)).not.toContain('asaasPaymentId');
    expect((await prisma.cancellation.findUnique({ where: { id: s.cancellation.id } }))!.refundStatus).toBe('processed');
  });

  it('admin (ceo) -> 200; lojista de outra loja e cliente -> 403 sem chamar o Asaas', async () => {
    const s = await setup();
    expect((await post(s, s.other)).status).toBe(403);
    expect((await post(s, s.cliente)).status).toBe(403);
    expect(postAs).not.toHaveBeenCalled();
    postAs.mockResolvedValue({ id: 'ref' });
    expect((await post(s, s.ceo)).status).toBe(200);
    expect(postAs).toHaveBeenCalledTimes(1);
  });

  it('sem estorno para o pedido -> 404 REFUND_NOT_FOUND', async () => {
    const s = await setup();
    await prisma.directRefund.delete({ where: { id: s.refund.id } });
    const r = await post(s, s.owner);
    expect(r.status).toBe(404);
    expect(JSON.stringify(r.body)).toContain('REFUND_NOT_FOUND');
  });

  it.each([
    ['done', 'REFUND_ALREADY_DONE'],
    ['uncertain', 'REFUND_UNCERTAIN'],
    ['requested', 'REFUND_IN_PROGRESS'],
    ['failed_final', 'REFUND_FINAL_ADMIN_ONLY'],
  ])('status %s -> 409 %s (lojista), Asaas nao chamado', async (status, code) => {
    const s = await setup();
    await setStatus(s.refund.id, status);
    const r = await post(s, s.owner);
    expect(r.status).toBe(409);
    expect(JSON.stringify(r.body)).toContain(code);
    expect(postAs).not.toHaveBeenCalled();
  });

  it('failed (dono) -> reexecuta', async () => {
    const s = await setup();
    await setStatus(s.refund.id, 'failed', { attempts: 1, lastError: 'x' });
    postAs.mockResolvedValue({ id: 'ref' });
    const r = await post(s, s.owner);
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('done');
  });

  it('failed_final: admin reabre e executa', async () => {
    const s = await setup();
    await setStatus(s.refund.id, 'failed_final', { attempts: 6, lastError: 'x' });
    postAs.mockResolvedValue({ id: 'ref' });
    const r = await post(s, s.ceo);
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('done');
    expect(postAs).toHaveBeenCalledTimes(1);
  });

  it('tentativa que falha de novo -> 200 com status failed e lastError no corpo', async () => {
    const s = await setup();
    postAs.mockRejectedValue(new AsaasApiError(400, [{ code: 'x', description: 'Saldo insuficiente' } as any]));
    const r = await post(s, s.owner);
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('failed');
    expect(r.body.data.lastError).toBeTruthy();
    expect(JSON.stringify(r.body)).not.toContain(STORE_KEY);
  });

  it('dois POST simultaneos -> 1 chamada ao Asaas', async () => {
    const s = await setup();
    postAs.mockImplementation(() => new Promise((res) => setTimeout(() => res({ id: 'ref' }), 150)));
    const [a, b] = await Promise.all([post(s, s.owner), post(s, s.owner)]);
    expect(postAs).toHaveBeenCalledTimes(1);
    expect([a.status, b.status].every((x) => x === 200 || x === 409)).toBe(true);
  });
});

describe('admin direct-refunds', () => {
  it('GET lista com filtro de status; lojista -> 403', async () => {
    const s = await setup();
    await setStatus(s.refund.id, 'uncertain', { lastError: 'UNCERTAIN' });
    const r = await request(app).get('/api/admin/direct-refunds?status=uncertain').set('Authorization', bearer(s.ceo));
    expect(r.status).toBe(200);
    expect(r.body.data.map((x: any) => x.id)).toContain(s.refund.id);
    expect(JSON.stringify(r.body)).not.toContain(STORE_KEY);
    const none = await request(app).get('/api/admin/direct-refunds?status=done').set('Authorization', bearer(s.ceo));
    expect(none.body.data.map((x: any) => x.id)).not.toContain(s.refund.id);
    expect((await request(app).get('/api/admin/direct-refunds').set('Authorization', bearer(s.owner))).status).toBe(403);
  });

  it('resolve sem nota (ou curta) -> 400; com nota -> done, processed, resolvedBy e log AUDIT', async () => {
    const s = await setup();
    await setStatus(s.refund.id, 'uncertain', { lastError: 'UNCERTAIN' });
    const url = `/api/admin/direct-refunds/${s.refund.id}/resolve`;
    expect((await request(app).post(url).set('Authorization', bearer(s.ceo)).send({})).status).toBe(400);
    expect((await request(app).post(url).set('Authorization', bearer(s.ceo)).send({ note: 'curta' })).status).toBe(400);
    expect((await request(app).post(url).set('Authorization', bearer(s.owner)).send({ note: 'conferido no painel do Asaas' })).status).toBe(403);

    const info = jest.spyOn(logger, 'info').mockImplementation((() => undefined) as any);
    const r = await request(app).post(url).set('Authorization', bearer(s.ceo)).send({ note: 'conferido no painel do Asaas' });
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('done');
    const row = await prisma.directRefund.findUnique({ where: { id: s.refund.id } });
    expect(row!.status).toBe('done');
    expect(row!.resolvedBy).toBe(`admin:${s.ceo.userId}`);
    expect((await prisma.cancellation.findUnique({ where: { id: s.cancellation.id } }))!.refundStatus).toBe('processed');
    expect(info).toHaveBeenCalledWith('[refund][AUDIT]', expect.objectContaining({ refundId: s.refund.id, orderId: s.order.id, adminId: s.ceo.userId, note: 'conferido no painel do Asaas' }));
    expect(postAs).not.toHaveBeenCalled();
    info.mockRestore();

    const again = await request(app).post(url).set('Authorization', bearer(s.ceo)).send({ note: 'conferido no painel do Asaas' });
    expect(again.status).toBe(409);
  });
});

describe('GET /api/orders/:id traz o resumo do estorno', () => {
  it('dono e admin veem directRefund; o cliente nao', async () => {
    const s = await setup();
    await setStatus(s.refund.id, 'failed', { attempts: 2, lastError: 'Saldo insuficiente' });
    const get = (who: { token: string; userId: string; role: string }) =>
      request(app).get(`/api/orders/${s.order.id}`).set('Authorization', bearer(who));
    const o = await get(s.owner);
    expect(o.status).toBe(200);
    expect(o.body.directRefund).toEqual({ status: 'failed', amount: 50, lastError: 'Saldo insuficiente', attempts: 2 });
    expect((await get(s.ceo)).body.directRefund.status).toBe('failed');
    const c = await get(s.cliente);
    expect(c.status).toBe(200);
    expect(c.body).not.toHaveProperty('directRefund');
    expect(JSON.stringify(o.body)).not.toContain(STORE_KEY);
  });
});
