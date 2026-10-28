/**
 * Task 2.4 — telas de ganhos do motoboy e pendências de transferência:
 * GET /api/motoboy/transfers, GET /api/stores/:storeId/transfers,
 * GET /api/admin/transfers, POST /api/admin/transfers/:id/retry e /resolve.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { maskPixKey } from '../services/asaasLoja/motoboyTransfer';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@saas24.test';
const CPF = '12345678912';
const CPF_MASKED = '***.***.***-12';
const EVP = '123e4567-e89b-12d3-a456-426614174000';

afterEach(async () => {
  await prisma.motoboyTransfer.deleteMany({ where: { orderId: { startsWith: 'ord24' } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function setup() {
  const owner = await createTestUser('lojista', DOMAIN);
  const otherOwner = await createTestUser('lojista', DOMAIN);
  const ceo = await createTestUser('ceo', DOMAIN);
  const m1 = await createTestUser('motoboy', DOMAIN);
  const m2 = await createTestUser('motoboy', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: owner.userId, name: 'Loja 24', isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any });
  const otherStore = await prisma.store.create({ data: { ownerId: otherOwner.userId, name: 'Loja 24b', isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any });
  return { owner, otherOwner, ceo, m1, m2, store, otherStore };
}

let seq = 0;
const mk = (storeId: string, motoboyId: string, extra: any = {}) =>
  prisma.motoboyTransfer.create({
    data: {
      deliveryId: `del24-${Date.now()}-${seq}`, orderId: `ord24-${seq++}`, storeId, motoboyId,
      amount: 8, pixKeyEncrypted: encryptSensitiveData(CPF), pixKeyType: 'CPF', ...extra,
    },
  });
const noKey = (body: any) => {
  const j = JSON.stringify(body);
  expect(j).not.toContain(CPF);
  expect(j).not.toContain('pixKeyEncrypted');
  expect(j).not.toContain('asaasTransferId');
  expect(j).not.toContain('$aact');
};

describe('maskPixKey — chave desconhecida mostra só os 4 últimos', () => {
  it('EVP', () => {
    const m = maskPixKey(EVP);
    expect(m).toBe('***4000');
    expect(m).not.toContain('e89b');
    expect(m).not.toContain('123e');
  });
});

describe('GET /api/motoboy/transfers', () => {
  it('só os do próprio motoboy, ignorando query; sem chave Pix', async () => {
    const s = await setup();
    const mine = await mk(s.store.id, s.m1.userId);
    await mk(s.store.id, s.m2.userId);
    const r = await request(app).get(`/api/motoboy/transfers?motoboyId=${s.m2.userId}`).set('Authorization', bearer(s.m1));
    expect(r.status).toBe(200);
    expect(r.body.data.map((t: any) => t.id)).toEqual([mine.id]);
    noKey(r.body);
    expect(JSON.stringify(r.body)).not.toContain('lastError');
  });
  it('lojista e anônimo não acessam', async () => {
    const s = await setup();
    expect((await request(app).get('/api/motoboy/transfers').set('Authorization', bearer(s.owner))).status).toBe(403);
    expect((await request(app).get('/api/motoboy/transfers')).status).toBe(401);
  });
});

describe('GET /api/stores/:storeId/transfers', () => {
  it('dono vê só as da sua loja, com chave mascarada', async () => {
    const s = await setup();
    const t = await mk(s.store.id, s.m1.userId);
    await mk(s.otherStore.id, s.m1.userId);
    const r = await request(app).get(`/api/stores/${s.store.id}/transfers`).set('Authorization', bearer(s.owner));
    expect(r.status).toBe(200);
    expect(r.body.data.map((x: any) => x.id)).toEqual([t.id]);
    expect(r.body.data[0].pixKeyMasked).toBe(CPF_MASKED);
    noKey(r.body);
  });
  it('outro lojista, motoboy e admin -> 403', async () => {
    const s = await setup();
    await mk(s.store.id, s.m1.userId);
    for (const who of [s.otherOwner, s.m1, s.ceo]) {
      expect((await request(app).get(`/api/stores/${s.store.id}/transfers`).set('Authorization', bearer(who))).status).toBe(403);
    }
  });
});

describe('GET /api/admin/transfers', () => {
  it('ceo lista com filtro de status e chave mascarada; lojista -> 403', async () => {
    const s = await setup();
    await mk(s.store.id, s.m1.userId, { status: 'failed', lastError: 'X' });
    await mk(s.store.id, s.m1.userId, { status: 'done' });
    const r = await request(app).get('/api/admin/transfers?status=failed').set('Authorization', bearer(s.ceo));
    expect(r.status).toBe(200);
    const rows = r.body.data.filter((x: any) => String(x.orderId).startsWith('ord24'));
    expect(rows).toHaveLength(1);
    expect(rows[0].pixKeyMasked).toBe(CPF_MASKED);
    expect(rows[0].storeName).toBe('Loja 24');
    noKey(r.body);
    expect((await request(app).get('/api/admin/transfers').set('Authorization', bearer(s.owner))).status).toBe(403);
  });
});

describe('POST /api/admin/transfers/:id/retry', () => {
  const retry = (id: string, who: any) => request(app).post(`/api/admin/transfers/${id}/retry`).set('Authorization', bearer(who)).send({});
  it.each(['failed', 'failed_final'])('%s -> failed, vencida agora, tentativas zeradas', async (status) => {
    const s = await setup();
    const t = await mk(s.store.id, s.m1.userId, { status, attempts: 6, lastError: 'X', nextAttemptAt: new Date(Date.now() + 3600_000) });
    const r = await retry(t.id, s.ceo);
    expect(r.status).toBe(200);
    noKey(r.body);
    const row = (await prisma.motoboyTransfer.findUnique({ where: { id: t.id } }))!;
    expect(row.status).toBe('failed');
    expect(row.attempts).toBe(0);
    expect(row.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now());
  });
  it.each(['requested', 'done', 'uncertain', 'pending'])('%s -> 409 e nada muda', async (status) => {
    const s = await setup();
    const t = await mk(s.store.id, s.m1.userId, { status, attempts: 2 });
    const r = await retry(t.id, s.ceo);
    expect(r.status).toBe(409);
    expect((await prisma.motoboyTransfer.findUnique({ where: { id: t.id } }))!.status).toBe(status);
  });
  it('404, e lojista -> 403', async () => {
    const s = await setup();
    expect((await retry('nao-existe', s.ceo)).status).toBe(404);
    const t = await mk(s.store.id, s.m1.userId, { status: 'failed' });
    expect((await retry(t.id, s.owner)).status).toBe(403);
  });
  it('retentativas repetidas só reagendam (idempotente): nunca saem de failed', async () => {
    const s = await setup();
    const t = await mk(s.store.id, s.m1.userId, { status: 'failed_final', attempts: 6 });
    const rs = await Promise.all([retry(t.id, s.ceo), retry(t.id, s.ceo)]);
    expect(rs.map((x) => x.status)).toEqual([200, 200]);
    const row = (await prisma.motoboyTransfer.findUnique({ where: { id: t.id } }))!;
    expect(row.status).toBe('failed');
    expect(row.attempts).toBe(0);
  });
});

describe('POST /api/admin/transfers/:id/resolve', () => {
  const resolve = (id: string, who: any, note: any = 'conferido no painel do Asaas') =>
    request(app).post(`/api/admin/transfers/${id}/resolve`).set('Authorization', bearer(who)).send({ note });
  it.each(['failed', 'failed_final', 'uncertain'])('%s -> done com autor e nota', async (status) => {
    const s = await setup();
    const t = await mk(s.store.id, s.m1.userId, { status, lastError: 'X' });
    const r = await resolve(t.id, s.ceo);
    expect(r.status).toBe(200);
    noKey(r.body);
    const row = (await prisma.motoboyTransfer.findUnique({ where: { id: t.id } }))!;
    expect(row.status).toBe('done');
    expect(row.doneAt).not.toBeNull();
    expect(row.resolvedBy).toBe(`admin:${s.ceo.userId}`);
    expect(row.resolutionNote).toBe('conferido no painel do Asaas');
  });
  it('nota curta -> 400', async () => {
    const s = await setup();
    const t = await mk(s.store.id, s.m1.userId, { status: 'uncertain' });
    expect((await resolve(t.id, s.ceo, 'curta')).status).toBe(400);
    expect((await prisma.motoboyTransfer.findUnique({ where: { id: t.id } }))!.status).toBe('uncertain');
  });
  it.each(['requested', 'done', 'pending'])('%s -> 409', async (status) => {
    const s = await setup();
    const t = await mk(s.store.id, s.m1.userId, { status });
    expect((await resolve(t.id, s.ceo)).status).toBe(409);
    expect((await prisma.motoboyTransfer.findUnique({ where: { id: t.id } }))!.status).toBe(status);
  });
  it('lojista -> 403; inexistente -> 404; concorrência: só um vence', async () => {
    const s = await setup();
    const t = await mk(s.store.id, s.m1.userId, { status: 'uncertain' });
    expect((await resolve(t.id, s.owner)).status).toBe(403);
    expect((await resolve('nao-existe', s.ceo)).status).toBe(404);
    const rs = await Promise.all([resolve(t.id, s.ceo), resolve(t.id, s.ceo)]);
    expect(rs.map((x) => x.status).sort()).toEqual([200, 409]);
  });
});

describe('POST /api/admin/transfers/:id/reopen', () => {
  /** Pix resolvido pelo admin pela rota de verdade (grava a auditoria com o status de origem). */
  const resolvedFrom = async (s: any, status: string, extra: any = {}) => {
    const t = await mk(s.store.id, s.m1.userId, { status, lastError: 'X', ...extra });
    const r = await request(app).post(`/api/admin/transfers/${t.id}/resolve`).set('Authorization', bearer(s.ceo)).send({ note: 'paguei por fora, conferido' });
    expect(r.status).toBe(200);
    return t;
  };
  const reopen = (id: string, who: any, note: any = 'marquei resolvido por engano, não foi pago') =>
    request(app).post(`/api/admin/transfers/${id}/reopen`).set('Authorization', bearer(who)).send({ note });
  it('Pix resolvido pelo admin volta para a fila do job, zerado, e fica no histórico', async () => {
    const s = await setup();
    const t = await resolvedFrom(s, 'failed_final', { attempts: 3 });
    const r = await reopen(t.id, s.ceo);
    expect(r.status).toBe(200);
    noKey(r.body);
    const row = (await prisma.motoboyTransfer.findUnique({ where: { id: t.id } }))!;
    expect(row).toMatchObject({ status: 'failed', attempts: 0, doneAt: null, resolvedBy: null, resolutionNote: null, lastError: null });
    expect(row.nextAttemptAt!.getTime()).toBeLessThanOrEqual(Date.now());
    const audit = await prisma.adminMoneyAction.findFirst({ where: { targetId: t.id, type: 'motoboy_transfer_retry' } });
    expect(audit?.reason).toBe('marquei resolvido por engano, não foi pago');
    await prisma.adminMoneyAction.deleteMany({ where: { targetId: t.id } });
  });
  it('resolvido a partir de incerto (o Pix pode ter saído) nunca reabre', async () => {
    const s = await setup();
    const t = await resolvedFrom(s, 'uncertain');
    expect((await reopen(t.id, s.ceo)).status).toBe(409);
    expect((await prisma.motoboyTransfer.findUnique({ where: { id: t.id } }))!.status).toBe('done');
    await prisma.adminMoneyAction.deleteMany({ where: { targetId: t.id } });
  });
  it('tentativa que chegou a ter id no Asaas nunca reabre', async () => {
    const s = await setup();
    const a = await resolvedFrom(s, 'failed', { asaasTransferId: 'tra_1' });
    const b = await resolvedFrom(s, 'failed', { previousAsaasTransferIds: ['tra_0'] });
    expect((await reopen(a.id, s.ceo)).status).toBe(409);
    expect((await reopen(b.id, s.ceo)).status).toBe(409);
    await prisma.adminMoneyAction.deleteMany({ where: { targetId: { in: [a.id, b.id] } } });
  });
  it('resolvido sem auditoria do Resolver nunca reabre', async () => {
    const s = await setup();
    const t = await mk(s.store.id, s.m1.userId, { status: 'done', resolvedBy: `admin:${s.ceo.userId}` });
    expect((await reopen(t.id, s.ceo)).status).toBe(409);
  });
  it('Pix concluído pelo Asaas (sem resolvedBy) nunca reabre', async () => {
    const s = await setup();
    const t = await mk(s.store.id, s.m1.userId, { status: 'done', doneAt: new Date() });
    expect((await reopen(t.id, s.ceo)).status).toBe(409);
    expect((await prisma.motoboyTransfer.findUnique({ where: { id: t.id } }))!.status).toBe('done');
  });
  it.each(['failed', 'uncertain', 'requested'])('%s -> 409', async (status) => {
    const s = await setup();
    const t = await mk(s.store.id, s.m1.userId, { status, resolvedBy: null });
    expect((await reopen(t.id, s.ceo)).status).toBe(409);
  });
  it('Pix manual do DROP -> 409; nota curta -> 400; lojista -> 403; concorrência: só um vence', async () => {
    const s = await setup();
    const manual = await mk(s.store.id, s.m1.userId, { status: 'done', payer: 'platform', resolvedBy: `admin:${s.ceo.userId}` });
    expect((await reopen(manual.id, s.ceo)).status).toBe(409);
    const t = await resolvedFrom(s, 'failed');
    expect((await reopen(t.id, s.ceo, 'curta')).status).toBe(400);
    expect((await reopen(t.id, s.owner)).status).toBe(403);
    const rs = await Promise.all([reopen(t.id, s.ceo), reopen(t.id, s.ceo)]);
    expect(rs.map((x) => x.status).sort()).toEqual([200, 409]);
    await prisma.adminMoneyAction.deleteMany({ where: { targetId: t.id } });
  });
});
