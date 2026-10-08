/**
 * Task 2.3 — envio, retentativa e reconciliação do Pix ao motoboy (modo direto).
 *  - job runMotoboyTransfers (claim atômico, teto diário P10, backoff P5, resposta incerta R6);
 *  - webhook da loja TRANSFER_DONE / TRANSFER_FAILED / TRANSFER_CANCELLED;
 *  - bloqueio do aceite de pedido direto com transferência vencida.
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
import asaasClient, { AsaasApiError } from '../services/asaas/client';
import { emitToRoom, emitAdminNotification } from '../utils/socketEmitter';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import { grantStoreConsent } from './helpers/storeConsent';
import { runMotoboyTransfers } from '../jobs/motoboyTransfers.job';

const DOMAIN = '@saas23.test';
const STORE_KEY = '$aact_hmlg_LOJA_23XX';
const WH_TOKEN = 'd'.repeat(48);
const AUTH_TOKEN = 'e'.repeat(48);
const PIX = '12345678909';
const sha = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const postAs = asaasClient.postAs as jest.Mock;
const getAs = asaasClient.getAs as jest.Mock;
const emit = emitToRoom as jest.Mock;
const adminNotify = emitAdminNotification as jest.Mock;
const MIN = 60000;
const HOUR = 60 * MIN;

let restore: () => Promise<void>;
beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); });

beforeEach(async () => {
  jest.clearAllMocks();
  postAs.mockReset();
  getAs.mockReset();
  emit.mockReset();
  adminNotify.mockReset();
  await updatePlatformConfig({
    directTransfersEnabled: true, directTransferMaxAmount: 150, directTransferDailyMaxPerStore: 3000, transferBlockHours: 24,
  } as any, 'test');
});

afterEach(async () => {
  await prisma.webhookEvent.deleteMany({ where: { eventId: { contains: 'evt_t23_' } } });
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  const ids = stores.map((s) => s.id);
  const orders = await prisma.order.findMany({ where: { storeId: { in: ids } }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  await prisma.motoboyTransfer.deleteMany({ where: { storeId: { in: ids } } });
  await prisma.deliveryInvoice.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.payout.deleteMany({ where: { orderId: { in: orderIds } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function setupStore() {
  const lojista = await createTestUser('lojista', DOMAIN);
  const motoboy = await createTestUser('motoboy', DOMAIN);
  const store = await prisma.store.create({
    data: { ownerId: lojista.userId, name: 'Loja 23', plan: 1, isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any,
  });
  await prisma.storeAsaasAccount.create({
    data: {
      storeId: store.id, apiKeyEncrypted: encryptSensitiveData(STORE_KEY), apiKeyLast4: '23XX', environment: 'sandbox', status: 'valid',
      paymentWebhookId: 'wh_23', paymentWebhookTokenHash: sha(WH_TOKEN),
      authWebhookTokenHash: sha(AUTH_TOKEN), authWebhookConfirmedAt: new Date(),
    },
  });
  await grantStoreConsent(store.id);
  return { lojista, motoboy, store };
}

let seq = 0;
async function mkTransfer(storeId: string, motoboyId: string, o: Partial<{ status: string; amount: number; attempts: number; nextAttemptAt: Date; orderId: string; key: string; lastError: string }> = {}) {
  seq += 1;
  return prisma.motoboyTransfer.create({
    data: {
      deliveryId: `del23-${Date.now()}-${seq}`,
      orderId: o.orderId ?? `ordabc23-${seq}`,
      storeId,
      motoboyId,
      amount: o.amount ?? 12.5,
      pixKeyEncrypted: o.key === '' ? '' : encryptSensitiveData(o.key ?? PIX),
      pixKeyType: 'CPF',
      status: o.status ?? 'pending',
      attempts: o.attempts ?? 0,
      lastError: o.lastError ?? null,
      nextAttemptAt: o.nextAttemptAt ?? new Date(Date.now() - MIN),
    },
  });
}
const rowOf = (id: string) => prisma.motoboyTransfer.findUnique({ where: { id } });
const fail400 = () => new AsaasApiError(400, [{ code: 'x', description: 'Saldo insuficiente' } as any]);
const transfersPosted = () => postAs.mock.calls.filter((c) => c[1] === '/transfers');

describe('runMotoboyTransfers — envio', () => {
  it('directTransfersEnabled=false → não envia nada, linhas ficam pending', async () => {
    await updatePlatformConfig({ directTransfersEnabled: false } as any, 'test');
    const { store, motoboy } = await setupStore();
    const t = await mkTransfer(store.id, motoboy.userId);

    const out = await runMotoboyTransfers();

    expect(out).toEqual({ sent: 0, failed: 0 });
    expect(postAs).not.toHaveBeenCalled();
    expect((await rowOf(t.id))!.status).toBe('pending');
  });

  it('pending → requested + POST /transfers com a chave da loja, Pix do snapshot e externalReference = id', async () => {
    const { store, motoboy } = await setupStore();
    const t = await mkTransfer(store.id, motoboy.userId, { orderId: 'abcdef123456' });
    postAs.mockResolvedValue({ id: 'tra_23_1', status: 'PENDING' });

    const out = await runMotoboyTransfers();

    expect(out).toEqual({ sent: 1, failed: 0 });
    expect(postAs).toHaveBeenCalledTimes(1);
    expect(postAs).toHaveBeenCalledWith(STORE_KEY, '/transfers', {
      value: 12.5,
      operationType: 'PIX',
      pixAddressKey: PIX,
      pixAddressKeyType: 'CPF',
      externalReference: t.id,
      description: 'DROP entrega abcdef',
    });
    const row = await rowOf(t.id);
    expect(row!.status).toBe('requested'); // done só pelo webhook
    expect(row!.attempts).toBe(1);
    expect(row!.asaasTransferId).toBe('tra_23_1');
    expect(row!.doneAt).toBeNull();
  });

  it('failed vencido é reenviado; failed com nextAttemptAt futuro não', async () => {
    const { store, motoboy } = await setupStore();
    const due = await mkTransfer(store.id, motoboy.userId, { status: 'failed', attempts: 1 });
    const later = await mkTransfer(store.id, motoboy.userId, { status: 'failed', attempts: 1, nextAttemptAt: new Date(Date.now() + 10 * MIN) });
    postAs.mockResolvedValue({ id: 'tra_23_2' });

    await runMotoboyTransfers();

    expect(postAs).toHaveBeenCalledTimes(1);
    expect(postAs.mock.calls[0][2].externalReference).toBe(due.id);
    expect((await rowOf(due.id))!.status).toBe('requested');
    expect((await rowOf(due.id))!.attempts).toBe(2);
    expect((await rowOf(later.id))!.status).toBe('failed');
  });

  it.each(['requested', 'uncertain', 'done', 'failed_final'])('%s → o job não reenvia', async (st) => {
    const { store, motoboy } = await setupStore();
    const t = await mkTransfer(store.id, motoboy.userId, { status: st, attempts: 1 });
    await runMotoboyTransfers();
    expect(transfersPosted()).toHaveLength(0);
    expect(getAs).not.toHaveBeenCalled();
    expect((await rowOf(t.id))!.status).toBe(st);
  });

  it('duas execuções concorrentes → POST /transfers 1 vez', async () => {
    const { store, motoboy } = await setupStore();
    const t = await mkTransfer(store.id, motoboy.userId);
    postAs.mockImplementation(() => new Promise((res) => setTimeout(() => res({ id: 'tra_23_c' }), 50)));

    await Promise.all([runMotoboyTransfers(), runMotoboyTransfers()]);

    expect(transfersPosted()).toHaveLength(1);
    expect((await rowOf(t.id))!.status).toBe('requested');
    expect((await rowOf(t.id))!.attempts).toBe(1);
  });

  it('resposta chega DEPOIS da autorização: mantém authorizedAt e o mesmo id', async () => {
    const { store, motoboy } = await setupStore();
    const t = await mkTransfer(store.id, motoboy.userId);
    const authAt = new Date();
    postAs.mockImplementation(async () => {
      await prisma.motoboyTransfer.updateMany({ where: { id: t.id, status: 'requested' }, data: { authorizedAt: authAt, asaasTransferId: 'tra_23_a' } });
      return { id: 'tra_23_a' };
    });

    await runMotoboyTransfers();

    const row = await rowOf(t.id);
    expect(row!.asaasTransferId).toBe('tra_23_a');
    expect(row!.authorizedAt?.getTime()).toBe(authAt.getTime());
    expect(row!.status).toBe('requested');
  });

  it('id já vinculado diferente do devolvido pelo POST → não sobrescreve e alerta o admin', async () => {
    const { store, motoboy } = await setupStore();
    const t = await mkTransfer(store.id, motoboy.userId);
    postAs.mockImplementation(async () => {
      await prisma.motoboyTransfer.updateMany({ where: { id: t.id }, data: { asaasTransferId: 'tra_23_OUTRA' } });
      return { id: 'tra_23_b' };
    });

    await runMotoboyTransfers();

    expect((await rowOf(t.id))!.asaasTransferId).toBe('tra_23_OUTRA');
    expect(adminNotify).toHaveBeenCalled();
  });

  it('retentativa limpa vínculo e autorização da tentativa anterior (2.2 aprova o novo id)', async () => {
    const { store, motoboy } = await setupStore();
    const t = await mkTransfer(store.id, motoboy.userId, { status: 'failed', attempts: 1 });
    await prisma.motoboyTransfer.update({ where: { id: t.id }, data: { asaasTransferId: 'tra_23_velha', authorizedAt: new Date() } });
    let during: any = null;
    postAs.mockImplementation(async () => {
      during = await rowOf(t.id);
      return { id: 'tra_23_nova' };
    });

    await runMotoboyTransfers();

    expect(during.asaasTransferId).toBeNull();
    expect(during.authorizedAt).toBeNull();
    expect((await rowOf(t.id))!.asaasTransferId).toBe('tra_23_nova');
  });
});

describe('limite diário por loja (P10)', () => {
  it('requested|done do dia + esta > teto → failed DAILY_LIMIT, alerta no admin, sem Asaas', async () => {
    const { store, motoboy } = await setupStore();
    await mkTransfer(store.id, motoboy.userId, { status: 'done', amount: 2900 });
    await mkTransfer(store.id, motoboy.userId, { status: 'requested', amount: 50, attempts: 1 });
    const t = await mkTransfer(store.id, motoboy.userId, { amount: 50.01 });

    const out = await runMotoboyTransfers();

    expect(transfersPosted()).toHaveLength(0);
    expect(out).toEqual({ sent: 0, failed: 1 });
    const row = await rowOf(t.id);
    expect(row!.status).toBe('failed');
    expect(row!.lastError).toBe('DAILY_LIMIT');
    expect(row!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(adminNotify).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(adminNotify.mock.calls)).not.toContain(PIX);
  });

  it('exatamente no teto ainda envia', async () => {
    const { store, motoboy } = await setupStore();
    await mkTransfer(store.id, motoboy.userId, { status: 'done', amount: 2950 });
    const t = await mkTransfer(store.id, motoboy.userId, { amount: 50 });
    postAs.mockResolvedValue({ id: 'tra_23_teto' });

    await runMotoboyTransfers();

    expect(transfersPosted()).toHaveLength(1);
    expect((await rowOf(t.id))!.status).toBe('requested');
  });

  it('transferências de outro dia e de outra loja não contam', async () => {
    const { store, motoboy } = await setupStore();
    const other = await setupStore();
    const old = await mkTransfer(store.id, motoboy.userId, { status: 'done', amount: 2990 });
    await prisma.motoboyTransfer.update({ where: { id: old.id }, data: { updatedAt: new Date(Date.now() - 48 * HOUR), doneAt: new Date(Date.now() - 48 * HOUR) } });
    await mkTransfer(other.store.id, other.motoboy.userId, { status: 'done', amount: 2990 });
    const t = await mkTransfer(store.id, motoboy.userId, { amount: 100 });
    postAs.mockResolvedValue({ id: 'tra_23_d' });

    await runMotoboyTransfers();

    expect((await rowOf(t.id))!.status).toBe('requested');
  });
});

describe('falhas do Asaas', () => {
  it('AsaasApiError 400 → failed com backoff P5 (5 min), nunca done', async () => {
    const { store, motoboy } = await setupStore();
    const t = await mkTransfer(store.id, motoboy.userId);
    postAs.mockRejectedValue(fail400());
    const before = Date.now();

    const out = await runMotoboyTransfers();

    expect(out).toEqual({ sent: 0, failed: 1 });
    const row = await rowOf(t.id);
    expect(row!.status).toBe('failed');
    expect(row!.attempts).toBe(1);
    expect(row!.lastError).toContain('Saldo insuficiente');
    const wait = row!.nextAttemptAt.getTime() - before;
    expect(wait).toBeGreaterThanOrEqual(5 * MIN - 1000);
    expect(wait).toBeLessThan(6 * MIN);
  });

  it('5ª falha espera 6 h; 6ª falha → failed_final + alerta no admin', async () => {
    const { store, motoboy } = await setupStore();
    const fifth = await mkTransfer(store.id, motoboy.userId, { status: 'failed', attempts: 4 });
    const sixth = await mkTransfer(store.id, motoboy.userId, { status: 'failed', attempts: 5 });
    postAs.mockRejectedValue(fail400());
    const before = Date.now();

    await runMotoboyTransfers();

    const r5 = await rowOf(fifth.id);
    expect(r5!.status).toBe('failed');
    expect(r5!.nextAttemptAt.getTime() - before).toBeGreaterThanOrEqual(360 * MIN - 1000);
    const r6 = await rowOf(sixth.id);
    expect(r6!.status).toBe('failed_final');
    expect(r6!.attempts).toBe(6);
    expect(adminNotify.mock.calls.some((c) => String(c[0].tag).includes(sixth.id))).toBe(true);
  });

  it.each([
    ['timeout', () => new Error('Timeout (20000ms) na chamada Asaas POST /transfers')],
    ['5xx', () => new AsaasApiError(502, [{ code: 'x', description: 'Bad gateway' } as any])],
  ])('%s → uncertain; próxima volta não reenvia nem consulta', async (_n, mkErr) => {
    const { store, motoboy } = await setupStore();
    const t = await mkTransfer(store.id, motoboy.userId);
    postAs.mockRejectedValueOnce(mkErr());

    await runMotoboyTransfers();
    expect((await rowOf(t.id))!.status).toBe('uncertain');
    expect(adminNotify).toHaveBeenCalled();

    await prisma.motoboyTransfer.update({ where: { id: t.id }, data: { nextAttemptAt: new Date(Date.now() - HOUR) } });
    await runMotoboyTransfers();
    expect(transfersPosted()).toHaveLength(1);
    expect((await rowOf(t.id))!.status).toBe('uncertain');
  });

  it('loja sem conta válida → failed sem chamar o Asaas', async () => {
    const { store, motoboy } = await setupStore();
    await prisma.storeAsaasAccount.update({ where: { storeId: store.id }, data: { status: 'invalid' } });
    const t = await mkTransfer(store.id, motoboy.userId);

    await runMotoboyTransfers();

    expect(postAs).not.toHaveBeenCalled();
    expect((await rowOf(t.id))!.status).toBe('failed');
  });

  it('requested preso há mais de 10 min → uncertain, sem reenviar', async () => {
    const { store, motoboy } = await setupStore();
    const t = await mkTransfer(store.id, motoboy.userId, { status: 'requested', attempts: 1 });
    await prisma.motoboyTransfer.update({ where: { id: t.id }, data: { updatedAt: new Date(Date.now() - 11 * MIN) } });

    await runMotoboyTransfers();

    const row = await rowOf(t.id);
    expect(row!.status).toBe('uncertain');
    expect(row!.lastError).toBe('STUCK_REQUESTED');
    expect(postAs).not.toHaveBeenCalled();
  });
});

describe('webhook da loja TRANSFER_*', () => {
  const hook = (storeId: string, body: any) =>
    request(app).post(`/webhooks/asaas/loja/${storeId}`).set('asaas-access-token', WH_TOKEN).send(body);
  const body = (event: string, t: { id: string }, asaasId: string, n = Math.random().toString(36).slice(2, 8)) => ({
    id: `evt_t23_${n}`, event, transfer: { id: asaasId, externalReference: t.id, status: event.replace('TRANSFER_', ''), value: 12.5 },
  });

  it('TRANSFER_DONE → done, doneAt e aviso em user:<motoboyId> (idempotente)', async () => {
    const { store, motoboy } = await setupStore();
    const t = await mkTransfer(store.id, motoboy.userId, { status: 'requested', attempts: 1 });
    await prisma.motoboyTransfer.update({ where: { id: t.id }, data: { asaasTransferId: 'tra_w1' } });
    const b = body('TRANSFER_DONE', t, 'tra_w1', 'done1');

    const res = await hook(store.id, b);
    expect(res.status).toBe(200);
    const row = await rowOf(t.id);
    expect(row!.status).toBe('done');
    expect(row!.doneAt).toBeInstanceOf(Date);
    const toMotoboy = emit.mock.calls.filter((c) => c[0] === `user:${motoboy.userId}`);
    expect(toMotoboy).toHaveLength(1);
    expect(JSON.stringify(emit.mock.calls)).not.toContain(PIX);

    const dup = await hook(store.id, b);
    expect(dup.status).toBe(200);
    expect(emit.mock.calls.filter((c) => c[0] === `user:${motoboy.userId}`)).toHaveLength(1);
  });

  it('TRANSFER_DONE antes da resposta do POST (id ainda não gravado) → done e vincula o id', async () => {
    const { store, motoboy } = await setupStore();
    const t = await mkTransfer(store.id, motoboy.userId, { status: 'requested', attempts: 1 });
    const res = await hook(store.id, body('TRANSFER_DONE', t, 'tra_w2'));
    expect(res.status).toBe(200);
    const row = await rowOf(t.id);
    expect(row!.status).toBe('done');
    expect(row!.asaasTransferId).toBe('tra_w2');
  });

  it('TRANSFER_DONE resolve uncertain', async () => {
    const { store, motoboy } = await setupStore();
    const t = await mkTransfer(store.id, motoboy.userId, { status: 'uncertain', attempts: 1 });
    await hook(store.id, body('TRANSFER_DONE', t, 'tra_w3'));
    expect((await rowOf(t.id))!.status).toBe('done');
  });

  it('TRANSFER_DONE com id do Asaas diferente do vinculado → não muda e alerta o admin', async () => {
    const { store, motoboy } = await setupStore();
    const t = await mkTransfer(store.id, motoboy.userId, { status: 'requested', attempts: 1 });
    await prisma.motoboyTransfer.update({ where: { id: t.id }, data: { asaasTransferId: 'tra_w4' } });
    const res = await hook(store.id, body('TRANSFER_DONE', t, 'tra_w4_outra'));
    expect(res.status).toBe(200);
    expect((await rowOf(t.id))!.status).toBe('requested');
    expect(adminNotify).toHaveBeenCalled();
  });

  it.each(['TRANSFER_FAILED', 'TRANSFER_CANCELLED'])('%s → failed com retentativa (backoff P5)', async (ev) => {
    const { store, motoboy } = await setupStore();
    const t = await mkTransfer(store.id, motoboy.userId, { status: 'requested', attempts: 2 });
    await prisma.motoboyTransfer.update({ where: { id: t.id }, data: { asaasTransferId: 'tra_w5' } });
    const before = Date.now();

    const res = await hook(store.id, body(ev, t, 'tra_w5'));

    expect(res.status).toBe(200);
    const row = await rowOf(t.id);
    expect(row!.status).toBe('failed');
    expect(row!.lastError).toBe(ev);
    expect(row!.nextAttemptAt.getTime() - before).toBeGreaterThanOrEqual(15 * MIN - 1000);
  });

  it('TRANSFER_FAILED na 6ª tentativa → failed_final + alerta', async () => {
    const { store, motoboy } = await setupStore();
    const t = await mkTransfer(store.id, motoboy.userId, { status: 'requested', attempts: 6 });
    await prisma.motoboyTransfer.update({ where: { id: t.id }, data: { asaasTransferId: 'tra_w6' } });
    await hook(store.id, body('TRANSFER_FAILED', t, 'tra_w6'));
    expect((await rowOf(t.id))!.status).toBe('failed_final');
    expect(adminNotify).toHaveBeenCalled();
  });

  it('TRANSFER_FAILED depois de done → não regride', async () => {
    const { store, motoboy } = await setupStore();
    const t = await mkTransfer(store.id, motoboy.userId, { status: 'done', attempts: 1 });
    await prisma.motoboyTransfer.update({ where: { id: t.id }, data: { asaasTransferId: 'tra_w7' } });
    const res = await hook(store.id, body('TRANSFER_FAILED', t, 'tra_w7'));
    expect(res.status).toBe(200);
    expect((await rowOf(t.id))!.status).toBe('done');
  });

  it('referência desconhecida ou de outra loja → 200 e nada muda', async () => {
    const { store, motoboy } = await setupStore();
    const other = await setupStore();
    const t = await mkTransfer(other.store.id, other.motoboy.userId, { status: 'requested', attempts: 1 });
    const r1 = await hook(store.id, body('TRANSFER_DONE', { id: 'nao-existe' }, 'tra_w8'));
    const r2 = await hook(store.id, body('TRANSFER_DONE', t, 'tra_w9'));
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect((await rowOf(t.id))!.status).toBe('requested');
    expect(emit.mock.calls.some((c) => String(c[0]).startsWith('user:'))).toBe(false);
    void motoboy;
  });

  it('sem externalReference → identifica pelo asaasTransferId', async () => {
    const { store, motoboy } = await setupStore();
    const t = await mkTransfer(store.id, motoboy.userId, { status: 'requested', attempts: 1 });
    await prisma.motoboyTransfer.update({ where: { id: t.id }, data: { asaasTransferId: 'tra_w10' } });
    const res = await hook(store.id, { id: 'evt_t23_noref', event: 'TRANSFER_DONE', transfer: { id: 'tra_w10', status: 'DONE' } });
    expect(res.status).toBe(200);
    expect((await rowOf(t.id))!.status).toBe('done');
  });
});

describe('bloqueio do aceite (transferência vencida)', () => {
  async function order(storeId: string, provider: 'asaas' | 'asaas_loja') {
    const cliente = await createTestUser('cliente', DOMAIN);
    const product = await prisma.product.create({ data: { storeId, name: 'Item', price: 20, quantity: 10 } } as any);
    return prisma.order.create({
      data: {
        customerId: cliente.userId, storeId, items: { create: [{ productId: product.id, quantity: 1, price: 20 }] },
        subtotal: 20, totalValue: 28, deliveryFee: 8, deliveryDistance: 3, status: 'criado', paymentMethod: 'pix',
        paymentStatus: 'paid', asaasChargeStatus: 'received', paymentProvider: provider,
      } as any,
    });
  }
  const accept = (o: any, lojista: any) => request(app).post(`/api/orders/${o.id}/accept`).set('Authorization', bearer(lojista)).send({});

  it.each(['failed', 'failed_final'])('%s há mais de transferBlockHours → pedido direto 409 STORE_TRANSFER_PENDING', async (st) => {
    const { store, motoboy, lojista } = await setupStore();
    const t = await mkTransfer(store.id, motoboy.userId, { status: st, attempts: 1 });
    await prisma.motoboyTransfer.update({ where: { id: t.id }, data: { createdAt: new Date(Date.now() - 25 * HOUR) } });
    const o = await order(store.id, 'asaas_loja');

    const res = await accept(o, lojista);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STORE_TRANSFER_PENDING');
    const after = await prisma.order.findUnique({ where: { id: o.id } });
    expect(after!.status).toBe('criado');
    expect(after!.acceptedAt).toBeNull();
  });

  it('pedido de custódia da mesma loja não é afetado', async () => {
    const { store, motoboy, lojista } = await setupStore();
    const t = await mkTransfer(store.id, motoboy.userId, { status: 'failed_final', attempts: 6 });
    await prisma.motoboyTransfer.update({ where: { id: t.id }, data: { createdAt: new Date(Date.now() - 25 * HOUR) } });
    const o = await order(store.id, 'asaas');

    const res = await accept(o, lojista);

    expect(res.status).toBe(200);
  });

  it('falha recente (dentro do prazo) não bloqueia o pedido direto', async () => {
    const { store, motoboy, lojista } = await setupStore();
    await mkTransfer(store.id, motoboy.userId, { status: 'failed', attempts: 1 });
    const o = await order(store.id, 'asaas_loja');

    const res = await accept(o, lojista);

    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix round 1 (R13, R14, R15, m4, m6)
// ─────────────────────────────────────────────────────────────────────────────

const hookT = (storeId: string, event: string, ref: string, asaasId: string) =>
  request(app).post(`/webhooks/asaas/loja/${storeId}`).set('asaas-access-token', WH_TOKEN)
    .send({ id: `evt_t23_${Math.random().toString(36).slice(2, 10)}`, event, transfer: { id: asaasId, externalReference: ref, status: event.replace('TRANSFER_', '') } });

/** tra_A enviada e recusada pelo Asaas via webhook; pronta para a retentativa. */
async function failedAfterTraA() {
  const s = await setupStore();
  const t = await mkTransfer(s.store.id, s.motoboy.userId);
  postAs.mockResolvedValueOnce({ id: 'tra_A' });
  await runMotoboyTransfers();
  await hookT(s.store.id, 'TRANSFER_FAILED', t.id, 'tra_A');
  expect((await rowOf(t.id))!.status).toBe('failed');
  await prisma.motoboyTransfer.update({ where: { id: t.id }, data: { nextAttemptAt: new Date(Date.now() - MIN) } });
  adminNotify.mockClear();
  return { ...s, t };
}

