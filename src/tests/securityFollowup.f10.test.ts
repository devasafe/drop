/**
 * Regressão (riscos remanescentes 2026-10-07) — f10: troca de papel pelo admin.
 *  - PUT /admin/users/:id/role gravava `roles: [role]`: um lojista que também é cliente
 *    perdia o papel de cliente (e o de motoboy, etc.). A rota virou PUT /admin/users/:id/roles
 *    (lista completa): acrescentar um papel não apaga os outros e `cliente` sempre fica.
 *  - PUT /role(s) e PUT /status devolviam o usuário inteiro, com o hash da senha.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@sf10.test';

afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

describe('f10 — PUT /admin/users/:id/roles', () => {
  it('mantém os papéis-base ao acrescentar outro', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const alvo = await createTestUser('lojista', DOMAIN); // roles: [lojista, cliente]
    const res = await request(app).put(`/api/admin/users/${alvo.userId}/roles`).set('Authorization', bearer(ceo)).send({ roles: ['lojista', 'motoboy'] });
    expect(res.status).toBe(200);
    const u = await prisma.user.findUnique({ where: { id: alvo.userId } });
    expect(u?.role).toBe('lojista');
    expect([...(u?.roles || [])].sort()).toEqual(['cliente', 'lojista', 'motoboy']);
  });

  it('rebaixar admin remove só o papel administrativo', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const gerente = await createTestUser('gerente_geral', DOMAIN); // roles: [gerente_geral, cliente]
    const res = await request(app).put(`/api/admin/users/${gerente.userId}/roles`).set('Authorization', bearer(ceo)).send({ roles: ['cliente'] });
    expect(res.status).toBe(200);
    const u = await prisma.user.findUnique({ where: { id: gerente.userId } });
    expect(u?.roles).toEqual(['cliente']);
  });

  it('respostas de /roles e /status não trazem o hash da senha', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const alvo = await createTestUser('cliente', DOMAIN);
    const r1 = await request(app).put(`/api/admin/users/${alvo.userId}/roles`).set('Authorization', bearer(ceo)).send({ roles: ['lojista'] });
    const r2 = await request(app).put(`/api/admin/users/${alvo.userId}/status`).set('Authorization', bearer(ceo)).send({ status: 'active' });
    for (const r of [r1, r2]) {
      expect(r.status).toBe(200);
      expect(JSON.stringify(r.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
    }
  });
});
