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
import logger from '../config/logger';
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

  /** Loja com CNPJ e endereço e dono com e-mail: passa da checagem de dados e chama o Asaas. */
  const readyForAsaas = (asaas?: object) =>
    prisma.store.update({
      where: { id: storeId },
      data: {
        cnpj: '12.345.678/0001-99', street: 'Rua p32', number: '10', neighborhood: 'Centro', zip: '01001-000',
        ...(asaas ? { asaas } : {}),
      },
    });

  it('o Asaas recusa a criação da subconta: grava o erro e marca na hora', async () => {
    await updatePlatformConfig({ settlementMode: 'custodia' }, 'd3b4b-p32');
    (env as any).PAYMENT_GATEWAY = 'asaas';
    await readyForAsaas();
    expect(await computeStoreAttention(storeId)).toBe(false); // sem subconta ainda: "pendente"
    const post = jest.spyOn(asaasClient, 'post').mockRejectedValueOnce(new Error('Erro interno no Asaas'));
    try {
      await ensureStoreSubaccount(storeId);
    } finally {
      post.mockRestore();
    }
    const after = await row();
    expect(after.asaas).toEqual(expect.objectContaining({ status: 'error', lastError: 'Erro interno no Asaas' }));
    expect(after.needsAttention).toBe(true);
  });

  it('a subconta é criada: sai do erro e a atenção é tirada na hora', async () => {
    await updatePlatformConfig({ settlementMode: 'custodia' }, 'd3b4b-p32');
    (env as any).PAYMENT_GATEWAY = 'asaas';
    await readyForAsaas({ status: 'error', lastError: 'falha anterior' });
    expect(await computeStoreAttention(storeId)).toBe(true);
    const post = jest.spyOn(asaasClient, 'post').mockResolvedValueOnce({ id: 'acc-p32', walletId: 'wal-p32', apiKey: '$aact_p32' });
    try {
      await ensureStoreSubaccount(storeId);
    } finally {
      post.mockRestore();
    }
    const after = await row();
    expect(after.asaas).toEqual(expect.objectContaining({ status: 'active', accountId: 'acc-p32' }));
    expect(after.needsAttention).toBe(false);
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

describe('falha no recálculo da atenção', () => {
  it('não derruba a operação: a conta é conectada, o erro vai para o log e o valor antigo fica', async () => {
    await account('invalid');
    expect(await computeStoreAttention(storeId)).toBe(true);
    (asaasClient.getAs as jest.Mock).mockResolvedValueOnce({ balance: 0 });
    // A contagem de pedidos de 30 dias é a última leitura do recálculo: falhar nela faz computeStoreAttention rejeitar.
    const groupBy = jest.spyOn(prisma.order, 'groupBy').mockRejectedValueOnce(new Error('banco fora do ar (simulado)'));
    const logError = jest.spyOn(logger, 'error').mockImplementation((() => logger) as any);
    try {
      await expect(connectStoreAsaas(storeId, '$aact_hmlg_p32nova0003', 'actor-p32', TEST_CONSENT)).resolves.toBeDefined();
      expect(groupBy).toHaveBeenCalled();
      expect(logError).toHaveBeenCalledWith('[store-attention] falha ao recalcular a atenção da loja', expect.any(Error), { storeId });
    } finally {
      groupBy.mockRestore();
      logError.mockRestore();
    }
    const saved = await prisma.storeAsaasAccount.findUniqueOrThrow({ where: { storeId }, select: { status: true, apiKeyLast4: true } });
    expect(saved).toEqual({ status: 'valid', apiKeyLast4: '0003' });
    expect((await row()).needsAttention).toBe(true); // o job corrige na próxima rodada
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
