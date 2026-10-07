/**
 * Regressão (riscos remanescentes 2026-10-07) — f10: troca de papel pelo admin.
 *  - PUT /admin/users/:id/role gravava `roles: [role]`: um lojista que também é cliente
 *    perdia o papel de cliente (e o de motoboy, etc.). Agora os papéis-base são mantidos;
 *    só o papel administrativo anterior é substituído.
 *  - PUT /role e PUT /status devolviam o usuário inteiro, com o hash da senha.
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

describe('f10 — PUT /admin/users/:id/role', () => {
  it('mantém os papéis-base ao trocar o papel ativo', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const alvo = await createTestUser('lojista', DOMAIN); // roles: [lojista, cliente]
    const res = await request(app).put(`/api/admin/users/${alvo.userId}/role`).set('Authorization', bearer(ceo)).send({ role: 'motoboy' });
    expect(res.status).toBe(200);
    const u = await prisma.user.findUnique({ where: { id: alvo.userId } });
    expect(u?.role).toBe('motoboy');
    expect([...(u?.roles || [])].sort()).toEqual(['cliente', 'lojista', 'motoboy']);
  });

  it('rebaixar admin remove só o papel administrativo', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const gerente = await createTestUser('gerente_geral', DOMAIN); // roles: [gerente_geral, cliente]
    const res = await request(app).put(`/api/admin/users/${gerente.userId}/role`).set('Authorization', bearer(ceo)).send({ role: 'cliente' });
    expect(res.status).toBe(200);
    const u = await prisma.user.findUnique({ where: { id: gerente.userId } });
    expect(u?.roles).toEqual(['cliente']);
  });

  it('respostas de /role e /status não trazem o hash da senha', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const alvo = await createTestUser('cliente', DOMAIN);
    const r1 = await request(app).put(`/api/admin/users/${alvo.userId}/role`).set('Authorization', bearer(ceo)).send({ role: 'lojista' });
    const r2 = await request(app).put(`/api/admin/users/${alvo.userId}/status`).set('Authorization', bearer(ceo)).send({ status: 'active' });
    for (const r of [r1, r2]) {
      expect(r.status).toBe(200);
      expect(JSON.stringify(r.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
    }
  });
});
