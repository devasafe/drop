/**
 * Permissões, rodada final (22/10):
 *  - I1: reviews:moderate volta à tela (ação em Lojas); as outras aposentadas saem da linha ao salvar e são
 *    descartadas na leitura (gateway:manage e order:manage_payment ficam só com o CEO, via '*');
 *  - M3: user:edit_<público> só vale com a chave de ver do mesmo público;
 *  - M4: wallet:view_clients só alcança a carteira pessoal de quem é cliente (sem papel de loja, motoboy nem equipe).
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { grantRolePermissions } from './helpers/d3b1Ops';
import { cleanupAccountsFixtures, createPerson } from './helpers/d3b2aRead';
import { ALL_PERMISSIONS, RETIRED_PERMISSIONS } from '../services/permissions/catalog';

const DOMAIN = '@permissoes-finalfix.test';
const MARK = 'permfinal';
let ceo: TestUser;
let manager: TestUser;
let previous: any = null;
const walletIds: string[] = [];

beforeAll(async () => {
  previous = await prisma.rolePermissions.findUnique({ where: { role: 'gerente_motoboys' } });
  ceo = await createTestUser('ceo', DOMAIN);
  manager = await createTestUser('cliente', DOMAIN);
  await prisma.user.update({ where: { id: manager.userId }, data: { roles: ['cliente', 'gerente_motoboys'] } });
});
afterAll(async () => {
  if (previous) {
    const { permissions, notificationTargets, updatedBy } = previous;
    await prisma.rolePermissions.update({ where: { role: 'gerente_motoboys' }, data: { permissions, notificationTargets, updatedBy } });
  } else {
    await prisma.rolePermissions.deleteMany({ where: { role: 'gerente_motoboys' } });
  }
  await prisma.wallet.deleteMany({ where: { id: { in: walletIds } } });
  await cleanupAccountsFixtures(DOMAIN, MARK);
  await prisma.$disconnect();
});

const as = (who: TestUser) => ({ Authorization: bearer(who) });

describe('I1: chaves aposentadas', () => {
  it('reviews:moderate volta à tela como ação em Lojas, com explicação', async () => {
    expect(RETIRED_PERMISSIONS).not.toContain('reviews:moderate');
    expect(ALL_PERMISSIONS.find((p) => p.key === 'reviews:moderate')).toMatchObject({
      label: 'Apagar resposta de loja em avaliação', category: 'Lojas e planos', kind: 'action', area: 'lojas',
      requires: ['store:view_all'], description: expect.stringContaining('Ver todas as lojas'),
    });
    const res = await request(app).get('/api/role-permissions').set(as(ceo));
    expect(res.body.allPermissions.map((p: any) => p.key)).toContain('reviews:moderate');
  });

  it('PUT com chave aposentada grava sem ela', async () => {
    const res = await request(app).put('/api/role-permissions/gerente_motoboys').set(as(ceo))
      .send({ permissions: ['user:view_motoboys', 'gateway:manage', 'dashboard:view_motoboy_metrics', 'reviews:moderate'] });
    expect(res.status).toBe(200);
    const row = await prisma.rolePermissions.findUnique({ where: { role: 'gerente_motoboys' } });
    expect(row?.permissions).toEqual(['user:view_motoboys', 'reviews:moderate']);
  });

  it('linha antiga com gateway:manage: /me não devolve a chave e a rota do gateway recusa', async () => {
    const restore = await grantRolePermissions('gerente_motoboys', ['gateway:manage', 'order:manage_payment', 'user:view_motoboys']);
    try {
      const me = await request(app).get('/api/role-permissions/me').set(as(manager));
      expect(me.body.permissions).toContain('user:view_motoboys');
      expect(me.body.permissions).not.toContain('gateway:manage');
      expect(me.body.permissions).not.toContain('order:manage_payment');
      const gw = await request(app).get('/api/admin/asaas/subaccounts').set(as(manager));
      expect(gw.status).toBe(403);
    } finally {
      await restore();
    }
  });
});

describe('M3: editar exige ver o mesmo público', () => {
  it('só user:edit_motoboys, sem ver motoboys: bloquear e desconectar dão 403', async () => {
    const motoboyId = await createPerson(DOMAIN, { name: `${MARK} Motoboy`, roles: ['motoboy', 'cliente'], role: 'motoboy', activeRole: 'motoboy' });
    const restore = await grantRolePermissions('gerente_motoboys', ['user:edit_motoboys']);
    try {
      const block = await request(app).put(`/api/admin/users/${motoboyId}/status`).set(as(manager)).send({ status: 'blocked', reason: 'Sem ver motoboys' });
      expect(block.status).toBe(403);
      const disc = await request(app).post(`/api/admin/users/${motoboyId}/disconnect`).set(as(manager));
      expect(disc.status).toBe(403);
      expect((await prisma.user.findUnique({ where: { id: motoboyId } }))?.status).toBe('active');
    } finally {
      await restore();
    }
  });
});

describe('M4: carteira de cliente é de quem é só cliente', () => {
  it('wallet:view_clients: a carteira pessoal de um motoboy ou lojista fica de fora', async () => {
    const clientId = await createPerson(DOMAIN, { name: `${MARK} Cliente` });
    const courierId = await createPerson(DOMAIN, { name: `${MARK} Moto`, roles: ['motoboy', 'cliente'], role: 'motoboy', activeRole: 'motoboy' });
    const sellerId = await createPerson(DOMAIN, { name: `${MARK} Loja`, roles: ['lojista', 'cliente'], role: 'lojista', activeRole: 'lojista' });
    const [cw, mw, sw] = await Promise.all([clientId, courierId, sellerId].map((owner) =>
      prisma.wallet.create({ data: { owner, ownerType: 'user' } })));
    walletIds.push(cw.id, mw.id, sw.id);
    const restore = await grantRolePermissions('gerente_motoboys', ['wallet:view_clients']);
    try {
      const res = await request(app).get('/api/admin/wallets').set(as(manager));
      expect(res.status).toBe(200);
      const ids = res.body.map((w: any) => w._id);
      expect(ids).toContain(cw.id);
      expect(ids).not.toContain(mw.id);
      expect(ids).not.toContain(sw.id);
      const tx = await request(app).get(`/api/admin/wallets/${mw.id}/transactions`).set(as(manager));
      expect(tx.status).toBe(403);
      expect(tx.body.code).toBe('AUDIENCE_FORBIDDEN');
    } finally {
      await restore();
    }
  });
});
