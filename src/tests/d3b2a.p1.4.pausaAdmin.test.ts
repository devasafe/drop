/**
 * D3b-2a · P1.4 — o admin pausa e libera a loja: motivo, escrita condicional (409 quando o estado
 * já é o pedido), histórico na mesma transação, aviso ao dono, ator 'system' para o job da 2b.
 * A pausa não mexe em isOpen nem em pausedUntil.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { grantRolePermissions } from './helpers/d3b1Ops';
import * as actions from '../services/adminAccounts/actions';
import { listTimeline } from '../services/adminAccounts/actions';
import { isAdminPaused, pauseStoreByAdmin, unpauseStoreByAdmin } from '../services/adminAccounts/storePause';

const DOMAIN = '@d3b2ap14.test';
const REASON = 'Denúncia de fraude em análise';
let ceo: TestUser;
let dono: TestUser;

beforeEach(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
  dono = await createTestUser('lojista', DOMAIN);
});
afterEach(async () => {
  jest.restoreAllMocks();
  await cleanupUsersByEmailDomain(DOMAIN);
});

const loja = (extra: Record<string, unknown> = {}) =>
  prisma.store.create({ data: { ownerId: dono.userId, name: 'Pastelaria Admin', isOpen: true, ...extra } as any });
const pause = (by: TestUser, id: string, body: Record<string, unknown> = { reason: REASON }) =>
  request(app).post(`/api/admin/stores/${id}/pause`).set('Authorization', bearer(by)).send(body);
const unpause = (by: TestUser, id: string, body: Record<string, unknown> = {}) =>
  request(app).post(`/api/admin/stores/${id}/unpause`).set('Authorization', bearer(by)).send(body);
const storeOf = (id: string) => prisma.store.findUniqueOrThrow({ where: { id } });
const actionsOf = (storeId: string) =>
  prisma.adminAccountAction.findMany({ where: { storeId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });

describe('POST /admin/stores/:id/pause', () => {
  it('o CEO pausa: grava a pausa, o histórico e avisa o dono; isOpen e pausedUntil ficam como estavam', async () => {
    const until = new Date(Date.now() + 30 * 60_000);
    const store = await loja({ pausedUntil: until });
    const res = await pause(ceo, store.id, { reason: `  ${REASON}  ` });
    expect(res.status).toBe(200);
    expect(res.body.store).toMatchObject({ id: store.id, adminPauseReason: REASON });
    expect(new Date(res.body.store.adminPausedAt).getTime()).toBeGreaterThan(Date.now() - 60_000);

    const saved = await storeOf(store.id);
    expect(saved.adminPausedAt).toBeInstanceOf(Date);
    expect(saved.adminPausedBy).toBe(ceo.userId);
    expect(saved.adminPauseReason).toBe(REASON);
    expect(saved.isOpen).toBe(true);
    expect(saved.pausedUntil?.getTime()).toBe(until.getTime());

    const rows = await actionsOf(store.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'store_pause', reason: REASON, actorId: ceo.userId, actorRole: 'ceo', userId: null });

    const aviso = await prisma.notification.findFirst({ where: { userId: dono.userId, entityId: store.id } });
    expect(aviso).toMatchObject({ title: 'Loja pausada pelo DROP', link: '/seller/dashboard' });
    expect(aviso!.message).toContain(REASON);
  });

  it('já pausada: 409 ALREADY_PAUSED, sem segunda linha', async () => {
    const store = await loja();
    expect((await pause(ceo, store.id)).status).toBe(200);
    const deNovo = await pause(ceo, store.id, { reason: 'Outro motivo qualquer' });
    expect(deNovo.status).toBe(409);
    expect(deNovo.body.code).toBe('ALREADY_PAUSED');
    expect((await storeOf(store.id)).adminPauseReason).toBe(REASON);
    expect(await actionsOf(store.id)).toHaveLength(1);
  });

  it('motivo inválido: 400 REASON_REQUIRED; loja inexistente: 404 STORE_NOT_FOUND', async () => {
    const store = await loja();
    for (const body of [{}, { reason: 'abc' }, { reason: 'x'.repeat(501) }]) {
      const res = await pause(ceo, store.id, body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('REASON_REQUIRED');
    }
    expect((await storeOf(store.id)).adminPausedAt).toBeNull();
    const missing = await pause(ceo, 'loja-que-nao-existe');
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('STORE_NOT_FOUND');
  });

  it('duas pausas ao mesmo tempo: uma vence, a outra recebe 409', async () => {
    const store = await loja();
    const results = await Promise.all([pause(ceo, store.id), pause(ceo, store.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await actionsOf(store.id)).toHaveLength(1);
  });

  it('se o registro falha, a loja não fica pausada e o dono não é avisado', async () => {
    const store = await loja();
    jest.spyOn(actions, 'recordAccountAction').mockRejectedValueOnce(new Error('falha no registro'));
    expect((await pause(ceo, store.id)).status).toBe(500);
    expect((await storeOf(store.id)).adminPausedAt).toBeNull();
    expect(await prisma.notification.count({ where: { userId: dono.userId } })).toBe(0);
  });
});

describe('POST /admin/stores/:id/unpause', () => {
  it('libera: limpa a pausa, grava store_unpause com o motivo opcional e a pausa anterior, e avisa o dono', async () => {
    const store = await loja({ isOpen: false });
    await pause(ceo, store.id);
    const res = await unpause(ceo, store.id, { reason: '  Documentos conferidos  ' });
    expect(res.status).toBe(200);
    expect(res.body.store).toEqual({ id: store.id, adminPausedAt: null, adminPauseReason: null });

    const saved = await storeOf(store.id);
    expect(saved.adminPausedAt).toBeNull();
    expect(saved.adminPausedBy).toBeNull();
    expect(saved.adminPauseReason).toBeNull();
    expect(saved.isOpen).toBe(false);

    const rows = await actionsOf(store.id);
    expect(rows.map((r) => r.type)).toEqual(['store_pause', 'store_unpause']);
    expect(rows[1]).toMatchObject({ reason: 'Documentos conferidos', meta: { pauseReason: REASON } });
    expect(typeof (rows[1].meta as any).pausedAt).toBe('string');

    const aviso = await prisma.notification.findFirst({ where: { userId: dono.userId, title: 'Loja liberada pelo DROP' } });
    expect(aviso).toMatchObject({ entityId: store.id, link: '/seller/dashboard' });
  });

  it('sem motivo também libera; sem pausa: 409 NOT_PAUSED; motivo curto: 400', async () => {
    const store = await loja();
    const semPausa = await unpause(ceo, store.id);
    expect(semPausa.status).toBe(409);
    expect(semPausa.body.code).toBe('NOT_PAUSED');
    await pause(ceo, store.id);
    expect((await unpause(ceo, store.id, { reason: 'ok' })).body.code).toBe('REASON_REQUIRED');
    expect((await storeOf(store.id)).adminPausedAt).not.toBeNull();
    const ok = await unpause(ceo, store.id);
    expect(ok.status).toBe(200);
    expect((await actionsOf(store.id))[1]).toMatchObject({ type: 'store_unpause', reason: null });
    expect((await unpause(ceo, 'loja-que-nao-existe')).body.code).toBe('STORE_NOT_FOUND');
  });
});

describe('permissão store:edit', () => {
  it('403 sem ela; 200 com ela num papel delegado, gravando o papel de equipe', async () => {
    const store = await loja();
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const restoreRole = await grantRolePermissions('gerente_geral', ['store:view_all']);
    try {
      const negado = await pause(gerente, store.id);
      expect(negado.status).toBe(403);
      expect(negado.body.error).toBe('Permissão negada. Você precisa de: store:edit');
      expect((await unpause(gerente, store.id)).status).toBe(403);
      await grantRolePermissions('gerente_geral', ['store:edit']);
      expect((await pause(gerente, store.id)).status).toBe(200);
      expect((await actionsOf(store.id))[0]).toMatchObject({ actorId: gerente.userId, actorRole: 'gerente_geral' });
      expect((await unpause(gerente, store.id)).status).toBe(200);
    } finally {
      await restoreRole();
    }
  });
});

describe('serviço (job da D3b-2b)', () => {
  it('o ator system pausa; repetir lança ALREADY_PAUSED (o job é idempotente); a linha do tempo mostra system sem nome', async () => {
    const store = await loja();
    const system = { id: 'system', role: 'system' };
    await pauseStoreByAdmin(store.id, system, 'Mensalidade cancelada');
    await expect(pauseStoreByAdmin(store.id, system, 'Mensalidade cancelada')).rejects.toMatchObject({ status: 409, code: 'ALREADY_PAUSED' });
    const saved = await storeOf(store.id);
    expect(saved.adminPausedBy).toBe('system');
    const { items } = await listTimeline({ storeId: store.id });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: 'store_pause', reason: 'Mensalidade cancelada', actor: { id: 'system', name: null, role: 'system' } });
    await unpauseStoreByAdmin(store.id, system);
    await expect(unpauseStoreByAdmin(store.id, system)).rejects.toMatchObject({ status: 409, code: 'NOT_PAUSED' });
  });

  it('isAdminPaused lê adminPausedAt', () => {
    expect(isAdminPaused({ adminPausedAt: new Date() })).toBe(true);
    expect(isAdminPaused({ adminPausedAt: '2026-10-20T10:00:00.000Z' })).toBe(true);
    expect(isAdminPaused({ adminPausedAt: null })).toBe(false);
    expect(isAdminPaused({})).toBe(false);
  });
});
