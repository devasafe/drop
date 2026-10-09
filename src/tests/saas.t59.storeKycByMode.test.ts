/**
 * A1 — KYC da loja por modo de liquidação.
 * No modo direto a conta Asaas da própria loja já faz o KYC dela: a DROP exige só o dono
 * verificado (e-mail + documento). Facial, CNPJ e comprovante de endereço só na custódia.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import env from '../config/env';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { computeStoreVerified, missingStoreVerifications, recomputeStoreVerification } from '../utils/storeVerification';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

jest.mock('../services/asaas/subaccount', () => ({
  ensureStoreSubaccount: jest.fn().mockResolvedValue(undefined),
}));
import { ensureStoreSubaccount } from '../services/asaas/subaccount';

const DOMAIN = '@saas59.test';
let restore: () => Promise<void>;
const ORIGINAL_PAY = env.PAYMENT_GATEWAY;

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => {
  await restore();
  (env as any).PAYMENT_GATEWAY = ORIGINAL_PAY;
});
beforeEach(async () => {
  (ensureStoreSubaccount as jest.Mock).mockClear();
  (env as any).PAYMENT_GATEWAY = 'asaas';
  await updatePlatformConfig({ settlementMode: 'direto' } as any, 'test');
});
afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });

const donoOK = { verification: { email: { status: 'verified' }, document: { type: 'cpf', status: 'approved' } } };
const donoSemDoc = { verification: { email: { status: 'verified' }, document: { status: 'none' } } };
const lojaVazia = { verification: {} };

describe('unit: missing/computeStoreVerified por modo', () => {
  it('direto: dono verificado, sem facial/cnpj/endereço → verificada', () => {
    expect(computeStoreVerified(lojaVazia, donoOK, 'direto')).toBe(true);
    expect(missingStoreVerifications(lojaVazia, donoOK, 'direto')).toEqual([]);
  });
  it('direto: dono sem documento → não verificada, missing = [owner]', () => {
    expect(computeStoreVerified(lojaVazia, donoSemDoc, 'direto')).toBe(false);
    expect(missingStoreVerifications(lojaVazia, donoSemDoc, 'direto')).toEqual(['owner']);
  });
  it('custódia (padrão): mesmo cenário continua exigindo tudo', () => {
    expect(computeStoreVerified(lojaVazia, donoOK)).toBe(false);
    expect(computeStoreVerified(lojaVazia, donoOK, 'custodia')).toBe(false);
    expect(missingStoreVerifications(lojaVazia, donoOK, 'custodia')).toEqual(['facial', 'cnpj', 'address']);
  });
});

async function mkLoja(verified: boolean, ownerVerified = true) {
  const dono = await createTestUser('lojista', DOMAIN, { verified: ownerVerified });
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja 59', isOpen: true, isVerified: verified } as any });
  return { dono, store };
}

describe('integração', () => {
  it('direto: recomputeStoreVerification verifica e NÃO cria subconta (mesmo com gateway asaas)', async () => {
    const { store } = await mkLoja(false);
    expect(await recomputeStoreVerification(store.id)).toBe(true);
    expect((await prisma.store.findUnique({ where: { id: store.id } }))!.isVerified).toBe(true);
    expect(ensureStoreSubaccount).not.toHaveBeenCalled();
  });

  it('direto: approveDocument do dono que só esperava o documento verifica a loja', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const { dono, store } = await mkLoja(false, false);
    await prisma.user.update({
      where: { id: dono.userId },
      data: { verification: { email: { status: 'verified' }, document: { type: 'cpf', status: 'pending' } } },
    });
    const res = await request(app).post(`/api/verification/admin/${dono.userId}/approve`).set('Authorization', bearer(ceo));
    expect(res.status).toBe(200);
    expect((await prisma.store.findUnique({ where: { id: store.id } }))!.isVerified).toBe(true);
  });

  it('PUT /admin/switches custódia→direto recalcula as lojas', async () => {
    await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');
    const ceo = await createTestUser('ceo', DOMAIN);
    const { store } = await mkLoja(false);
    const res = await request(app).put('/api/admin/switches').set('Authorization', bearer(ceo))
      .send({ settlementMode: 'direto', confirmSettlement: 'TROCAR PARA SAAS' });
    if (res.status !== 200) throw new Error(`troca falhou: ${res.status} ${JSON.stringify(res.body)}`);
    expect((await prisma.store.findUnique({ where: { id: store.id } }))!.isVerified).toBe(true);
  });

  it('GET /verification/store/:id no direto não lista facial/cnpj/address e informa o modo', async () => {
    const { dono, store } = await mkLoja(false);
    const res = await request(app).get(`/api/verification/store/${store.id}`).set('Authorization', bearer(dono));
    expect(res.status).toBe(200);
    expect(res.body.missing).toEqual([]);
    expect(res.body.mode).toBe('direto');
  });
});
