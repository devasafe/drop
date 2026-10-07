/**
 * Regressão (auditoria de segurança 2026-10-07) — item 1: cadastro só aceita cliente/lojista/motoboy; papel admin só por CEO.
 */
import request from 'supertest';
import { Role } from '@prisma/client';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@sec01.test';

const registerBody = (extra: Record<string, unknown> = {}) => ({
  name: 'Fulano Teste',
  email: `reg-${Date.now()}-${Math.random().toString(36).slice(2)}${DOMAIN}`,
  password: 'SenhaForte123',
  acceptedTermsVersion: '1.0',
  acceptedPrivacyVersion: '1.0',
  ...extra,
});

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

describe('Item 1 — cadastro não aceita papel administrativo', () => {
  it.each(['ceo', 'gerente_geral', 'marketing'])('role "%s" no cadastro → 400 e nenhum usuário criado', async (role) => {
    const body = registerBody({ role });
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(400);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    expect(user).toBeNull();
  });

  it('campos extras (roles/activeRole/permissions) no corpo são ignorados', async () => {
    const body = registerBody({ roles: ['ceo'], activeRole: 'ceo', permissions: ['*'], status: 'active' });
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(201);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    expect(user?.roles).toEqual(['cliente']);
    expect(user?.activeRole).toBe('cliente');
    expect(user?.permissions ?? []).toEqual([]);
  });

  it('papéis base continuam funcionando (motoboy)', async () => {
    const body = registerBody({ role: 'motoboy' });
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(201);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    expect(user?.roles).toEqual(['motoboy', 'cliente']);
  });

  it('não-CEO com user:manage_roles não promove ninguém a papel admin', async () => {
    await prisma.rolePermissions.upsert({
      where: { role: 'gerente_geral' },
      create: { role: 'gerente_geral', permissions: ['user:manage_roles'], notificationTargets: [], updatedBy: 'test' },
      update: { permissions: ['user:manage_roles'] },
    });
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const alvo = await createTestUser('cliente', DOMAIN);

    const res = await request(app)
      .put(`/api/admin/users/${alvo.userId}/role`)
      .set('Authorization', bearer(gerente))
      .send({ role: 'gerente_geral' });
    expect(res.status).toBe(403);
    const after = await prisma.user.findUnique({ where: { id: alvo.userId } });
    expect(after?.activeRole).toBe('cliente');

    // Nem rebaixar quem já é administrador
    const ceoAlvo = await createTestUser('ceo', DOMAIN);
    const demote = await request(app)
      .put(`/api/admin/users/${ceoAlvo.userId}/role`)
      .set('Authorization', bearer(gerente))
      .send({ role: 'cliente' });
    expect(demote.status).toBe(403);

    // Papel base continua delegável
    const ok = await request(app)
      .put(`/api/admin/users/${alvo.userId}/role`)
      .set('Authorization', bearer(gerente))
      .send({ role: 'lojista' });
    expect(ok.status).toBe(200);
  });

  it('CEO consegue atribuir papel admin', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const alvo = await createTestUser('cliente', DOMAIN);
    const res = await request(app)
      .put(`/api/admin/users/${alvo.userId}/role`)
      .set('Authorization', bearer(ceo))
      .send({ role: 'gerente_geral' });
    expect(res.status).toBe(200);
  });
});

