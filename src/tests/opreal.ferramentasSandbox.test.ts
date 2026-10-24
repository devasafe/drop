/** Operação real · as ferramentas de teste que mandam dinheiro da conta-mãe para subcontas só existem no sandbox. */
import request from 'supertest';
import app from '../app';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@oprealsandbox.test';
const ORIGINAL_URL = env.ASAAS_API_URL;
const ROUTES = ['/api/admin/asaas/fund-subaccount', '/api/admin/asaas/fund-for-withdrawal'];

afterEach(async () => { (env as any).ASAAS_API_URL = ORIGINAL_URL; await cleanupUsersByEmailDomain(DOMAIN); });
afterAll(() => prisma.$disconnect());

describe('ferramentas de abastecer subconta', () => {
  it.each(ROUTES)('Asaas de produção: %s → 403 SANDBOX_ONLY', async (path) => {
    (env as any).ASAAS_API_URL = 'https://api.asaas.com/v3';
    const ceo = await createTestUser('ceo', DOMAIN);
    const res = await request(app).post(path).set('Authorization', bearer(ceo)).send({});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SANDBOX_ONLY');
  });

  it.each(ROUTES)('sandbox: %s segue para a validação de sempre', async (path) => {
    (env as any).ASAAS_API_URL = 'https://sandbox.asaas.com/api/v3';
    const ceo = await createTestUser('ceo', DOMAIN);
    const res = await request(app).post(path).set('Authorization', bearer(ceo)).send({});
    expect(res.body?.code).not.toBe('SANDBOX_ONLY');
    expect(res.status).toBe(400);
  });
});
