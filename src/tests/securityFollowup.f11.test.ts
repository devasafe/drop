/**
 * Regressão (riscos remanescentes 2026-10-07) — f11: GET /user/public/:userId.
 *  - Devolvia `_id: undefined` (o repositório Prisma expõe `id`), quebrando links do perfil.
 *  - Rota pública revelava papéis administrativos (quem é CEO/gerente) — alvo de phishing.
 */
import request from 'supertest';
import app from '../app';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser } from './helpers/authUser';

const DOMAIN = '@sf11.test';

afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

describe('f11 — perfil público', () => {
  it('devolve o id e só os papéis-base', async () => {
    const ceo = await createTestUser('ceo', DOMAIN); // roles: [ceo, cliente]
    const res = await request(app).get(`/api/user/public/${ceo.userId}`);
    expect(res.status).toBe(200);
    expect(res.body._id).toBe(ceo.userId);
    expect(res.body.roles).toEqual(['cliente']);
    expect(res.body.activeRole).toBe('cliente');
    expect(res.body.email).toBeUndefined();
  });

  it('motoboy aparece como motoboy', async () => {
    const mb = await createTestUser('motoboy', DOMAIN);
    const res = await request(app).get(`/api/user/public/${mb.userId}`);
    expect(res.body.roles).toContain('motoboy');
  });
});
