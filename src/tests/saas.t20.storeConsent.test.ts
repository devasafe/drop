jest.mock('../services/asaas/client', () => {
  const actual = jest.requireActual('../services/asaas/client');
  return {
    __esModule: true,
    ...actual,
    default: { ...actual.default, get: jest.fn(), post: jest.fn(), getAs: jest.fn(), postAs: jest.fn(), putAs: jest.fn(), deleteAs: jest.fn() },
  };
});
jest.mock('../services/routeService', () => {
  const actual = jest.requireActual('../services/routeService');
  return { __esModule: true, ...actual, getRoute: jest.fn() };
});
import request from 'supertest';
import app from '../app';
import asaasClient, { AsaasApiError } from '../services/asaas/client';
import { getRoute } from '../services/routeService';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import { STORE_ASAAS_TERMS_VERSION, STORE_ASAAS_TERMS_TEXT } from '../legal/storeAsaasTerms';
import { isStorePaymentsReady } from '../services/asaasLoja/charge';
import { getStoreConsent } from '../services/asaasLoja/account';

const DOMAIN = '@saas20.test';
const KEY = '$aact_hmlg_abcdef123456';
const getAs = asaasClient.getAs as jest.Mock;
const postAs = asaasClient.postAs as jest.Mock;
let owner: any, other: any, ceo: any, cliente: any, storeId: string;
let restore: () => Promise<void>;
const ORIGINAL_GATEWAY = env.PAYMENT_GATEWAY;
const ORIGINAL_ASAAS_URL = env.ASAAS_API_URL;

beforeAll(async () => {
  restore = await snapshotPlatformConfig();
  (env as any).PAYMENT_GATEWAY = 'none';
  (env as any).ASAAS_API_URL = 'https://sandbox.asaas.com/api/v3';
});
afterAll(async () => {
  await restore();
  (env as any).PAYMENT_GATEWAY = ORIGINAL_GATEWAY;
  (env as any).ASAAS_API_URL = ORIGINAL_ASAAS_URL;
});

