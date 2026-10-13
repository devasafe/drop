/** D1 · P4.10 — 1ª falha do Pix ao motoboy: gravada uma vez e avisada à loja. */
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
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { sendTransfer, createTransferForDelivery, notifyTransferCreated } from '../services/asaasLoja/motoboyTransfer';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import { grantStoreConsent } from './helpers/storeConsent';

const DOMAIN = '@d1p410.test';
const STORE_KEY = '$aact_hmlg_LOJA_P410';
const sha = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const postAs = asaasClient.postAs as jest.Mock;
const MIN = 60000;
const fail400 = () => new AsaasApiError(400, [{ code: 'x', description: 'Saldo insuficiente' } as any]);

let restore: () => Promise<void>;
beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); await prisma.$disconnect(); });
beforeEach(async () => {
  postAs.mockReset();
  await updatePlatformConfig({ directTransfersEnabled: true, directTransferMaxAmount: 150, directTransferDailyMaxPerStore: 3000, transferBlockHours: 24, motoboyShareDirect: 80 } as any, 'test');
});
afterEach(async () => {
  const users = await prisma.user.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } });
  await prisma.notification.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  await prisma.motoboyTransfer.deleteMany({ where: { storeId: { in: stores.map((s) => s.id) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function setupStore() {
  const lojista = await createTestUser('lojista', DOMAIN);
  const motoboy = await createTestUser('motoboy', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: lojista.userId, name: 'Loja P410', isOpen: true } as any });
  await prisma.storeAsaasAccount.create({
    data: {
      storeId: store.id, apiKeyEncrypted: encryptSensitiveData(STORE_KEY), apiKeyLast4: 'P410', environment: 'sandbox', status: 'valid',
      paymentWebhookId: 'wh_p410', paymentWebhookTokenHash: sha('d'.repeat(48)),
      authWebhookTokenHash: sha('e'.repeat(48)), authWebhookConfirmedAt: new Date(),
    },
  });
  await grantStoreConsent(store.id);
  return { lojista, motoboy, store };
}
let seq = 0;
const mkTransfer = (storeId: string, motoboyId: string) => prisma.motoboyTransfer.create({
  data: {
    deliveryId: `del-p410-${Date.now()}-${seq}`, orderId: `ordp410abc${seq++}`, storeId, motoboyId, amount: 12.5,
    pixKeyEncrypted: encryptSensitiveData('12345678909'), pixKeyType: 'CPF', status: 'pending', nextAttemptAt: new Date(Date.now() - MIN),
  },
});
const rowOf = (id: string) => prisma.motoboyTransfer.findUnique({ where: { id } });
const noticesOf = (userId: string, transferId: string) => prisma.notification.findMany({ where: { userId, entityId: transferId } });

async function waitFor<T>(fn: () => Promise<T | null | undefined>, ms = 3000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('waitFor: tempo esgotado');
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('P4.10 — firstFailedAt', () => {
  it('1ª falha grava firstFailedAt e avisa a loja; 2ª falha não mexe nem avisa de novo', async () => {
    const { lojista, motoboy, store } = await setupStore();
    const t = await mkTransfer(store.id, motoboy.userId);
    postAs.mockRejectedValue(fail400());

    expect(await sendTransfer(t.id)).toBe('failed');
    const r1 = await rowOf(t.id);
    expect(r1!.status).toBe('failed');
    expect(r1!.firstFailedAt).toBeInstanceOf(Date);
    const n = await noticesOf(lojista.userId, t.id);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ title: 'Pix ao motoboy parado', link: '/seller/dinheiro' });
    expect(n[0].message).toContain('12,50');

    await prisma.motoboyTransfer.update({ where: { id: t.id }, data: { nextAttemptAt: new Date(Date.now() - MIN) } });
    expect(await sendTransfer(t.id)).toBe('failed');
    const r2 = await rowOf(t.id);
    expect(r2!.attempts).toBe(2);
    expect(r2!.firstFailedAt!.toISOString()).toBe(r1!.firstFailedAt!.toISOString());
    expect(await noticesOf(lojista.userId, t.id)).toHaveLength(1);
  });

  it('retenção sem gastar tentativa (trava não confirmada) também conta como 1ª falha', async () => {
    const { lojista, motoboy, store } = await setupStore();
    await prisma.storeAsaasAccount.update({ where: { storeId: store.id }, data: { authWebhookConfirmedAt: null } });
    const t = await mkTransfer(store.id, motoboy.userId);
    expect(await sendTransfer(t.id)).toBe('failed');
    const r = await rowOf(t.id);
    expect(r!.lastError).toBe('AUTH_WEBHOOK_NOT_CONFIRMED');
    expect(r!.firstFailedAt).toBeInstanceOf(Date);
    expect(await noticesOf(lojista.userId, t.id)).toHaveLength(1);
  });

  it('linha que já nasce falha (motoboy sem chave Pix) nasce com firstFailedAt e avisa a loja', async () => {
    const { lojista, motoboy, store } = await setupStore();
    const row = await prisma.$transaction((tx) =>
      createTransferForDelivery(tx, { id: `del-p410-born-${Date.now()}`, motoboyId: motoboy.userId, fee: 10 }, { id: 'ordp410born', storeId: store.id }),
    );
    expect(row.status).toBe('failed');
    expect(row.lastError).toBe('MOTOBOY_PIX_KEY_MISSING');
    expect(row.firstFailedAt).toBeInstanceOf(Date);
    notifyTransferCreated(row);
    const n = await waitFor(async () => (await noticesOf(lojista.userId, row.id))[0]);
    expect(n).toMatchObject({ link: '/seller/dinheiro' });
    expect(n.message).toContain('chave Pix');
  });

  it('transferência pendente (sem falha) nasce sem firstFailedAt', async () => {
    const { motoboy, store } = await setupStore();
    await prisma.user.update({ where: { id: motoboy.userId }, data: { asaas: { pixKey: '12345678909', pixKeyType: 'CPF' } } as any });
    const row = await prisma.$transaction((tx) =>
      createTransferForDelivery(tx, { id: `del-p410-ok-${Date.now()}`, motoboyId: motoboy.userId, fee: 10 }, { id: 'ordp410ok', storeId: store.id }),
    );
    expect(row.status).toBe('pending');
    expect(row.firstFailedAt).toBeNull();
  });

  it('a listagem da loja traz firstFailedAt', async () => {
    const { lojista, motoboy, store } = await setupStore();
    const t = await mkTransfer(store.id, motoboy.userId);
    postAs.mockRejectedValue(fail400());
    await sendTransfer(t.id);
    const r = await request(app).get(`/api/stores/${store.id}/transfers`).set('Authorization', bearer(lojista));
    expect(r.status).toBe(200);
    const item = r.body.data.find((x: any) => x.id === t.id);
    expect(typeof item.firstFailedAt).toBe('string');
  });
});
