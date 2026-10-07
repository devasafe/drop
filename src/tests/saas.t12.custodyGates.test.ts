import request from 'supertest';
import app from '../app';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';

const DOMAIN = '@saas12.test';
let restore: () => Promise<void>;
beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); });
afterEach(() => cleanupUsersByEmailDomain(DOMAIN));

const ROUTES: [string, string][] = [
  ['post', '/api/wallets/USER/topup'],
  ['post', '/api/withdrawals/request'],
  ['post', '/api/withdrawals/request-user'],
  ['get', '/api/payouts/my'],
  ['get', '/api/payouts/my/summary'],
  ['post', '/api/onboarding/receiver'],
  ['get', '/api/admin/app-cashbox'],
  ['post', '/api/admin/app-cashbox/withdrawal'],
];

describe('t1.2 — custódia desligada no modo direto', () => {
  it.each(ROUTES)('modo direto: %s %s → FEATURE_DISABLED', async (m, path) => {
    await updatePlatformConfig({ settlementMode: 'direto' }, 'test');
    const u = await createTestUser(path.includes('admin') ? 'ceo' : 'motoboy', DOMAIN);
    const res = await (request(app) as any)[m](path.replace('USER', u.userId)).set('Authorization', bearer(u)).send({});
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FEATURE_DISABLED');
  });

  it.each(ROUTES)('modo custódia: %s %s não devolve FEATURE_DISABLED', async (m, path) => {
    await updatePlatformConfig({ settlementMode: 'custodia' }, 'test');
    const u = await createTestUser(path.includes('admin') ? 'ceo' : 'motoboy', DOMAIN);
    const res = await (request(app) as any)[m](path.replace('USER', u.userId)).set('Authorization', bearer(u)).send({});
    expect(res.body?.code).not.toBe('FEATURE_DISABLED');
  });

  it('chave Pix continua aberta no modo direto', async () => {
    await updatePlatformConfig({ settlementMode: 'direto' }, 'test');
    const u = await createTestUser('motoboy', DOMAIN);
    const res = await request(app).post('/api/onboarding/pix-key').set('Authorization', bearer(u)).send({ pixKey: '12345678909' });
    expect(res.body?.code).not.toBe('FEATURE_DISABLED');
    expect(res.status).toBe(200);
  });
});
