/**
 * Regressão (riscos remanescentes 2026-10-07) — f04: o JWT não basta nas rotas HTTP.
 * O token vale 2 dias e era aceito sem olhar o banco: usuário bloqueado seguia operando
 * e um admin rebaixado seguia com o papel antigo até o token expirar. O `authenticate`
 * agora confere a conta (existe, não bloqueada) e se o papel do token ainda é dela.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@sf04.test';

afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

describe('f04 — authenticate confere a conta no banco', () => {
  it('conta ativa segue funcionando', async () => {
    const u = await createTestUser('cliente', DOMAIN);
    const res = await request(app).get('/api/orders').set('Authorization', bearer(u));
    expect(res.status).toBe(200);
  });

  it('conta bloqueada é recusada mesmo com token válido', async () => {
    const u = await createTestUser('cliente', DOMAIN);
    await prisma.user.update({ where: { id: u.userId }, data: { status: 'blocked' } });
    const res = await request(app).get('/api/orders').set('Authorization', bearer(u));
    expect(res.status).toBe(403);
  });

  it('admin rebaixado perde o acesso administrativo na hora', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const ok = await request(app).get('/api/admin/users').set('Authorization', bearer(ceo));
    expect(ok.status).toBe(200);

    await prisma.user.update({ where: { id: ceo.userId }, data: { role: 'cliente', activeRole: 'cliente', roles: ['cliente'] } });
    const res = await request(app).get('/api/admin/users').set('Authorization', bearer(ceo));
    expect(res.status).toBe(401);
  });

  it('token de usuário apagado é recusado', async () => {
    const u = await createTestUser('cliente', DOMAIN);
    await prisma.user.delete({ where: { id: u.userId } });
    const res = await request(app).get('/api/orders').set('Authorization', bearer(u));
    expect(res.status).toBe(401);
  });
});
