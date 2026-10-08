import request from 'supertest';
import app from '../app';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { isDirectMode } from '../utils/settlement';

const DOMAIN = '@saas11.test';
let restore: () => Promise<void>;
beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); });
afterEach(() => cleanupUsersByEmailDomain(DOMAIN));

describe('t1.1 — configuração do modo SaaS', () => {
  it('CEO troca o settlementMode pelos freios; leitura pública reflete', async () => {
    await updatePlatformConfig({ settlementMode: 'custodia', billingModel: 'mensalidade', directCardEnabled: false }, 'test');
    const ceo = await createTestUser('ceo', DOMAIN);
    const put = await request(app).put('/api/admin/switches').set('Authorization', bearer(ceo)).send({ settlementMode: 'direto', confirmSettlement: 'TROCAR PARA SAAS' });
    expect(put.status).toBe(200);
    expect(await isDirectMode()).toBe(true);
    const pub = await request(app).get('/api/settings/saas');
    expect(pub.body).toEqual({ settlementMode: 'direto', billingModel: 'mensalidade', directCardEnabled: false, egressIp: null });
  });

  it('valor inválido de settlementMode → 400 e nada muda', async () => {
    await updatePlatformConfig({ settlementMode: 'custodia' }, 'test');
    const ceo = await createTestUser('ceo', DOMAIN);
    const put = await request(app).put('/api/admin/switches').set('Authorization', bearer(ceo)).send({ settlementMode: 'xpto' });
    expect(put.status).toBe(400);
    expect(await isDirectMode()).toBe(false);
  });

  it('campo inválido junto de campo válido → 400 e nada gravado', async () => {
    await updatePlatformConfig({ directCardEnabled: false, transferBlockHours: 24 }, 'test');
    const ceo = await createTestUser('ceo', DOMAIN);
    const put = await request(app).put('/api/admin/switches').set('Authorization', bearer(ceo)).send({ directCardEnabled: true, transferBlockHours: 0 });
    expect(put.status).toBe(400);
    const { getSaasConfig } = await import('../utils/settlement');
    const c = await getSaasConfig();
    expect(c.directCardEnabled).toBe(false);
    expect(c.transferBlockHours).toBe(24);
  });

  it('aceita billingModel, motoboyShareDirect, directCardEnabled e transferBlockHours válidos', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const put = await request(app).put('/api/admin/switches').set('Authorization', bearer(ceo))
      .send({ billingModel: 'ambos', motoboyShareDirect: 80, directCardEnabled: true, transferBlockHours: 48 });
    expect(put.status).toBe(200);
    const { getSaasConfig } = await import('../utils/settlement');
    expect(await getSaasConfig()).toMatchObject({ billingModel: 'ambos', motoboyShareDirect: 80, directCardEnabled: true, transferBlockHours: 48 });
  });
});
