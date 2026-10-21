/**
 * D3b-2a · P1.2 — status, papéis e desconectar passam a gravar block / unblock / roles_change /
 * disconnect em AdminAccountAction, na mesma transação. O resto do comportamento não muda.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { grantRolePermissions } from './helpers/d3b1Ops';
import * as actions from '../services/adminAccounts/actions';
import * as socketEmitter from '../utils/socketEmitter';
import * as notifier from '../services/notifier';

const DOMAIN = '@d3b2ap12.test';
const REASON = 'Fraude confirmada no cartão';
let ceo: TestUser;
let alvo: TestUser;
let forceLogout: jest.SpyInstance;
let dropSocket: jest.SpyInstance;

beforeEach(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
  alvo = await createTestUser('cliente', DOMAIN);
  forceLogout = jest.spyOn(socketEmitter, 'emitForceLogout').mockImplementation(() => undefined);
  dropSocket = jest.spyOn(notifier, 'disconnectUser').mockImplementation(() => undefined);
});
afterEach(async () => {
  jest.restoreAllMocks();
  await cleanupUsersByEmailDomain(DOMAIN);
});

const putStatus = (by: TestUser, id: string, body: Record<string, unknown>) =>
  request(app).put(`/api/admin/users/${id}/status`).set('Authorization', bearer(by)).send(body);
const putRoles = (by: TestUser, id: string, roles: string[]) =>
  request(app).put(`/api/admin/users/${id}/roles`).set('Authorization', bearer(by)).send({ roles });
const disconnect = (by: TestUser, id: string) =>
  request(app).post(`/api/admin/users/${id}/disconnect`).set('Authorization', bearer(by)).send({});
const actionsOf = (userId: string) =>
  prisma.adminAccountAction.findMany({ where: { userId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
const statusOf = async (id: string) =>
  (await prisma.user.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;

describe('PUT /admin/users/:id/status', () => {
  it('bloquear grava block com motivo, autor e o status anterior; segue forçando o logout', async () => {
    const res = await putStatus(ceo, alvo.userId, { status: 'blocked', reason: `  ${REASON}  ` });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ status: 'blocked', blockReason: REASON });
    const rows = await actionsOf(alvo.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'block', reason: REASON, actorId: ceo.userId, actorRole: 'ceo', storeId: null, meta: { before: 'active' },
    });
    expect(forceLogout).toHaveBeenCalledWith(alvo.userId, 'blocked', REASON);
    expect(dropSocket).toHaveBeenCalledWith(alvo.userId);
  });

  it('bloquear sem motivo válido: 400 REASON_REQUIRED e nada muda', async () => {
    for (const body of [{ status: 'blocked' }, { status: 'blocked', reason: 'abc' }, { status: 'blocked', reason: 'x'.repeat(501) }]) {
      const res = await putStatus(ceo, alvo.userId, body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('REASON_REQUIRED');
      expect(typeof res.body.error).toBe('string');
    }
    expect(await statusOf(alvo.userId)).toBe('active');
    expect(await actionsOf(alvo.userId)).toHaveLength(0);
    expect(forceLogout).not.toHaveBeenCalled();
  });

  it('desbloquear grava unblock; o motivo é opcional', async () => {
    await putStatus(ceo, alvo.userId, { status: 'blocked', reason: REASON });
    const comMotivo = await putStatus(ceo, alvo.userId, { status: 'active', reason: ' Pagou a pendência ' });
    expect(comMotivo.status).toBe(200);
    await putStatus(ceo, alvo.userId, { status: 'blocked', reason: REASON });
    const semMotivo = await putStatus(ceo, alvo.userId, { status: 'active' });
    expect(semMotivo.status).toBe(200);
    expect(semMotivo.body.user).toMatchObject({ status: 'active', blockReason: null, blockedAt: null });
    expect((await actionsOf(alvo.userId)).map((r) => [r.type, r.reason])).toEqual([
      ['block', REASON], ['unblock', 'Pagou a pendência'], ['block', REASON], ['unblock', null],
    ]);
  });

  it('desbloquear com motivo curto: 400 e a conta continua bloqueada', async () => {
    await putStatus(ceo, alvo.userId, { status: 'blocked', reason: REASON });
    const res = await putStatus(ceo, alvo.userId, { status: 'active', reason: 'ok' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REASON_REQUIRED');
    expect(await statusOf(alvo.userId)).toBe('blocked');
    expect((await actionsOf(alvo.userId)).map((r) => r.type)).toEqual(['block']);
  });

  it('ativar quem não estava bloqueado e marcar inativo não registram nada', async () => {
    expect((await putStatus(ceo, alvo.userId, { status: 'active' })).status).toBe(200);
    expect((await putStatus(ceo, alvo.userId, { status: 'inactive' })).status).toBe(200);
    expect(await statusOf(alvo.userId)).toBe('inactive');
    expect(await actionsOf(alvo.userId)).toHaveLength(0);
  });

  it('a si mesmo (400) e conta inexistente (404): como antes, sem registro', async () => {
    expect((await putStatus(ceo, ceo.userId, { status: 'blocked', reason: REASON })).status).toBe(400);
    expect((await putStatus(ceo, 'nao-existe-p12', { status: 'blocked', reason: REASON })).status).toBe(404);
    expect(await prisma.adminAccountAction.count({ where: { userId: { in: [ceo.userId, 'nao-existe-p12'] } } })).toBe(0);
  });

  it('se o registro falha, o bloqueio não acontece (mesma transação)', async () => {
    jest.spyOn(actions, 'recordAccountAction').mockRejectedValueOnce(new Error('falha no registro'));
    const res = await putStatus(ceo, alvo.userId, { status: 'blocked', reason: REASON });
    expect(res.status).toBe(500);
    expect(await statusOf(alvo.userId)).toBe('active');
    expect(await actionsOf(alvo.userId)).toHaveLength(0);
    expect(forceLogout).not.toHaveBeenCalled();
  });

  it('papel delegado: com user:block grava o papel de equipe; sem ela, 403', async () => {
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const restore = await grantRolePermissions('gerente_geral', ['user:block']);
    try {
      const ok = await putStatus(gerente, alvo.userId, { status: 'blocked', reason: REASON });
      expect(ok.status).toBe(200);
      expect((await actionsOf(alvo.userId))[0]).toMatchObject({ actorId: gerente.userId, actorRole: 'gerente_geral' });
      await grantRolePermissions('gerente_geral', ['user:view_all']);
      expect((await putStatus(gerente, alvo.userId, { status: 'active' })).status).toBe(403);
      expect(await actionsOf(alvo.userId)).toHaveLength(1);
    } finally {
      await restore();
    }
  });
});

describe('PUT /admin/users/:id/roles', () => {
  it('grava roles_change com antes e depois', async () => {
    const res = await putRoles(ceo, alvo.userId, ['lojista']);
    expect(res.status).toBe(200);
    const rows = await actionsOf(alvo.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'roles_change', actorId: ceo.userId, actorRole: 'ceo', reason: null,
      meta: { before: ['cliente'], after: ['cliente', 'lojista'] },
    });
  });

  it('sem mudança de papel não registra', async () => {
    expect((await putRoles(ceo, alvo.userId, ['cliente'])).status).toBe(200);
    expect(await actionsOf(alvo.userId)).toHaveLength(0);
  });

  it('trabalho aberto: 409 como antes e nada registrado', async () => {
    const lojista = await createTestUser('lojista', DOMAIN);
    const store = await prisma.store.create({ data: { ownerId: lojista.userId, name: 'Loja P1.2', isOpen: true } });
    await prisma.order.create({
      data: { customerId: alvo.userId, storeId: store.id, totalValue: 30, deliveryFee: 0, status: 'pago', paymentStatus: 'paid' } as any,
    });
    const res = await putRoles(ceo, lojista.userId, ['cliente']);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ROLE_HAS_OPEN_WORK');
    expect(await actionsOf(lojista.userId)).toHaveLength(0);
  });

  it('se o registro falha, papéis e loja ficam como estavam', async () => {
    const lojista = await createTestUser('lojista', DOMAIN);
    const store = await prisma.store.create({ data: { ownerId: lojista.userId, name: 'Loja P1.2b', isOpen: true } });
    jest.spyOn(actions, 'recordAccountAction').mockRejectedValueOnce(new Error('falha no registro'));
    const res = await putRoles(ceo, lojista.userId, ['cliente']);
    expect(res.status).toBe(500);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: lojista.userId } })).roles).toContain('lojista');
    expect((await prisma.store.findUniqueOrThrow({ where: { id: store.id } })).isOpen).toBe(true);
    expect(await actionsOf(lojista.userId)).toHaveLength(0);
  });
});

describe('POST /admin/users/:id/disconnect', () => {
  it('grava disconnect e segue derrubando a sessão', async () => {
    const res = await disconnect(ceo, alvo.userId);
    expect(res.status).toBe(200);
    expect(await actionsOf(alvo.userId)).toEqual([
      expect.objectContaining({ type: 'disconnect', actorId: ceo.userId, actorRole: 'ceo', reason: null }),
    ]);
    expect(forceLogout).toHaveBeenCalledWith(alvo.userId, 'admin_disconnect');
    expect(dropSocket).toHaveBeenCalledWith(alvo.userId);
  });

  it('a si mesmo (400) e inexistente (404): sem registro', async () => {
    expect((await disconnect(ceo, ceo.userId)).status).toBe(400);
    expect((await disconnect(ceo, 'nao-existe-p12')).status).toBe(404);
    expect(await prisma.adminAccountAction.count({ where: { userId: { in: [ceo.userId, 'nao-existe-p12'] } } })).toBe(0);
  });

  it('se o registro falha, ninguém é desconectado', async () => {
    jest.spyOn(actions, 'recordAccountAction').mockRejectedValueOnce(new Error('falha no registro'));
    const res = await disconnect(ceo, alvo.userId);
    expect(res.status).toBe(500);
    expect(forceLogout).not.toHaveBeenCalled();
    expect(dropSocket).not.toHaveBeenCalled();
  });
});
