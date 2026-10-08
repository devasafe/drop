/**
 * Task 3.1 — DirectRefund: estorno do pedido direto com a chave da loja (Asaas mockado).
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

import asaasClient, { AsaasApiError } from '../services/asaas/client';
import { emitToRoom } from '../utils/socketEmitter';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser } from './helpers/authUser';
import { ownerIdForStore } from './helpers/storeOwner';
import { grantStoreConsent } from './helpers/storeConsent';
import { requestDirectRefund, executeDirectRefund, markDirectRefundDone } from '../services/asaasLoja/refund';
import { AsaasLojaProvider } from '../services/paymentProvider/asaasLojaProvider';
import { AppError } from '../utils/AppError';

const DOMAIN = '@saas31.test';
const STORE_KEY = '$aact_hmlg_LOJA_31XX';
const postAs = asaasClient.postAs as jest.Mock;
const emit = emitToRoom as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  postAs.mockReset();
  emit.mockReset();
});

afterEach(async () => {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  await prisma.directRefund.deleteMany({ where: { storeId: { in: stores.map((s) => s.id) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function setup(o: { provider?: 'asaas' | 'asaas_loja'; paymentStatus?: 'pending' | 'paid'; total?: number; withCancellation?: boolean } = {}) {
  const store = await prisma.store.create({
    data: { ownerId: await ownerIdForStore(DOMAIN), name: 'Loja 31', isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any,
  });
  await prisma.storeAsaasAccount.create({
    data: { storeId: store.id, apiKeyEncrypted: encryptSensitiveData(STORE_KEY), apiKeyLast4: '31XX', environment: 'sandbox', status: 'valid' },
  });
  await grantStoreConsent(store.id);
  const cliente = await createTestUser('cliente', DOMAIN);
  const order = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId: store.id, totalValue: o.total ?? 50, deliveryFee: 0,
      status: 'cancelado', paymentMethod: 'pix', paymentStatus: o.paymentStatus ?? 'paid', asaasChargeStatus: 'received',
      asaasPaymentId: `pay_31_${Math.random().toString(36).slice(2, 8)}`, paymentProvider: o.provider ?? 'asaas_loja',
    } as any,
  });
  const cancellation = o.withCancellation === false ? null : await prisma.cancellation.create({
    data: { orderId: order.id, cancelledBy: 'customer', reason: 'x', reasonCode: 'customer_request', refundAmount: 50, refundStatus: 'pending' } as any,
  });
  return { store, order, cancellation };
}

const req = (s: Awaited<ReturnType<typeof setup>>, amount = 50) =>
  requestDirectRefund({ orderId: s.order.id, cancellationId: s.cancellation?.id ?? null, amount, requestedBy: 'system' });

describe('requestDirectRefund', () => {
  it('e idempotente por pedido (1 linha)', async () => {
    const s = await setup();
    const a = await req(s);
    const b = await req(s);
    expect(b.id).toBe(a.id);
    expect(await prisma.directRefund.count({ where: { orderId: s.order.id } })).toBe(1);
    expect(a.status).toBe('pending');
    expect(a.asaasPaymentId).toBe(s.order.asaasPaymentId);
    expect(a.storeId).toBe(s.store.id);
  });

  it.each([
    ['pedido nao direto', { provider: 'asaas' as const }, 50],
    ['pedido nao pago', { paymentStatus: 'pending' as const }, 50],
    ['amount <= 0', {}, 0],
    ['amount negativo', {}, -5],
    ['amount > total', {}, 50.01],
  ])('rejeita %s com AppError 400 e sem linha', async (_n, opts, amount) => {
    const s = await setup(opts as any);
    await expect(req(s, amount as number)).rejects.toMatchObject({ statusCode: 400 });
    await expect(req(s, amount as number)).rejects.toBeInstanceOf(AppError);
    expect(await prisma.directRefund.count({ where: { orderId: s.order.id } })).toBe(0);
  });
});

describe('executeDirectRefund', () => {
  it('Asaas OK -> done, postAs com a chave da loja e value explicito, atualiza cancelamento e pedido', async () => {
    const s = await setup();
    const r = await req(s, 50);
    postAs.mockResolvedValue({ id: 'ref', status: 'DONE' });

    expect(await executeDirectRefund(r.id)).toBe('done');

    expect(postAs).toHaveBeenCalledTimes(1);
    expect(postAs).toHaveBeenCalledWith(STORE_KEY, `/payments/${s.order.asaasPaymentId}/refund`, expect.objectContaining({ value: 50, description: expect.any(String) }));
    const row = await prisma.directRefund.findUnique({ where: { id: r.id } });
    expect(row!.status).toBe('done');
    expect(row!.resolvedBy).toBe('api');
    expect(row!.doneAt).toBeInstanceOf(Date);
    expect((await prisma.cancellation.findUnique({ where: { id: s.cancellation!.id } }))!.refundStatus).toBe('processed');
    const o = await prisma.order.findUnique({ where: { id: s.order.id } });
    expect(o!.paymentStatus).toBe('refunded');
    expect(o!.asaasChargeStatus).toBe('refunded');
  });

  it('concorrencia: dois execute em paralelo -> postAs 1 vez', async () => {
    const s = await setup();
    const r = await req(s);
    postAs.mockImplementation(() => new Promise((res) => setTimeout(() => res({ id: 'ref' }), 50)));
    await Promise.all([executeDirectRefund(r.id), executeDirectRefund(r.id)]);
    expect(postAs).toHaveBeenCalledTimes(1);
    expect((await prisma.directRefund.findUnique({ where: { id: r.id } }))!.status).toBe('done');
  });

  it('AsaasApiError 400 -> failed, attempts 1, nextAttemptAt +5min, cancelamento segue pending, notifica loja e admin', async () => {
    const s = await setup();
    const r = await req(s);
    postAs.mockRejectedValue(new AsaasApiError(400, [{ code: 'x', description: 'Saldo insuficiente' } as any]));
    const before = Date.now();

    expect(await executeDirectRefund(r.id)).toBe('failed');

    const row = await prisma.directRefund.findUnique({ where: { id: r.id } });
    expect(row!.status).toBe('failed');
    expect(row!.attempts).toBe(1);
    expect(row!.lastError).toContain('Saldo insuficiente');
    const delta = row!.nextAttemptAt.getTime() - before;
    expect(delta).toBeGreaterThan(5 * 60000 - 5000);
    expect(delta).toBeLessThan(5 * 60000 + 5000);
    expect((await prisma.cancellation.findUnique({ where: { id: s.cancellation!.id } }))!.refundStatus).toBe('pending');
    const rooms = emit.mock.calls.filter((c) => c[1] === 'refund:failed').map((c) => c[0]);
    expect(rooms).toEqual(expect.arrayContaining([`store:${s.store.id}`, 'admin']));
    expect(JSON.stringify(emit.mock.calls)).not.toContain(STORE_KEY);
  });

  it('AsaasApiError 401 -> conta da loja invalid e estorno failed', async () => {
    const s = await setup();
    const r = await req(s);
    postAs.mockRejectedValue(new AsaasApiError(401, [{ code: 'invalid_access_token', description: 'chave invalida' } as any]));

    expect(await executeDirectRefund(r.id)).toBe('failed');

    expect((await prisma.storeAsaasAccount.findUnique({ where: { storeId: s.store.id } }))!.status).toBe('invalid');
    expect((await prisma.directRefund.findUnique({ where: { id: r.id } }))!.status).toBe('failed');
  });

  it.each([
    ['timeout/rede', () => new Error('timeout of 15000ms exceeded')],
    ['5xx', () => new AsaasApiError(503, [])],
  ])('%s -> uncertain, sem retentativa automatica, alerta no admin', async (_n, mk) => {
    const s = await setup();
    const r = await req(s);
    postAs.mockRejectedValue(mk());

    expect(await executeDirectRefund(r.id)).toBe('uncertain');
    const row = await prisma.directRefund.findUnique({ where: { id: r.id } });
    expect(row!.status).toBe('uncertain');
    expect(row!.lastError).toBe('UNCERTAIN');
    expect(emit.mock.calls.some((c) => c[0] === 'admin' && c[1] === 'refund:uncertain')).toBe(true);

    expect(await executeDirectRefund(r.id)).toBe('uncertain');
    expect(postAs).toHaveBeenCalledTimes(1);
  });

  it.each(['done', 'uncertain', 'failed_final', 'requested'])('estorno %s -> no-op, nenhuma chamada', async (st) => {
    const s = await setup();
    const r = await req(s);
    await prisma.directRefund.update({ where: { id: r.id }, data: { status: st } });
    expect(await executeDirectRefund(r.id)).toBe(st);
    expect(postAs).not.toHaveBeenCalled();
  });

  it('estorno failed pode ser reexecutado', async () => {
    const s = await setup();
    const r = await req(s);
    await prisma.directRefund.update({ where: { id: r.id }, data: { status: 'failed', attempts: 1 } });
    postAs.mockResolvedValue({ id: 'ref' });
    expect(await executeDirectRefund(r.id)).toBe('done');
    expect((await prisma.directRefund.findUnique({ where: { id: r.id } }))!.attempts).toBe(2);
  });
});

describe('markDirectRefundDone', () => {
  it('e idempotente e registra a origem', async () => {
    const s = await setup();
    const r = await req(s);
    expect(await markDirectRefundDone(s.order.id, 'webhook')).toBe(true);
    expect(await markDirectRefundDone(s.order.id, 'webhook')).toBe(false);
    const row = await prisma.directRefund.findUnique({ where: { id: r.id } });
    expect(row!.status).toBe('done');
    expect(row!.resolvedBy).toBe('webhook');
    expect((await prisma.cancellation.findUnique({ where: { id: s.cancellation!.id } }))!.refundStatus).toBe('processed');
  });

  it('sem linha de estorno -> false', async () => {
    const s = await setup();
    expect(await markDirectRefundDone(s.order.id, 'admin')).toBe(false);
  });
});

describe('AsaasLojaProvider.refund', () => {
  it('done so quando o DirectRefund terminou done', async () => {
    const s = await setup();
    postAs.mockResolvedValue({ id: 'ref' });
    const out = await new AsaasLojaProvider().refund(s.order.id, s.order.asaasPaymentId!, 50);
    expect(out).toEqual({ status: 'done' });
  });

  it('failed com errorMessage quando o Asaas recusa', async () => {
    const s = await setup();
    postAs.mockRejectedValue(new AsaasApiError(400, [{ code: 'x', description: 'Saldo insuficiente' } as any]));
    const out = await new AsaasLojaProvider().refund(s.order.id, s.order.asaasPaymentId!, 50);
    expect(out.status).toBe('failed');
    expect(out.errorMessage).toBeTruthy();
  });

  it('failed quando a resposta e incerta', async () => {
    const s = await setup();
    postAs.mockRejectedValue(new Error('ECONNRESET'));
    const out = await new AsaasLojaProvider().refund(s.order.id, s.order.asaasPaymentId!, 50);
    expect(out.status).toBe('failed');
  });

  it('failed (sem lancar) quando o pedido nao e elegivel', async () => {
    const s = await setup({ provider: 'asaas' });
    const out = await new AsaasLojaProvider().refund(s.order.id, s.order.asaasPaymentId!, 50);
    expect(out.status).toBe('failed');
  });
});
