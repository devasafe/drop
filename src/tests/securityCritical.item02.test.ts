/**
 * Regressão (auditoria de segurança 2026-10-07) — item 2: `wallet:credit` exclusiva do CEO (default, matriz persistida e delegação).
 */
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { Role } from '@prisma/client';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import { getEffectivePermissions } from '../controllers/rolePermissionsController';

const DOMAIN = '@sec02.test';

// Overrides de RolePermissions são globais: guardamos e restauramos os papéis tocados.
const touchedRoles: Role[] = ['gerente_geral', 'cliente'];
let snapshot: { role: Role; permissions: string[]; notificationTargets: Role[]; updatedBy: string }[] = [];

beforeAll(async () => {
  snapshot = await prisma.rolePermissions.findMany({
    where: { role: { in: touchedRoles } },
    select: { role: true, permissions: true, notificationTargets: true, updatedBy: true },
  });
});

afterAll(async () => {
  await prisma.rolePermissions.deleteMany({ where: { role: { in: touchedRoles } } });
  for (const row of snapshot) await prisma.rolePermissions.create({ data: row });
});

afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

describe('Item 2 — wallet:credit exclusiva do CEO', () => {
  it('cliente não credita carteira pelo admin (add-balance) → 403', async () => {
    const cliente = await createTestUser('cliente', DOMAIN);
    const wallet = await prisma.wallet.create({ data: { owner: cliente.userId, ownerType: 'user', balance: 0 } });
    const res = await request(app)
      .post(`/api/admin/wallets/${wallet.id}/add-balance`)
      .set('Authorization', bearer(cliente))
      .send({ amount: 500, reason: 'tentativa de crédito indevido' });
    expect(res.status).toBe(403);
    const after = await prisma.wallet.findUnique({ where: { id: wallet.id } });
    expect(Number(after?.balance)).toBe(0);
  });

  it('cliente não "abastece subconta" (fund-subaccount) → 403', async () => {
    const cliente = await createTestUser('cliente', DOMAIN);
    const res = await request(app)
      .post('/api/admin/asaas/fund-subaccount')
      .set('Authorization', bearer(cliente))
      .send({ recipientType: 'motoboy', recipientId: cliente.userId, amount: 100 });
    expect(res.status).toBe(403);
  });

  it('matriz padrão do cliente não contém wallet:credit', async () => {
    await prisma.rolePermissions.deleteMany({ where: { role: 'cliente' } });
    const { permissions } = await getEffectivePermissions('cliente');
    expect(permissions).not.toContain('wallet:credit');
  });

  it('override persistido com wallet:credit é ignorado em runtime para não-CEO', async () => {
    await prisma.rolePermissions.upsert({
      where: { role: 'gerente_geral' },
      create: { role: 'gerente_geral', permissions: ['wallet:credit', 'user:view_all'], notificationTargets: [], updatedBy: 'test' },
      update: { permissions: ['wallet:credit', 'user:view_all'] },
    });
    const { permissions } = await getEffectivePermissions('gerente_geral');
    expect(permissions).not.toContain('wallet:credit');
    expect(permissions).toContain('user:view_all');
  });

  it('migration strip_wallet_credit remove a permissão de overrides persistidos', async () => {
    await prisma.rolePermissions.upsert({
      where: { role: 'cliente' },
      create: { role: 'cliente', permissions: ['order:create', 'wallet:credit'], notificationTargets: [], updatedBy: 'test' },
      update: { permissions: ['order:create', 'wallet:credit'] },
    });
    const sql = fs.readFileSync(
      path.join(__dirname, '../../prisma/migrations/20261007120000_strip_wallet_credit/migration.sql'),
      'utf8'
    );
    const statement = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    await prisma.$executeRawUnsafe(statement);
    const row = await prisma.rolePermissions.findUnique({ where: { role: 'cliente' } });
    expect(row?.permissions).toEqual(['order:create']);
  });

  it('CEO não consegue delegar wallet:credit, "*" nem chave inexistente', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    for (const bad of ['wallet:credit', '*', 'chave:inventada']) {
      const res = await request(app)
        .put('/api/role-permissions/gerente_geral')
        .set('Authorization', bearer(ceo))
        .send({ permissions: ['user:view_all', bad], notificationTargets: [] });
      expect(res.status).toBe(400);
    }
    const ok = await request(app)
      .put('/api/role-permissions/gerente_geral')
      .set('Authorization', bearer(ceo))
      .send({ permissions: ['user:view_all'], notificationTargets: [] });
    expect(ok.status).toBe(200);
  });
});
