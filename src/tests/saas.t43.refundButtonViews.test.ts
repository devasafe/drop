/**
 * Revisão final M2/M3 — botão "Estornar" não queima tentativas (reabrir failed_final zera
 * attempts; o lojista em failed respeita nextAttemptAt) e as visões da loja não expõem texto
 * cru do Asaas nem a resolução interna do admin.
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
import asaasClient, { AsaasApiError } from '../services/asaas/client';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import { grantStoreConsent } from './helpers/storeConsent';
import { requestDirectRefund, executeDirectRefund } from '../services/asaasLoja/refund';

const DOMAIN = '@saas43.test';
const STORE_KEY = '$aact_hmlg_LOJA_43XX';
const postAs = asaasClient.postAs as jest.Mock;
const MIN = 60000;

beforeEach(() => { jest.clearAllMocks(); postAs.mockReset(); });

afterEach(async () => {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  const ids = stores.map((s) => s.id);
  await prisma.directRefund.deleteMany({ where: { storeId: { in: ids } } });
  await prisma.motoboyTransfer.deleteMany({ where: { storeId: { in: ids } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function setup() {
  const owner = await createTestUser('lojista', DOMAIN);
  const ceo = await createTestUser('ceo', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const motoboy = await createTestUser('motoboy', DOMAIN);
  const store = await prisma.store.create({
    data: { ownerId: owner.userId, name: 'Loja 43', isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any,
  });
  await prisma.storeAsaasAccount.create({
    data: { storeId: store.id, apiKeyEncrypted: encryptSensitiveData(STORE_KEY), apiKeyLast4: '43XX', environment: 'sandbox', status: 'valid' },
  });
  await grantStoreConsent(store.id);
  const order = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId: store.id, totalValue: 50, deliveryFee: 0,
      status: 'cancelado', paymentMethod: 'pix', paymentStatus: 'paid', asaasChargeStatus: 'received',
      asaasPaymentId: `pay_43_${Math.random().toString(36).slice(2, 8)}`, paymentProvider: 'asaas_loja',
    } as any,
  });
  const refund = await requestDirectRefund({ orderId: order.id, cancellationId: null, amount: 50, requestedBy: 'system' });
  return { owner, ceo, cliente, motoboy, store, order, refund };
}

type S = Awaited<ReturnType<typeof setup>>;
const press = (s: S, who: { token: string; userId: string; role: string }) =>
  request(app).post(`/api/orders/${s.order.id}/refund-direct`).set('Authorization', bearer(who)).send({});
const fail400 = (desc = 'Saldo insuficiente') => new AsaasApiError(400, [{ code: 'insufficient_balance', description: desc } as any]);

describe('M2 — botão Estornar não queima tentativas', () => {
  it('admin reabre failed_final: attempts volta a 0; uma nova falha agenda retentativa (failed), não failed_final', async () => {
    const s = await setup();
    await prisma.directRefund.update({ where: { id: s.refund.id }, data: { status: 'failed_final', attempts: 6, lastError: 'x' } });
    postAs.mockRejectedValue(fail400());

    const r = await press(s, s.ceo);

    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('failed');
    expect(r.body.data.attempts).toBe(1);
  });

  it('lojista em failed antes de nextAttemptAt → 409 REFUND_RETRY_NOT_DUE, sem chamar o Asaas', async () => {
    const s = await setup();
    await prisma.directRefund.update({ where: { id: s.refund.id }, data: { status: 'failed', attempts: 2, nextAttemptAt: new Date(Date.now() + 10 * MIN) } });

    const r = await press(s, s.owner);

    expect(r.status).toBe(409);
    expect(JSON.stringify(r.body)).toContain('REFUND_RETRY_NOT_DUE');
    expect(postAs).not.toHaveBeenCalled();
    expect((await prisma.directRefund.findUnique({ where: { id: s.refund.id } }))!.attempts).toBe(2);
  });

  it('lojista em failed com nextAttemptAt vencido → reexecuta', async () => {
    const s = await setup();
    await prisma.directRefund.update({ where: { id: s.refund.id }, data: { status: 'failed', attempts: 2, nextAttemptAt: new Date(Date.now() - MIN) } });
    postAs.mockResolvedValue({ id: 'x', status: 'REFUNDED' });
    const r = await press(s, s.owner);
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('done');
  });
});

describe('M3 — visões da loja', () => {
  it('lastError do estorno é gravado sem texto cru (code + descrição mascarada)', async () => {
    const s = await setup();
    postAs.mockRejectedValue(fail400('Chave 12345678909 de fulano@x.com inválida'));
    await executeDirectRefund(s.refund.id);
    const row = await prisma.directRefund.findUnique({ where: { id: s.refund.id } });
    expect(row!.lastError).toMatch(/^insufficient_balance: /);
    expect(row!.lastError).not.toMatch(/\d/);
    expect(row!.lastError).not.toContain('fulano@x.com');
  });

  it('linha antiga com texto cru: GET do pedido e o botão devolvem ao lojista só a versão mascarada', async () => {
    const s = await setup();
    await prisma.directRefund.update({
      where: { id: s.refund.id },
      data: { status: 'failed', attempts: 1, lastError: 'Chave 12345678909 de fulano@x.com inválida', nextAttemptAt: new Date(Date.now() + 10 * MIN) },
    });
    const o = await request(app).get(`/api/orders/${s.order.id}`).set('Authorization', bearer(s.owner));
    expect(o.status).toBe(200);
    expect(o.body.directRefund.lastError).toBeTruthy();
    expect(JSON.stringify(o.body.directRefund)).not.toContain('12345678909');
    expect(JSON.stringify(o.body.directRefund)).not.toContain('fulano@x.com');
  });

  it('GET /stores/:id/transfers (loja) não traz resolvedBy/resolutionNote; o admin continua vendo', async () => {
    const s = await setup();
    await prisma.motoboyTransfer.create({
      data: {
        deliveryId: `del43-${Date.now()}`, orderId: s.order.id, storeId: s.store.id, motoboyId: s.motoboy.userId, amount: 12.5,
        pixKeyEncrypted: encryptSensitiveData('12345678909'), pixKeyType: 'CPF', status: 'done',
        resolvedBy: `admin:${s.ceo.userId}`, resolutionNote: 'conferido no painel do Asaas — nota interna',
      },
    });
    const r = await request(app).get(`/api/stores/${s.store.id}/transfers`).set('Authorization', bearer(s.owner));
    expect(r.status).toBe(200);
    expect(r.body.data).toHaveLength(1);
    expect(r.body.data[0]).not.toHaveProperty('resolvedBy');
    expect(r.body.data[0]).not.toHaveProperty('resolutionNote');

    const a = await request(app).get('/api/admin/transfers').set('Authorization', bearer(s.ceo));
    const mine = a.body.data.find((x: any) => x.storeId === s.store.id);
    expect(mine.resolutionNote).toContain('nota interna');
  });
});
