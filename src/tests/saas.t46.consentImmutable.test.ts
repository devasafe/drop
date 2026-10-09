/**
 * Pré-deploy item 1c — a prova do aceite do termo (StoreAsaasConsent) não some nem muda:
 * sem cascade com a loja e trigger no Postgres que só deixa INSERT.
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
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { grantStoreConsent } from './helpers/storeConsent';
import asaasClient from '../services/asaas/client';
import env from '../config/env';
import { encryptSensitiveData } from '../utils/encryption';
import { recordStoreConsent } from '../services/asaasLoja/account';
import { STORE_ASAAS_TERMS_VERSION } from '../legal/storeAsaasTerms';

const DOMAIN = '@saas46.test';
let owner: TestUser;
let storeId: string;

const ORIGINAL_ASAAS_URL = env.ASAAS_API_URL;
beforeAll(() => { (env as any).ASAAS_API_URL = 'https://sandbox.asaas.com/api/v3'; });
afterAll(() => { (env as any).ASAAS_API_URL = ORIGINAL_ASAAS_URL; });

beforeEach(async () => {
  (asaasClient.getAs as jest.Mock).mockResolvedValue({ balance: 0 });
  owner = await createTestUser('lojista', DOMAIN);
  storeId = (await prisma.store.create({
    data: { ownerId: owner.userId, name: 'Loja t46', isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any,
  })).id;
});
afterEach(async () => {
  await prisma.storeAsaasAudit.deleteMany({ where: { storeId } });
  await prisma.storeAsaasCustomer.deleteMany({ where: { storeId } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

const consents = () => prisma.storeAsaasConsent.findMany({ where: { storeId } });

describe('item 1c — StoreAsaasConsent é imutável', () => {
  it('UPDATE direto no banco é recusado e a linha fica como estava', async () => {
    await grantStoreConsent(storeId);
    const [row] = await consents();
    await expect(prisma.$executeRaw`UPDATE "StoreAsaasConsent" SET "termsVersion" = 'adulterada' WHERE id = ${row.id}`).rejects.toThrow();
    await expect(prisma.storeAsaasConsent.update({ where: { id: row.id }, data: { actorId: 'outro' } })).rejects.toThrow();
    expect(await consents()).toEqual([row]);
  });

  it('DELETE direto no banco é recusado (inclusive deleteMany)', async () => {
    await grantStoreConsent(storeId);
    const [row] = await consents();
    await expect(prisma.$executeRaw`DELETE FROM "StoreAsaasConsent" WHERE id = ${row.id}`).rejects.toThrow();
    await expect(prisma.storeAsaasConsent.deleteMany({ where: { storeId } })).rejects.toThrow();
    expect(await consents()).toEqual([row]);
  });

  it('apagar a loja não apaga a prova em cascata (FK recusa)', async () => {
    await grantStoreConsent(storeId);
    await expect(prisma.store.delete({ where: { id: storeId } })).rejects.toThrow();
    expect(await consents()).toHaveLength(1);
    expect(await prisma.store.count({ where: { id: storeId } })).toBe(1);
  });

  it('DELETE /api/stores/:id com termo aceito → 409 STORE_HAS_CONSENT, nada apagado (nem produtos)', async () => {
    await grantStoreConsent(storeId);
    await prisma.product.create({ data: { storeId, name: 'Item', price: 10, quantity: 1 } } as any);
    const r = await request(app).delete(`/api/stores/${storeId}`).set('Authorization', bearer(owner));
    expect(r.status).toBe(409);
    expect(r.body.code ?? r.body.error?.code).toBe('STORE_HAS_CONSENT');
    expect(await consents()).toHaveLength(1);
    expect(await prisma.store.count({ where: { id: storeId } })).toBe(1);
    expect(await prisma.product.count({ where: { storeId } })).toBe(1);
    expect(await prisma.user.count({ where: { id: owner.userId } })).toBe(1);
  });

  it('DELETE /api/stores/:id sem termo aceito continua apagando loja e usuário', async () => {
    const r = await request(app).delete(`/api/stores/${storeId}`).set('Authorization', bearer(owner));
    expect(r.status).toBe(200);
    expect(await prisma.store.count({ where: { id: storeId } })).toBe(0);
  });
});

describe('item 1d — mesmo storeId + termsVersion não gera segunda linha', () => {
  const KEY = '$aact_hmlg_abcdef123456';
  const seedAccount = () => prisma.storeAsaasAccount.create({
    data: { storeId, apiKeyEncrypted: encryptSensitiveData(KEY), apiKeyLast4: '3456', environment: 'sandbox', status: 'valid' },
  });

  it('POST /consent duas vezes → 200 nas duas e uma linha só', async () => {
    await seedAccount();
    for (let i = 0; i < 2; i++) {
      const r = await request(app).post(`/api/stores/${storeId}/asaas/consent`).set('Authorization', bearer(owner)).send({ acceptTerms: true });
      expect(r.status).toBe(200);
      expect(r.body.data.consent).toMatchObject({ version: STORE_ASAAS_TERMS_VERSION });
    }
    expect(await consents()).toHaveLength(1);
  });

  it('aceites simultâneos da mesma versão → uma linha só', async () => {
    const ctx = { storeId, actorId: owner.userId, actorRole: 'lojista' as const, ip: null, userAgent: null };
    await Promise.all([recordStoreConsent(ctx), recordStoreConsent(ctx), recordStoreConsent(ctx)]);
    expect(await consents()).toHaveLength(1);
  });

  it('PUT (conectar) duas vezes com a mesma versão → 200 e uma linha só', async () => {
    for (let i = 0; i < 2; i++) {
      const r = await request(app).put(`/api/stores/${storeId}/asaas`).set('Authorization', bearer(owner)).send({ apiKey: KEY, acceptTerms: true });
      expect(r.status).toBe(200);
    }
    expect(await consents()).toHaveLength(1);
  });

  it('o banco recusa a duplicata (unique storeId + termsVersion); versão diferente entra', async () => {
    await grantStoreConsent(storeId);
    await expect(prisma.storeAsaasConsent.create({
      data: { storeId, actorId: 'x', actorRole: 'lojista', termsVersion: STORE_ASAAS_TERMS_VERSION },
    })).rejects.toThrow();
    await prisma.storeAsaasConsent.create({ data: { storeId, actorId: 'x', actorRole: 'lojista', termsVersion: '2020-01-01' } });
    expect(await consents()).toHaveLength(2);
  });
});
