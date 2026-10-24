/**
 * D3b-4b · P3.2 — a mudança do recebimento recalcula a atenção na hora (spec 8 e 12): conectar, desconectar
 * e testar a conta Asaas da loja, a chave recusada (401) ao cobrar e a subconta da custódia com erro.
 * A troca do modo de liquidação marca todas as lojas para o job recalcular.
 */
jest.mock('../services/asaas/client', () => {
  const actual = jest.requireActual('../services/asaas/client');
  return {
    __esModule: true,
    ...actual,
    default: { ...actual.default, getAs: jest.fn(), postAs: jest.fn(), putAs: jest.fn(), deleteAs: jest.fn() },
  };
});
import request from 'supertest';
import app from '../app';
import asaasClient, { AsaasApiError } from '../services/asaas/client';
import { connectStoreAsaas, disconnectStoreAsaas, testStoreAsaas } from '../services/asaasLoja/account';
import { translate } from '../services/asaasLoja/charge';
import { ensureStoreSubaccount } from '../services/asaas/subaccount';
import { computeStoreAttention } from '../services/adminAccounts/storeAttention';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { storeIdForProduct } from './helpers/storeOwner';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { TEST_CONSENT } from './helpers/storeConsent';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@d3b4bp32.test';
const ORIGINAL = { url: env.ASAAS_API_URL, pay: env.PAYMENT_GATEWAY, out: env.PAYOUT_GATEWAY };
let storeId: string;
let restoreConfig: () => Promise<void>;

beforeAll(async () => {
  restoreConfig = await snapshotPlatformConfig();
});
afterAll(async () => {
  await restoreConfig();
  (env as any).ASAAS_API_URL = ORIGINAL.url;
});
beforeEach(async () => {
  jest.clearAllMocks();
  (env as any).ASAAS_API_URL = 'https://sandbox.asaas.com/api/v3';
  await updatePlatformConfig({ settlementMode: 'direto' }, 'd3b4b-p32');
  storeId = await storeIdForProduct(DOMAIN, 'Loja p32');
});
afterEach(async () => {
  (env as any).PAYMENT_GATEWAY = ORIGINAL.pay;
  (env as any).PAYOUT_GATEWAY = ORIGINAL.out;
  await cleanupUsersByEmailDomain(DOMAIN);
});

const row = () =>
  prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { needsAttention: true, attentionCheckedAt: true, asaas: true } });
const account = (status: 'valid' | 'invalid', key = '$aact_hmlg_p32velha0001') =>
  prisma.storeAsaasAccount.create({
    data: { storeId, apiKeyEncrypted: encryptSensitiveData(key), apiKeyLast4: key.slice(-4), environment: 'sandbox', status },
  });

describe('modo direto: a conta Asaas da loja', () => {
  it('conectar uma chave aceita tira a atenção da conta inválida', async () => {
    await account('invalid');
    expect(await computeStoreAttention(storeId)).toBe(true);
    (asaasClient.getAs as jest.Mock).mockResolvedValueOnce({ balance: 0 });
    await connectStoreAsaas(storeId, '$aact_hmlg_p32nova0002', 'actor-p32', TEST_CONSENT);
    expect((await row()).needsAttention).toBe(false);
  });

  it('testar e o Asaas recusar a chave (401) marca na hora', async () => {
    await account('valid');
    expect(await computeStoreAttention(storeId)).toBe(false);
    (asaasClient.getAs as jest.Mock).mockRejectedValueOnce(new AsaasApiError(401, [{ code: 'invalid', description: 'x' }]));
    await testStoreAsaas(storeId);
    expect((await row()).needsAttention).toBe(true);
  });

  it('chave recusada ao cobrar (401) marca na hora', async () => {
    await account('valid');
    expect(await computeStoreAttention(storeId)).toBe(false);
    await translate(storeId, new AsaasApiError(401, []));
    expect((await row()).needsAttention).toBe(true);
  });

  it('desconectar a conta inválida tira a atenção (sem conta é "pendente", não problema)', async () => {
    await account('invalid');
    expect(await computeStoreAttention(storeId)).toBe(true);
    await disconnectStoreAsaas(storeId, 'actor-p32');
    expect((await row()).needsAttention).toBe(false);
  });
});

describe('custódia: a subconta da loja', () => {
  it('subconta que falha por falta de dados marca na hora', async () => {
    await updatePlatformConfig({ settlementMode: 'custodia' }, 'd3b4b-p32');
    (env as any).PAYMENT_GATEWAY = 'asaas';
    // Dono sem CPF e loja sem CNPJ nem endereço: grava status 'error' sem chamar o Asaas.
    await ensureStoreSubaccount(storeId);
    const after = await row();
    expect(after.asaas).toEqual(expect.objectContaining({ status: 'error' }));
    expect(after.needsAttention).toBe(true);
  });

  it('subconta já pronta: nada é gravado e a atenção não é recalculada', async () => {
    await updatePlatformConfig({ settlementMode: 'custodia' }, 'd3b4b-p32');
    await prisma.store.update({
      where: { id: storeId },
      data: { asaas: { status: 'active', accountId: 'acc-p32', apiKeyEncrypted: 'cifrada-p32' } },
    });
    await ensureStoreSubaccount(storeId);
    expect((await row()).attentionCheckedAt).toBeNull();
  });
});

describe('troca do modo de liquidação', () => {
  it('marca todas as lojas como não calculadas; o recálculo seguinte usa o modo novo', async () => {
    (env as any).PAYMENT_GATEWAY = 'asaas';
    (env as any).PAYOUT_GATEWAY = 'asaas';
    await account('invalid');
    expect(await computeStoreAttention(storeId)).toBe(true); // direto: conta inválida = problema
    const ceo = await createTestUser('ceo', DOMAIN);
    const res = await request(app)
      .put('/api/admin/switches')
      .set('Authorization', bearer(ceo))
      .send({ settlementMode: 'custodia', confirmSettlement: 'TROCAR PARA APP' });
    expect(res.status).toBe(200);
    expect((await row()).attentionCheckedAt).toBeNull();
    expect(await computeStoreAttention(storeId)).toBe(false); // custódia: a conta direta não conta
  });
});
