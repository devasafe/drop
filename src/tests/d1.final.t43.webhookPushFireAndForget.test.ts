/** D1 · revisão final T43 — o webhook do Asaas não espera o push da 1ª falha. */
jest.mock('../services/asaas/client', () => {
  const actual = jest.requireActual('../services/asaas/client');
  return { __esModule: true, ...actual, default: { ...actual.default, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn(), getAs: jest.fn(), postAs: jest.fn(), putAs: jest.fn(), deleteAs: jest.fn() } };
});
jest.mock('../utils/socketEmitter', () => {
  const actual = jest.requireActual('../utils/socketEmitter');
  return { __esModule: true, ...actual, emitToRoom: jest.fn(), emitAdminNotification: jest.fn() };
});
jest.mock('../services/storeNotify', () => {
  const actual = jest.requireActual('../services/storeNotify');
  return { __esModule: true, ...actual, notifyStore: jest.fn() };
});

import crypto from 'crypto';
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { notifyStore } from '../services/storeNotify';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser } from './helpers/authUser';
import { grantStoreConsent } from './helpers/storeConsent';

const DOMAIN = '@d1t43.test';
const WH_TOKEN = 'd'.repeat(48);
const sha = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const notify = notifyStore as jest.Mock;

afterAll(async () => { await prisma.$disconnect(); });
beforeEach(() => notify.mockReset());
afterEach(async () => {
  await prisma.webhookEvent.deleteMany({ where: { eventId: { contains: 'evt_t43_' } } });
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  await prisma.motoboyTransfer.deleteMany({ where: { storeId: { in: stores.map((s) => s.id) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function setup() {
  const lojista = await createTestUser('lojista', DOMAIN);
  const motoboy = await createTestUser('motoboy', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: lojista.userId, name: 'Loja T43', isOpen: true } as any });
  await prisma.storeAsaasAccount.create({
    data: {
      storeId: store.id, apiKeyEncrypted: encryptSensitiveData('$aact_hmlg_T43'), apiKeyLast4: 'T43X', environment: 'sandbox', status: 'valid',
      paymentWebhookId: 'wh_t43', paymentWebhookTokenHash: sha(WH_TOKEN), authWebhookTokenHash: sha('e'.repeat(48)), authWebhookConfirmedAt: new Date(),
    },
  });
  await grantStoreConsent(store.id);
  const t = await prisma.motoboyTransfer.create({
    data: {
      deliveryId: `del-t43-${Date.now()}`, orderId: 'ordt43abc123', storeId: store.id, motoboyId: motoboy.userId, amount: 12.5,
      pixKeyEncrypted: encryptSensitiveData('12345678909'), pixKeyType: 'CPF', status: 'requested', attempts: 1, asaasTransferId: 'tra_t43',
    },
  });
  return { store, t };
}
const hook = (storeId: string, t: { id: string }) =>
  request(app).post(`/webhooks/asaas/loja/${storeId}`).set('asaas-access-token', WH_TOKEN)
    .send({ id: `evt_t43_${Math.random().toString(36).slice(2, 8)}`, event: 'TRANSFER_FAILED', transfer: { id: 'tra_t43', externalReference: t.id, status: 'FAILED', value: 12.5 } });

describe('T43 — push da 1ª falha no webhook é fire-and-forget', () => {
  it('push que nunca resolve: o webhook responde 200 e a linha vira failed', async () => {
    const { store, t } = await setup();
    notify.mockImplementation(() => new Promise(() => {}));
    const started = Date.now();
    const res = await hook(store.id, t);
    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(4000);
    const row = await prisma.motoboyTransfer.findUnique({ where: { id: t.id } });
    expect(row!.status).toBe('failed');
    expect(row!.firstFailedAt).toBeInstanceOf(Date);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('push que rejeita: o webhook responde 200 e a linha vira failed', async () => {
    const { store, t } = await setup();
    notify.mockRejectedValue(new Error('web-push caiu'));
    const res = await hook(store.id, t);
    expect(res.status).toBe(200);
    expect((await prisma.motoboyTransfer.findUnique({ where: { id: t.id } }))!.status).toBe('failed');
  });
});
