import request from 'supertest';
import app from '../app';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@d1minadmin.test';
let restore: () => Promise<void>;
beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); });
afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });

const put = (u: any, body: any) => request(app).put('/api/settings/platform-config').set('Authorization', bearer(u)).send(body);

describe('PUT /settings/platform-config — saque mínimo', () => {
  it('CEO grava os dois mínimos e o GET devolve números', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const res = await put(ceo, { storeMinimumWithdraw: 15, motoboyMinimumWithdraw: 12 });
    expect(res.status).toBe(200);
    expect(res.body.config.storeMinimumWithdraw).toBe(15);
    expect(res.body.config.motoboyMinimumWithdraw).toBe(12);
    const get = await request(app).get('/api/settings/platform-config');
    expect(get.body.storeMinimumWithdraw).toBe(15);
    expect(get.body.motoboyMinimumWithdraw).toBe(12);
  });

  it('texto numérico vira número', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const res = await put(ceo, { storeMinimumWithdraw: '20.5' });
    expect(res.status).toBe(200);
    expect(res.body.config.storeMinimumWithdraw).toBe(20.5);
  });

  it.each([-1, 'abc', null, 100001])('valor inválido (%p): 400 INVALID_MINIMUM_WITHDRAW e nada muda', async (v) => {
    const ceo = await createTestUser('ceo', DOMAIN);
    await put(ceo, { storeMinimumWithdraw: 10, motoboyMinimumWithdraw: 10 });
    const res = await put(ceo, { storeMinimumWithdraw: v });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_MINIMUM_WITHDRAW');
    expect(res.body.field).toBe('storeMinimumWithdraw');
    const get = await request(app).get('/api/settings/platform-config');
    expect(get.body.storeMinimumWithdraw).toBe(10);
  });

  it('lojista não edita: 403', async () => {
    const lojista = await createTestUser('lojista', DOMAIN);
    const res = await put(lojista, { storeMinimumWithdraw: 1 });
    expect(res.status).toBe(403);
  });
});
