/**
 * Lote pré-deploy 2 — item B (Ruling R25): o aceite do termo envia a `termsVersion` que a tela
 * exibiu. Versão diferente da vigente → 409 TERMS_VERSION_OUTDATED sem gravar nada (a tela
 * recarrega o texto). Ausente vale como a vigente (os testes da Task 2.0 enviam sem o campo).
 */
jest.mock('../services/asaas/client', () => {
  const actual = jest.requireActual('../services/asaas/client');
  return {
    __esModule: true,
    ...actual,
    default: { ...actual.default, get: jest.fn(), post: jest.fn(), getAs: jest.fn(), postAs: jest.fn(), putAs: jest.fn(), deleteAs: jest.fn() },
  };
});
import request from 'supertest';
import app from '../app';
import asaasClient from '../services/asaas/client';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { STORE_ASAAS_TERMS_VERSION } from '../legal/storeAsaasTerms';

const DOMAIN = '@saas51.test';
const KEY = '$aact_hmlg_abcdef123456';
const OLD = '2020-01-01';
const getAs = asaasClient.getAs as jest.Mock;
let owner: TestUser, ceo: TestUser, storeId: string;
const ORIGINAL_ASAAS_URL = env.ASAAS_API_URL;

beforeAll(() => { (env as any).ASAAS_API_URL = 'https://sandbox.asaas.com/api/v3'; });
afterAll(() => { (env as any).ASAAS_API_URL = ORIGINAL_ASAAS_URL; });

beforeEach(async () => {
  jest.clearAllMocks();
  getAs.mockReset();
  getAs.mockResolvedValue({ balance: 0 });
  owner = await createTestUser('lojista', DOMAIN);
  ceo = await createTestUser('ceo', DOMAIN);
  storeId = (await prisma.store.create({ data: { ownerId: owner.userId, name: 'Loja t51' } })).id;
});
afterEach(async () => {
  await prisma.storeAsaasAudit.deleteMany({ where: { storeId } });
  await prisma.storeAsaasCustomer.deleteMany({ where: { storeId } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

const base = () => `/api/stores/${storeId}/asaas`;
const adminBase = () => `/api/admin/stores/${storeId}/asaas`;
const consents = () => prisma.storeAsaasConsent.findMany({ where: { storeId } });
const seedAccount = () => prisma.storeAsaasAccount.create({
  data: { storeId, apiKeyEncrypted: encryptSensitiveData(KEY), apiKeyLast4: '3456', environment: 'sandbox', status: 'valid' },
});

describe('B — versão do termo exibida', () => {
  it('PUT conectar com versão antiga → 409 TERMS_VERSION_OUTDATED; nada gravado e o Asaas não é chamado', async () => {
    const r = await request(app).put(base()).set('Authorization', bearer(owner))
      .send({ apiKey: KEY, acceptTerms: true, termsVersion: OLD });
    expect(r.status).toBe(409);
    expect(r.body.error?.code).toBe('TERMS_VERSION_OUTDATED');
    expect(await consents()).toHaveLength(0);
    expect(await prisma.storeAsaasAccount.findUnique({ where: { storeId } })).toBeNull();
    expect(getAs).not.toHaveBeenCalled();
  });

  it('PUT conectar com a versão vigente → 200 e grava essa versão', async () => {
    const r = await request(app).put(base()).set('Authorization', bearer(owner))
      .send({ apiKey: KEY, acceptTerms: true, termsVersion: STORE_ASAAS_TERMS_VERSION });
    expect(r.status).toBe(200);
    const rows = await consents();
    expect(rows).toHaveLength(1);
    expect(rows[0].termsVersion).toBe(STORE_ASAAS_TERMS_VERSION);
  });

  it('POST consent (lojista e admin) com versão antiga → 409 sem gravar; vigente → 200 e grava', async () => {
    await seedAccount();
    for (const [who, url] of [[owner, `${base()}/consent`], [ceo, `${adminBase()}/consent`]] as const) {
      const r = await request(app).post(url).set('Authorization', bearer(who)).send({ acceptTerms: true, termsVersion: OLD });
      expect(r.status).toBe(409);
      expect(r.body.error?.code).toBe('TERMS_VERSION_OUTDATED');
    }
    expect(await consents()).toHaveLength(0);

    const ok = await request(app).post(`${base()}/consent`).set('Authorization', bearer(owner))
      .send({ acceptTerms: true, termsVersion: STORE_ASAAS_TERMS_VERSION });
    expect(ok.status).toBe(200);
    const rows = await consents();
    expect(rows).toHaveLength(1);
    expect(rows[0].termsVersion).toBe(STORE_ASAAS_TERMS_VERSION);
  });

  it('termsVersion inválido (vazio ou não-texto) → 400 pela validação', async () => {
    await seedAccount();
    for (const termsVersion of ['', 123]) {
      const r = await request(app).post(`${base()}/consent`).set('Authorization', bearer(owner)).send({ acceptTerms: true, termsVersion });
      expect(r.status).toBe(400);
    }
    expect(await consents()).toHaveLength(0);
  });
});
