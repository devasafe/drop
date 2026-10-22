/**
 * Permissões por público (22/10), a cadeia inteira no servidor: o CEO grava as caixinhas do
 * gerente de motoboys, a conta cliente+gerente_motoboys lê o /me e só alcança motoboys em
 * Usuários, Carteiras, Verificações e nas ações da ficha. A tela esconde; o servidor recusa.
 * A proteção das contas da equipe (STAFF_TARGET_FORBIDDEN) continua valendo.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { grantRolePermissions } from './helpers/d3b1Ops';
import { cleanupAccountsFixtures, createPerson } from './helpers/d3b2aRead';
import * as socketEmitter from '../utils/socketEmitter';
import * as notifier from '../services/notifier';

const DOMAIN = '@permissoes-publico.test';
const MARK = 'permpublico';
const MANAGER_KEYS = ['user:view_motoboys', 'wallet:view_motoboys', 'verification:review_motoboys'];

let previousRow: any = null;
let ceo: TestUser;
let manager: TestUser;
let clientId: string;
let motoboyId: string;
let staffMotoboyId: string;
let walletIds: string[] = [];

beforeAll(async () => {
  previousRow = await prisma.rolePermissions.findUnique({ where: { role: 'gerente_motoboys' } });
  ceo = await createTestUser('ceo', DOMAIN);
  manager = await createTestUser('cliente', DOMAIN);
  await prisma.user.update({ where: { id: manager.userId }, data: { roles: ['cliente', 'gerente_motoboys'] } });
  clientId = await createPerson(DOMAIN, { name: `${MARK} Cliente` });
  motoboyId = await createPerson(DOMAIN, { name: `${MARK} Motoboy`, roles: ['motoboy', 'cliente'], role: 'motoboy', activeRole: 'motoboy' });
  staffMotoboyId = await createPerson(DOMAIN, {
    name: `${MARK} Motoboy da equipe`, roles: ['motoboy', 'cliente', 'gerente_geral'], role: 'motoboy', activeRole: 'motoboy',
  });
  const wallets = await Promise.all([
    prisma.wallet.create({ data: { owner: clientId, ownerType: 'user' } }),
    prisma.wallet.create({ data: { owner: motoboyId, ownerType: 'motoboy' } }),
  ]);
  walletIds = wallets.map((w) => w.id);
});

afterAll(async () => {
  if (previousRow) {
    const { permissions, notificationTargets, updatedBy } = previousRow;
    await prisma.rolePermissions.update({ where: { role: 'gerente_motoboys' }, data: { permissions, notificationTargets, updatedBy } });
  } else {
    await prisma.rolePermissions.deleteMany({ where: { role: 'gerente_motoboys' } });
  }
  await prisma.wallet.deleteMany({ where: { id: { in: walletIds } } });
  await cleanupAccountsFixtures(DOMAIN, MARK);
  await prisma.$disconnect();
});

const as = (who: TestUser) => ({ Authorization: bearer(who) });
const listUsers = (who: TestUser, query: Record<string, string> = {}) =>
  request(app).get('/api/admin/users').query(query).set(as(who));

describe('gerente de motoboys com as caixinhas por público', () => {
  it('1. o CEO grava por PUT as caixinhas do gerente de motoboys', async () => {
    const res = await request(app).put('/api/role-permissions/gerente_motoboys').set(as(ceo)).send({ permissions: MANAGER_KEYS });
    expect(res.status).toBe(200);
    const row = await prisma.rolePermissions.findUnique({ where: { role: 'gerente_motoboys' } });
    expect(row?.permissions).toEqual(MANAGER_KEYS);
  });

  it('2. a conta cliente+gerente_motoboys lê /me e recebe as chaves', async () => {
    const res = await request(app).get('/api/role-permissions/me').set(as(manager));
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('cliente');
    expect(res.body.teamRoles).toEqual(['gerente_motoboys']);
    expect(res.body.permissions).toEqual(expect.arrayContaining(MANAGER_KEYS));
  });

  it('3. Usuários: aba motoboy 200, aba cliente 403; sem aba, só motoboys de fora da equipe', async () => {
    const ok = await listUsers(manager, { tab: 'motoboy', q: MARK });
    expect(ok.status).toBe(200);
    expect(ok.body.items.map((u: any) => u.id)).toEqual([motoboyId]);

    for (const tab of ['cliente', 'lojista', 'equipe', 'bloqueados']) {
      const no = await listUsers(manager, { tab });
      expect(no.status).toBe(403);
      expect(no.body.code).toBe('AUDIENCE_FORBIDDEN');
    }

    const all = await listUsers(manager, { q: MARK });
    expect(all.status).toBe(200);
    expect(all.body.items.map((u: any) => u.id)).toEqual([motoboyId]);
  });

  it('4. a ficha e o histórico de um cliente dão 403; os de um motoboy, 200', async () => {
    const cli = await request(app).get(`/api/admin/users/${clientId}`).set(as(manager));
    expect(cli.status).toBe(403);
    expect(cli.body.code).toBe('AUDIENCE_FORBIDDEN');
    const cliTl = await request(app).get(`/api/admin/users/${clientId}/timeline`).set(as(manager));
    expect(cliTl.status).toBe(403);
    const staff = await request(app).get(`/api/admin/users/${staffMotoboyId}`).set(as(manager));
    expect(staff.status).toBe(403);

    const moto = await request(app).get(`/api/admin/users/${motoboyId}`).set(as(manager));
    expect(moto.status).toBe(200);
    expect(moto.body.profile.id).toBe(motoboyId);
    // Sem user:edit_motoboys nem user:block: a ficha não oferece bloquear.
    expect(moto.body.can.block).toBe(false);
    const motoTl = await request(app).get(`/api/admin/users/${motoboyId}/timeline`).set(as(manager));
    expect(motoTl.status).toBe(200);

    const note = await request(app).post(`/api/admin/users/${clientId}/notes`).set(as(manager)).send({ text: 'nota fora do público' });
    expect(note.status).toBe(403);
  });

  it('5. /admin/wallets traz só carteiras de motoboy; o extrato de carteira de cliente dá 403', async () => {
    const res = await request(app).get('/api/admin/wallets').set(as(manager));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((w: any) => w.ownerType === 'motoboy')).toBe(true);
    expect(res.body.map((w: any) => w._id)).toContain(walletIds[1]);

    const tx = await request(app).get(`/api/admin/wallets/${walletIds[0]}/transactions`).set(as(manager));
    expect(tx.status).toBe(403);
    expect(tx.body.code).toBe('AUDIENCE_FORBIDDEN');
  });

  it('6. Verificações: a fila de motoboys dá 200; a de lojas, 403', async () => {
    const moto = await request(app).get('/api/verification/admin/motoboy-pending').set(as(manager));
    expect(moto.status).toBe(200);
    const stores = await request(app).get('/api/verification/admin/store-pending').set(as(manager));
    expect(stores.status).toBe(403);
  });

  it('7. com user:edit_motoboys: bloqueia e desconecta motoboy; cliente dá 403; equipe continua só do CEO', async () => {
    jest.spyOn(socketEmitter, 'emitForceLogout').mockImplementation(() => undefined as any);
    jest.spyOn(notifier, 'disconnectUser').mockImplementation(() => undefined as any);
    const restore = await grantRolePermissions('gerente_motoboys', [...MANAGER_KEYS, 'user:edit_motoboys']);
    try {
      const detail = await request(app).get(`/api/admin/users/${motoboyId}`).set(as(manager));
      expect(detail.body.can).toMatchObject({ block: true, disconnect: true });

      const block = (id: string) =>
        request(app).put(`/api/admin/users/${id}/status`).set(as(manager)).send({ status: 'blocked', reason: 'Teste de público' });

      const moto = await block(motoboyId);
      expect(moto.status).toBe(200);
      expect((await prisma.user.findUnique({ where: { id: motoboyId } }))?.status).toBe('blocked');

      const cli = await block(clientId);
      expect(cli.status).toBe(403);
      expect(cli.body.code).toBe('AUDIENCE_FORBIDDEN');
      expect((await prisma.user.findUnique({ where: { id: clientId } }))?.status).toBe('active');

      const staff = await block(staffMotoboyId);
      expect(staff.status).toBe(403);
      expect(staff.body.code).toBe('STAFF_TARGET_FORBIDDEN');

      const discMoto = await request(app).post(`/api/admin/users/${motoboyId}/disconnect`).set(as(manager));
      expect(discMoto.status).toBe(200);
      const discCli = await request(app).post(`/api/admin/users/${clientId}/disconnect`).set(as(manager));
      expect(discCli.status).toBe(403);
      expect(discCli.body.code).toBe('AUDIENCE_FORBIDDEN');

      const self = await request(app).put(`/api/admin/users/${manager.userId}/status`).set(as(manager)).send({ status: 'blocked', reason: 'Autoação' });
      expect(self.status).toBe(400);
    } finally {
      await restore();
      await prisma.user.update({ where: { id: motoboyId }, data: { status: 'active', blockedAt: null, blockedBy: null, blockReason: null } });
      jest.restoreAllMocks();
    }
  });

  it('8. com user:view_all e wallet:view_all, o comportamento é o de hoje', async () => {
    const restore = await grantRolePermissions('gerente_motoboys', ['user:view_all', 'wallet:view_all']);
    try {
      const cli = await listUsers(manager, { tab: 'cliente', q: MARK });
      expect(cli.status).toBe(200);
      expect(cli.body.items.map((u: any) => u.id)).toEqual([clientId]);
      const equipe = await listUsers(manager, { tab: 'equipe', q: MARK });
      expect(equipe.status).toBe(200);
      expect(equipe.body.items.map((u: any) => u.id)).toEqual([staffMotoboyId]);
      const detail = await request(app).get(`/api/admin/users/${clientId}`).set(as(manager));
      expect(detail.status).toBe(200);
      const wallets = await request(app).get('/api/admin/wallets').set(as(manager));
      expect(wallets.status).toBe(200);
      expect(wallets.body.map((w: any) => w._id)).toEqual(expect.arrayContaining(walletIds));
    } finally {
      await restore();
    }
  });

  it('sem nenhuma chave de Usuários nem de Carteiras: 403 como antes', async () => {
    const restore = await grantRolePermissions('gerente_motoboys', ['theme:edit']);
    try {
      expect((await listUsers(manager)).status).toBe(403);
      expect((await request(app).get(`/api/admin/users/${motoboyId}`).set(as(manager))).status).toBe(403);
      expect((await request(app).get('/api/admin/wallets').set(as(manager))).status).toBe(403);
      const block = await request(app).put(`/api/admin/users/${motoboyId}/status`).set(as(manager)).send({ status: 'blocked', reason: 'Sem chave' });
      expect(block.status).toBe(403);
    } finally {
      await restore();
    }
  });
});

describe('PUT /role-permissions e o catálogo', () => {
  it('caixinha que saiu da lista é aceita sem erro; chave inexistente continua 400', async () => {
    const restore = await grantRolePermissions('gerente_motoboys', []);
    try {
      const ok = await request(app).put('/api/role-permissions/gerente_motoboys').set(as(ceo))
        .send({ permissions: ['user:view_motoboys', 'dashboard:view_motoboy_metrics'] });
      expect(ok.status).toBe(200);
      const row = await prisma.rolePermissions.findUnique({ where: { role: 'gerente_motoboys' } });
      // Não apaga a chave antiga da linha: só deixa de mostrá-la.
      expect(row?.permissions).toEqual(['user:view_motoboys', 'dashboard:view_motoboy_metrics']);

      const bad = await request(app).put('/api/role-permissions/gerente_motoboys').set(as(ceo)).send({ permissions: ['nao:existe'] });
      expect(bad.status).toBe(400);
    } finally {
      await restore();
    }
  });

  it('GET /role-permissions traz o catálogo com tipo, área e o que a ação precisa', async () => {
    const res = await request(app).get('/api/role-permissions').set(as(ceo));
    expect(res.status).toBe(200);
    const byKey = new Map(res.body.allPermissions.map((p: any) => [p.key, p]));
    expect(byKey.get('user:view_motoboys')).toMatchObject({ kind: 'opens', area: 'usuarios', audience: 'motoboys' });
    expect(byKey.get('store:edit')).toMatchObject({ kind: 'action', area: 'lojas', requires: ['store:view_all'] });
    expect(byKey.has('dashboard:view_motoboy_metrics')).toBe(false);
  });
});

describe('Avisos da home: banners com banner:manage', () => {
  it('quem tem banner:manage lê e grava banners; sem ela, 403', async () => {
    const restore = await grantRolePermissions('gerente_motoboys', ['banner:manage']);
    try {
      const ok = await request(app).get('/api/banners/all').set(as(manager));
      expect(ok.status).toBe(200);
    } finally {
      await restore();
    }
    const restoreNone = await grantRolePermissions('gerente_motoboys', ['theme:edit']);
    try {
      const no = await request(app).get('/api/banners/all').set(as(manager));
      expect(no.status).toBe(403);
      const noPost = await request(app).post('/api/banners').set(as(manager)).send({});
      expect(noPost.status).toBe(403);
    } finally {
      await restoreNone();
    }
  });
});
