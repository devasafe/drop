import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import { getSaasConfig } from '../utils/settlement';

const DOMAIN = '@saas61.test';
let restore: () => Promise<void>;
beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); });
afterEach(() => cleanupUsersByEmailDomain(DOMAIN));

describe('t61 — configuração da mensalidade nos freios', () => {
  it('CEO grava os 4 campos e o GET devolve; getSaasConfig reflete', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const put = await request(app).put('/api/admin/switches').set('Authorization', bearer(ceo))
      .send({ saasMonthlyFee: 79.9, saasTrialDays: 30, saasGraceDays: 7, directTransfersEnabled: true });
    expect(put.status).toBe(200);
    const get = await request(app).get('/api/admin/switches').set('Authorization', bearer(ceo));
    expect(get.body).toMatchObject({ saasMonthlyFee: 79.9, saasTrialDays: 30, saasGraceDays: 7, directTransfersEnabled: true });
    expect(await getSaasConfig()).toMatchObject({ saasMonthlyFee: 79.9, saasTrialDays: 30, saasGraceDays: 7 });
  });

  it('gerente com settings:manage recebe 403 CEO_ONLY nos 4 campos', async () => {
    await prisma.rolePermissions.upsert({
      where: { role: 'gerente_geral' },
      create: { role: 'gerente_geral', permissions: ['settings:manage'], notificationTargets: [], updatedBy: 'test' },
      update: { permissions: ['settings:manage'] },
    });
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    for (const body of [{ saasMonthlyFee: 10 }, { saasTrialDays: 5 }, { saasGraceDays: 1 }, { directTransfersEnabled: true }]) {
      const r = await request(app).put('/api/admin/switches').set('Authorization', bearer(gerente)).send(body);
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('CEO_ONLY');
    }
  });

  it('valores inválidos → 400', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    for (const body of [{ saasMonthlyFee: -1 }, { saasMonthlyFee: 100001 }, { saasMonthlyFee: 10.123 }, { saasTrialDays: 366 }, { saasTrialDays: -1 }, { saasTrialDays: 1.5 }, { saasGraceDays: 61 }]) {
      const r = await request(app).put('/api/admin/switches').set('Authorization', bearer(ceo)).send(body);
      expect(r.status).toBe(400);
    }
  });
});
