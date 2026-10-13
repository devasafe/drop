/** D1 · P4.11 — "Tentar agora" do Pix parado, pela loja, no máximo 1 a cada 5 min. */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@d1p411.test';
const MIN = 60 * 1000;

afterEach(async () => {
  await prisma.motoboyTransfer.deleteMany({ where: { orderId: { startsWith: 'ordp411' } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});
afterAll(async () => { await prisma.$disconnect(); });

async function setup() {
  const owner = await createTestUser('lojista', DOMAIN);
  const otherOwner = await createTestUser('lojista', DOMAIN);
  const ceo = await createTestUser('ceo', DOMAIN);
  const motoboy = await createTestUser('motoboy', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: owner.userId, name: 'Loja P411', isOpen: true } });
  const otherStore = await prisma.store.create({ data: { ownerId: otherOwner.userId, name: 'Loja P411b', isOpen: true } });
  return { owner, otherOwner, ceo, motoboy, store, otherStore };
}
let seq = 0;
async function mk(storeId: string, motoboyId: string, extra: { status?: string; attempts?: number; touchedMinAgo?: number } = {}) {
  const t = await prisma.motoboyTransfer.create({
    data: {
      deliveryId: `del-p411-${Date.now()}-${seq}`, orderId: `ordp411-${seq++}`, storeId, motoboyId, amount: 8,
      pixKeyEncrypted: encryptSensitiveData('12345678909'), pixKeyType: 'CPF',
      status: extra.status ?? 'failed', attempts: extra.attempts ?? 2, lastError: 'x: Saldo insuficiente',
      nextAttemptAt: new Date(Date.now() + 60 * MIN), firstFailedAt: new Date(Date.now() - 30 * MIN),
    },
  });
  const touched = new Date(Date.now() - (extra.touchedMinAgo ?? 10) * MIN);
  // updatedAt explícito (o Prisma respeita) — evita o cast de fuso do SQL cru
  await prisma.motoboyTransfer.update({ where: { id: t.id }, data: { updatedAt: touched } });
  return t;
}
const retry = (storeId: string, id: string, who: any) =>
  request(app).post(`/api/stores/${storeId}/transfers/${id}/retry`).set('Authorization', bearer(who)).send({});

describe('POST /api/stores/:storeId/transfers/:transferId/retry', () => {
  it('dono antecipa a próxima tentativa (nextAttemptAt = agora), sem zerar a escada', async () => {
    const s = await setup();
    const t = await mk(s.store.id, s.motoboy.userId);
    const before = Date.now();
    const r = await retry(s.store.id, t.id, s.owner);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.transfer).toMatchObject({ id: t.id, status: 'failed', attempts: 2 });
    expect(typeof r.body.data.transfer.firstFailedAt).toBe('string');
    expect(JSON.stringify(r.body)).not.toContain('12345678909');
    const row = await prisma.motoboyTransfer.findUnique({ where: { id: t.id } });
    expect(row!.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(row!.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(row!.attempts).toBe(2);
  });

  it('segunda tentativa em menos de 5 min → 429 RETRY_TOO_SOON', async () => {
    const s = await setup();
    const t = await mk(s.store.id, s.motoboy.userId);
    expect((await retry(s.store.id, t.id, s.owner)).status).toBe(200);
    const r = await retry(s.store.id, t.id, s.owner);
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe('RETRY_TOO_SOON');
  });

  it('linha mexida pelo job há 2 min → 429; há 6 min → 200', async () => {
    const s = await setup();
    const recente = await mk(s.store.id, s.motoboy.userId, { touchedMinAgo: 2 });
    expect((await retry(s.store.id, recente.id, s.owner)).status).toBe(429);
    const antiga = await mk(s.store.id, s.motoboy.userId, { touchedMinAgo: 6 });
    expect((await retry(s.store.id, antiga.id, s.owner)).status).toBe(200);
  });

  it('duas chamadas simultâneas: uma passa, a outra recebe 429', async () => {
    const s = await setup();
    const t = await mk(s.store.id, s.motoboy.userId);
    const rs = await Promise.all([retry(s.store.id, t.id, s.owner), retry(s.store.id, t.id, s.owner)]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 429]);
  });

  it.each([
    ['uncertain', 'TRANSFER_UNCERTAIN'],
    ['done', 'TRANSFER_ALREADY_DONE'],
    ['failed_final', 'TRANSFER_WITH_ADMIN'],
    ['requested', 'TRANSFER_IN_PROGRESS'],
  ])('status %s → 409 %s', async (status, code) => {
    const s = await setup();
    const t = await mk(s.store.id, s.motoboy.userId, { status });
    const r = await retry(s.store.id, t.id, s.owner);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe(code);
  });

  it('outro lojista, motoboy e admin → 403; transferência de outra loja → 404', async () => {
    const s = await setup();
    const t = await mk(s.store.id, s.motoboy.userId);
    for (const who of [s.otherOwner, s.motoboy, s.ceo]) {
      expect((await retry(s.store.id, t.id, who)).status).toBe(403);
    }
    const alheia = await mk(s.otherStore.id, s.motoboy.userId);
    const r = await retry(s.store.id, alheia.id, s.owner);
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('TRANSFER_NOT_FOUND');
  });
});
