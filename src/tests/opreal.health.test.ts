/** Operação real · /api/health confere o banco: o Coolify não troca uma versão boa por uma que não fala com o Postgres. */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';

afterEach(() => jest.restoreAllMocks());
afterAll(() => prisma.$disconnect());

describe('GET /api/health', () => {
  it('com o banco respondendo → 200 { ok: true, db: true }', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: true });
  });

  it('com o banco fora → 503 { ok: false, db: false }, sem detalhes do erro', async () => {
    jest.spyOn(prisma, '$queryRaw').mockRejectedValue(new Error('connect ECONNREFUSED postgres://user:senha@db'));
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, db: false });
  });
});