beforeEach(async () => {
  jest.clearAllMocks();
  getAs.mockReset();
  postAs.mockReset();
  getAs.mockResolvedValue({ balance: 0 });
  (getRoute as jest.Mock).mockResolvedValue({ distanceKm: 3, durationSeconds: 600, polyline: 'abc', source: 'google' });
  owner = await createTestUser('lojista', DOMAIN);
  other = await createTestUser('lojista', DOMAIN);
  ceo = await createTestUser('ceo', DOMAIN);
  cliente = await createTestUser('cliente', DOMAIN);
  storeId = (await prisma.store.create({
    data: { ownerId: owner.userId, name: 'Loja t20', isOpen: true, latitude: '-22.90', longitude: '-43.20', deliveryMode: 'pool_drop' } as any,
  })).id;
});
afterEach(async () => {
  await prisma.storeAsaasAudit.deleteMany({ where: { storeId } });
  await prisma.storeAsaasCustomer.deleteMany({ where: { storeId } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

const base = () => `/api/stores/${storeId}/asaas`;
const adminBase = () => `/api/admin/stores/${storeId}/asaas`;
const consents = () => prisma.storeAsaasConsent.findMany({ where: { storeId } });
const seedLegacyAccount = () => prisma.storeAsaasAccount.create({
  data: { storeId, apiKeyEncrypted: encryptSensitiveData(KEY), apiKeyLast4: '3456', environment: 'sandbox', status: 'valid' },
});

describe('t2.0 — termo de autorização da conta Asaas da loja', () => {
  it('PUT sem acceptTerms → 400 TERMS_NOT_ACCEPTED; nada gravado e Asaas não chamado', async () => {
    for (const body of [{ apiKey: KEY }, { apiKey: KEY, acceptTerms: false }]) {
      const r = await request(app).put(base()).set('Authorization', bearer(owner)).send(body);
      expect(r.status).toBe(400);
      expect(r.body.code ?? r.body.error?.code).toBe('TERMS_NOT_ACCEPTED');
    }
    expect(await prisma.storeAsaasAccount.count({ where: { storeId } })).toBe(0);
    expect(await consents()).toHaveLength(0);
    expect(getAs).not.toHaveBeenCalled();
  });

  it('PUT com acceptTerms → conta conectada e 1 aceite do lojista, versão vigente, com IP', async () => {
    const r = await request(app).put(base()).set('Authorization', bearer(owner)).set('User-Agent', 'jest-ua').send({ apiKey: KEY, acceptTerms: true });
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('valid');
    const rows = await consents();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorRole: 'lojista', termsVersion: STORE_ASAAS_TERMS_VERSION, actorId: owner.userId, userAgent: 'jest-ua' });
    expect(rows[0].ip).toBeTruthy();
    expect(await isStorePaymentsReady(storeId)).toBe(true);
  });

  it('chave recusada não grava aceite', async () => {
    getAs.mockRejectedValueOnce(new AsaasApiError(401, []));
    const r = await request(app).put(base()).set('Authorization', bearer(owner)).send({ apiKey: KEY, acceptTerms: true });
    expect(r.status).toBe(400);
    expect(await consents()).toHaveLength(0);
  });

  it('admin (CEO) com acceptTerms → aceite com actorRole admin; sem acceptTerms → 400', async () => {
    const bad = await request(app).put(adminBase()).set('Authorization', bearer(ceo)).send({ apiKey: KEY });
    expect(bad.status).toBe(400);
    expect(await consents()).toHaveLength(0);
    const r = await request(app).put(adminBase()).set('Authorization', bearer(ceo)).send({ apiKey: KEY, acceptTerms: true });
    expect(r.status).toBe(200);
    const rows = await consents();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorRole: 'admin', actorId: ceo.userId, termsVersion: STORE_ASAAS_TERMS_VERSION });
  });

  it('conta valid sem aceite (legada): não está pronta e o pedido direto é recusado; após o aceite, volta a vender', async () => {
    await seedLegacyAccount();
    await updatePlatformConfig({ settlementMode: 'direto', directCardEnabled: false } as any, 'test');
    expect(await isStorePaymentsReady(storeId)).toBe(false);
    const product = await prisma.product.create({ data: { storeId, name: 'Item', price: 20, quantity: 10 } } as any);
    await prisma.user.update({ where: { id: cliente.userId }, data: { cpf: '52998224725' } });
    const body = {
      storeId, products: [{ productId: product.id, quantity: 1 }], paymentMethod: 'pix',
      deliveryDistanceKm: 0, address: 'Rua X, 1 - Centro', latitude: -22.95, longitude: -43.25,
    };
    const blocked = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(body);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('STORE_PAYMENTS_NOT_READY');
    expect(postAs).not.toHaveBeenCalled();

    const c = await request(app).post(`${base()}/consent`).set('Authorization', bearer(owner)).send({ acceptTerms: true });
    expect(c.status).toBe(200);
    expect(c.body.data.consent).toMatchObject({ version: STORE_ASAAS_TERMS_VERSION });
    expect(await isStorePaymentsReady(storeId)).toBe(true);
  });

  it('POST consent: sem acceptTerms → 400; sem conta → 409; não-dono → 403; admin grava como admin', async () => {
    const noAccount = await request(app).post(`${base()}/consent`).set('Authorization', bearer(owner)).send({ acceptTerms: true });
    expect(noAccount.status).toBe(409);
    await seedLegacyAccount();
    expect((await request(app).post(`${base()}/consent`).set('Authorization', bearer(owner)).send({})).status).toBe(400);
    for (const u of [other, cliente]) {
      expect((await request(app).post(`${base()}/consent`).set('Authorization', bearer(u)).send({ acceptTerms: true })).status).toBe(403);
    }
    expect(await consents()).toHaveLength(0);
    const adm = await request(app).post(`${adminBase()}/consent`).set('Authorization', bearer(ceo)).send({ acceptTerms: true });
    expect(adm.status).toBe(200);
    expect((await consents())[0]).toMatchObject({ actorRole: 'admin' });
  });

  it('qualquer versão aceita libera a venda (getStoreConsent devolve a mais recente)', async () => {
    await seedLegacyAccount();
    await prisma.storeAsaasConsent.create({ data: { storeId, actorId: 'x', actorRole: 'lojista', termsVersion: '2020-01-01', acceptedAt: new Date('2020-01-01') } });
    expect(await isStorePaymentsReady(storeId)).toBe(true);
    await prisma.storeAsaasConsent.create({ data: { storeId, actorId: 'x', actorRole: 'admin', termsVersion: '2021-01-01', acceptedAt: new Date('2021-01-01') } });
    expect(await getStoreConsent(storeId)).toMatchObject({ version: '2021-01-01', actorRole: 'admin' });
  });

  it('GET devolve consent e termsVersion; nunca a chave', async () => {
    const none = await request(app).get(base()).set('Authorization', bearer(owner));
    expect(none.body.data.consent).toBeNull();
    expect(none.body.data.termsVersion).toBe(STORE_ASAAS_TERMS_VERSION);
    await request(app).put(base()).set('Authorization', bearer(owner)).send({ apiKey: KEY, acceptTerms: true });
    const r = await request(app).get(base()).set('Authorization', bearer(owner));
    expect(r.body.data.consent).toEqual({ version: STORE_ASAAS_TERMS_VERSION, acceptedAt: expect.any(String) });
    expect(r.body.data.termsVersion).toBe(STORE_ASAAS_TERMS_VERSION);
    expect(JSON.stringify(r.body)).not.toMatch(/aact_|apiKeyEncrypted|abcdef123456/);
  });

  it('GET /api/settings/store-asaas-terms é público', async () => {
    const r = await request(app).get('/api/settings/store-asaas-terms');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ version: STORE_ASAAS_TERMS_VERSION, text: STORE_ASAAS_TERMS_TEXT });
  });
});