describe('R13 — eventos atrasados da transferência anterior', () => {
  it.each(['TRANSFER_FAILED', 'TRANSFER_CANCELLED'])('%s atrasado de tra_A logo após o claim da retentativa não derruba a tentativa nova', async (ev) => {
    const { store, t } = await failedAfterTraA();
    postAs.mockImplementationOnce(async () => {
      await hookT(store.id, ev, t.id, 'tra_A'); // chega com o vínculo nulo
      return { id: 'tra_B' };
    });

    await runMotoboyTransfers();

    const row = await rowOf(t.id);
    expect(row!.status).toBe('requested');
    expect(row!.asaasTransferId).toBe('tra_B');
    expect(row!.previousAsaasTransferIds).toEqual(['tra_A']);
    expect(row!.attempts).toBe(2);
  });

  it('FAILED atrasado de tra_A depois do vínculo de tra_B → nada muda', async () => {
    const { store, t } = await failedAfterTraA();
    postAs.mockResolvedValueOnce({ id: 'tra_B' });
    await runMotoboyTransfers();
    await hookT(store.id, 'TRANSFER_FAILED', t.id, 'tra_A');
    const row = await rowOf(t.id);
    expect(row!.status).toBe('requested');
    expect(row!.asaasTransferId).toBe('tra_B');
  });

  it('DONE atrasado de tra_A não conclui e alerta o admin', async () => {
    const { store, motoboy, t } = await failedAfterTraA();
    postAs.mockImplementationOnce(async () => {
      await hookT(store.id, 'TRANSFER_DONE', t.id, 'tra_A');
      return { id: 'tra_B' };
    });

    await runMotoboyTransfers();

    const row = await rowOf(t.id);
    // R22 (I3): a tentativa em voo, ainda sem autorização, é travada em uncertain.
    expect(row!.status).toBe('uncertain');
    expect(row!.lastError).toBe('PREVIOUS_DONE');
    expect(row!.doneAt).toBeNull();
    expect(row!.asaasTransferId).toBe('tra_B');
    expect(adminNotify).toHaveBeenCalled();
    expect(emit.mock.calls.some((c) => c[0] === `user:${motoboy.userId}`)).toBe(false);
  });

  it('DONE de tra_B (vínculo atual) conclui normalmente', async () => {
    const { store, t } = await failedAfterTraA();
    postAs.mockResolvedValueOnce({ id: 'tra_B' });
    await runMotoboyTransfers();
    await hookT(store.id, 'TRANSFER_DONE', t.id, 'tra_B');
    expect((await rowOf(t.id))!.status).toBe('done');
  });

  it('autorização (2.2) de tra_A depois da retentativa → REFUSED; tra_B → APPROVED', async () => {
    const { store, t } = await failedAfterTraA();
    let authA: any = null;
    let authB: any = null;
    const auth = (id: string) => request(app).post(`/webhooks/asaas/loja/${store.id}/autorizacao`).set('asaas-access-token', AUTH_TOKEN)
      .send({ type: 'TRANSFER', transfer: { id, value: 12.5, externalReference: t.id, pixAddressKey: PIX } });
    postAs.mockImplementationOnce(async () => {
      authA = (await auth('tra_A')).body;
      authB = (await auth('tra_B')).body;
      return { id: 'tra_B' };
    });

    await runMotoboyTransfers();

    expect(authA.status).toBe('REFUSED');
    expect(authB).toEqual({ status: 'APPROVED' });
  });
});

