/**
 * Revisão final I2 — TRANSFER_DONE fail closed: sem transfer.id é ignorado (alerta); DONE só
 * conclui `requested`/`uncertain` (ou `failed` com o MESMO id vinculado); id desconhecido em
 * `pending`/`failed`/`failed_final` → ignorado + alerta.
 */
jest.mock('../utils/socketEmitter', () => {
  const actual = jest.requireActual('../utils/socketEmitter');
  return { __esModule: true, ...actual, emitToRoom: jest.fn(), emitAdminNotification: jest.fn() };
});

import crypto from 'crypto';
import request from 'supertest';
import app from '../app';
import { emitToRoom, emitAdminNotification } from '../utils/socketEmitter';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser } from './helpers/authUser';
import { grantStoreConsent } from './helpers/storeConsent';

const DOMAIN = '@saas42.test';
const WH_TOKEN = 'f'.repeat(48);
const sha = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const emit = emitToRoom as jest.Mock;
const adminNotify = emitAdminNotification as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  emit.mockReset();
  adminNotify.mockReset();
});

afterEach(async () => {
  await prisma.webhookEvent.deleteMany({ where: { eventId: { contains: 'evt_t42_' } } });
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  await prisma.motoboyTransfer.deleteMany({ where: { storeId: { in: stores.map((s) => s.id) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function setupStore() {
  const lojista = await createTestUser('lojista', DOMAIN);
  const motoboy = await createTestUser('motoboy', DOMAIN);
  const store = await prisma.store.create({
    data: { ownerId: lojista.userId, name: 'Loja 42', plan: 1, isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any,
  });
  await prisma.storeAsaasAccount.create({
    data: {
      storeId: store.id, apiKeyEncrypted: encryptSensitiveData('$aact_hmlg_LOJA_42XX'), apiKeyLast4: '42XX', environment: 'sandbox', status: 'valid',
      paymentWebhookId: 'wh_42', paymentWebhookTokenHash: sha(WH_TOKEN), authWebhookConfirmedAt: new Date(),
    },
  });
  await grantStoreConsent(store.id);
  return { motoboy, store };
}

let seq = 0;
async function mkTransfer(storeId: string, motoboyId: string, status: string, asaasTransferId: string | null = null) {
  seq += 1;
  return prisma.motoboyTransfer.create({
    data: {
      deliveryId: `del42-${Date.now()}-${seq}`, orderId: `ord42-${seq}`, storeId, motoboyId, amount: 12.5,
      pixKeyEncrypted: encryptSensitiveData('12345678909'), pixKeyType: 'CPF', status, attempts: 1, asaasTransferId,
    },
  });
}
const rowOf = (id: string) => prisma.motoboyTransfer.findUnique({ where: { id } });
const done = (storeId: string, transfer: any) =>
  request(app).post(`/webhooks/asaas/loja/${storeId}`).set('asaas-access-token', WH_TOKEN)
    .send({ id: `evt_t42_${Math.random().toString(36).slice(2, 10)}`, event: 'TRANSFER_DONE', transfer: { status: 'DONE', value: 12.5, ...transfer } });

describe('I2 — TRANSFER_DONE fail closed', () => {
  it('sem transfer.id → ignorado (continua requested) e alerta o admin', async () => {
    const { store, motoboy } = await setupStore();
    const t = await mkTransfer(store.id, motoboy.userId, 'requested');
    expect((await done(store.id, { externalReference: t.id })).status).toBe(200);
    const row = await rowOf(t.id);
    expect(row!.status).toBe('requested');
    expect(row!.doneAt).toBeNull();
    expect(adminNotify).toHaveBeenCalled();
    expect(emit.mock.calls.some((c) => String(c[0]).startsWith('user:'))).toBe(false);
  });

  it.each(['pending', 'failed_final'])('%s com id desconhecido → ignorado + alerta', async (st) => {
    const { store, motoboy } = await setupStore();
    const t = await mkTransfer(store.id, motoboy.userId, st);
    await done(store.id, { id: 'tra_42_x', externalReference: t.id });
    const row = await rowOf(t.id);
    expect(row!.status).toBe(st);
    expect(row!.asaasTransferId).toBeNull();
    expect(adminNotify).toHaveBeenCalled();
  });

  it('failed sem vínculo (id desconhecido) → ignorado + alerta', async () => {
    const { store, motoboy } = await setupStore();
    const t = await mkTransfer(store.id, motoboy.userId, 'failed');
    await done(store.id, { id: 'tra_42_y', externalReference: t.id });
    expect((await rowOf(t.id))!.status).toBe('failed');
    expect(adminNotify).toHaveBeenCalled();
  });

  it('failed com o MESMO id vinculado → done (o Asaas concluiu depois de avisar falha)', async () => {
    const { store, motoboy } = await setupStore();
    const t = await mkTransfer(store.id, motoboy.userId, 'failed', 'tra_42_z');
    await done(store.id, { id: 'tra_42_z', externalReference: t.id });
    expect((await rowOf(t.id))!.status).toBe('done');
  });

  it('requested e uncertain continuam concluindo; done repetido é no-op sem alerta', async () => {
    const { store, motoboy } = await setupStore();
    const a = await mkTransfer(store.id, motoboy.userId, 'requested', 'tra_42_a');
    const b = await mkTransfer(store.id, motoboy.userId, 'uncertain');
    await done(store.id, { id: 'tra_42_a', externalReference: a.id });
    await done(store.id, { id: 'tra_42_b', externalReference: b.id });
    expect((await rowOf(a.id))!.status).toBe('done');
    expect((await rowOf(b.id))!.status).toBe('done');
    adminNotify.mockReset();
    await done(store.id, { id: 'tra_42_a', externalReference: a.id });
    expect(adminNotify).not.toHaveBeenCalled();
  });
});

describe('I3 — DONE de uma tentativa ANTERIOR trava a linha atual', () => {
  const withPrevious = async (status: string, extra: any = {}) => {
    const { store, motoboy } = await setupStore();
    const t = await mkTransfer(store.id, motoboy.userId, status, extra.asaasTransferId ?? null);
    await prisma.motoboyTransfer.update({ where: { id: t.id }, data: { previousAsaasTransferIds: ['tra_old'], ...extra } });
    return { store, motoboy, t };
  };

  it('requested sem autorização → uncertain PREVIOUS_DONE + alerta, nunca done', async () => {
    const { store, motoboy, t } = await withPrevious('requested');
    await done(store.id, { id: 'tra_old', externalReference: t.id });
    const row = await rowOf(t.id);
    expect(row!.status).toBe('uncertain');
    expect(row!.lastError).toBe('PREVIOUS_DONE');
    expect(row!.doneAt).toBeNull();
    expect(adminNotify).toHaveBeenCalled();
    expect(emit.mock.calls.some((c) => c[0] === `user:${motoboy.userId}`)).toBe(false);
  });

  it.each(['pending', 'failed'])('%s → uncertain PREVIOUS_DONE (o job não reenvia)', async (st) => {
    const { store, t } = await withPrevious(st);
    await done(store.id, { id: 'tra_old', externalReference: t.id });
    const row = await rowOf(t.id);
    expect(row!.status).toBe('uncertain');
    expect(row!.lastError).toBe('PREVIOUS_DONE');
    expect(adminNotify).toHaveBeenCalled();
  });

  it('requested JÁ autorizado → só alerta (o admin resolve o possível pagamento em dobro)', async () => {
    const { store, t } = await withPrevious('requested', { authorizedAt: new Date(), asaasTransferId: 'tra_new' });
    await done(store.id, { id: 'tra_old', externalReference: t.id });
    const row = await rowOf(t.id);
    expect(row!.status).toBe('requested');
    expect(row!.lastError).toBeNull();
    expect(adminNotify).toHaveBeenCalled();
  });
});