describe('R14 — envio exige a trava de autorização confirmada', () => {
  it('conta sem authWebhookConfirmedAt → failed AUTH_WEBHOOK_NOT_CONFIRMED, sem Asaas, sem gastar tentativa, alerta', async () => {
    const { store, motoboy } = await setupStore();
    await prisma.storeAsaasAccount.update({ where: { storeId: store.id }, data: { authWebhookConfirmedAt: null } });
    const t = await mkTransfer(store.id, motoboy.userId);

    await runMotoboyTransfers();

    expect(postAs).not.toHaveBeenCalled();
    const row = await rowOf(t.id);
    expect(row!.status).toBe('failed');
    expect(row!.lastError).toBe('AUTH_WEBHOOK_NOT_CONFIRMED');
    expect(row!.attempts).toBe(0);
    expect(row!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(adminNotify).toHaveBeenCalled();
  });
});

describe('R15 — bloqueio só por causa da loja e com envio ligado', () => {
  async function directOrder(storeId: string) {
    const cliente = await createTestUser('cliente', DOMAIN);
    const product = await prisma.product.create({ data: { storeId, name: 'Item', price: 20, quantity: 10 } } as any);
    return prisma.order.create({
      data: {
        customerId: cliente.userId, storeId, items: { create: [{ productId: product.id, quantity: 1, price: 20 }] },
        subtotal: 20, totalValue: 28, deliveryFee: 8, deliveryDistance: 3, status: 'criado', paymentMethod: 'pix',
        paymentStatus: 'paid', asaasChargeStatus: 'received', paymentProvider: 'asaas_loja',
      } as any,
    });
  }
  async function scenario(o: { lastError?: string; status?: string }) {
    const { store, motoboy, lojista } = await setupStore();
    const t = await mkTransfer(store.id, motoboy.userId, { status: o.status ?? 'failed', attempts: 1, lastError: o.lastError });
    await prisma.motoboyTransfer.update({ where: { id: t.id }, data: { createdAt: new Date(Date.now() - 25 * HOUR) } });
    const ord = await directOrder(store.id);
    return request(app).post(`/api/orders/${ord.id}/accept`).set('Authorization', bearer(lojista)).send({});
  }

  it('envio desligado → não bloqueia', async () => {
    await updatePlatformConfig({ directTransfersEnabled: false } as any, 'test');
    expect((await scenario({})).status).toBe(200);
  });

  it.each([
    ['failed', 'DAILY_LIMIT'],
    ['failed', 'MOTOBOY_PIX_KEY_MISSING'],
    ['failed_final', 'AMOUNT_OVER_LIMIT'],
  ])('%s %s (causa fora da loja) → não bloqueia', async (status, lastError) => {
    expect((await scenario({ status, lastError })).status).toBe(200);
  });

  it('AUTH_WEBHOOK_NOT_CONFIRMED (causa da loja) → bloqueia', async () => {
    const res = await scenario({ lastError: 'AUTH_WEBHOOK_NOT_CONFIRMED' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STORE_TRANSFER_PENDING');
  });

  it('failed comum (erro do Asaas) há mais de 24 h → bloqueia', async () => {
    const res = await scenario({ lastError: 'invalid_pixKey' });
    expect(res.status).toBe(409);
  });
});

describe('m4 — lastError não guarda a chave Pix', () => {
  it('description do Asaas com a chave → grava o code, sem a chave', async () => {
    const { store, motoboy } = await setupStore();
    const t = await mkTransfer(store.id, motoboy.userId);
    postAs.mockRejectedValue(new AsaasApiError(400, [{ code: 'invalid_pixAddressKey', description: 'Chave 123.456.789-09 (12345678909) ou joao@gmail.com inválida' } as any]));

    await runMotoboyTransfers();

    const row = await rowOf(t.id);
    expect(row!.status).toBe('failed');
    expect(row!.lastError).toContain('invalid_pixAddressKey');
    expect(row!.lastError).not.toMatch(/\d{3}/);
    expect(row!.lastError).not.toContain('joao@gmail.com');
  });
});

describe('m6 — chave Pix ausente não gasta tentativas', () => {
  it('sem chave: pula sem incrementar; com chave cadastrada: tira o snapshot e envia', async () => {
    const { store, motoboy } = await setupStore();
    const t = await mkTransfer(store.id, motoboy.userId, { key: '', status: 'failed', lastError: 'MOTOBOY_PIX_KEY_MISSING' });

    await runMotoboyTransfers();
    await prisma.motoboyTransfer.update({ where: { id: t.id }, data: { nextAttemptAt: new Date(Date.now() - MIN) } });
    await runMotoboyTransfers();

    expect(postAs).not.toHaveBeenCalled();
    let row = await rowOf(t.id);
    expect(row!.status).toBe('failed');
    expect(row!.lastError).toBe('MOTOBOY_PIX_KEY_MISSING');
    expect(row!.attempts).toBe(0);

    await prisma.user.update({ where: { id: motoboy.userId }, data: { asaas: { status: 'none', pixKey: 'joao@gmail.com', pixKeyType: 'EMAIL' } } as any });
    await prisma.motoboyTransfer.update({ where: { id: t.id }, data: { nextAttemptAt: new Date(Date.now() - MIN) } });
    postAs.mockResolvedValue({ id: 'tra_m6' });

    await runMotoboyTransfers();

    expect(postAs).toHaveBeenCalledTimes(1);
    expect(postAs.mock.calls[0][2]).toMatchObject({ pixAddressKey: 'joao@gmail.com', pixAddressKeyType: 'EMAIL' });
    row = await rowOf(t.id);
    expect(row!.status).toBe('requested');
    expect(row!.attempts).toBe(1);
    expect(row!.pixKeyEncrypted).not.toBe('');
  });
});
