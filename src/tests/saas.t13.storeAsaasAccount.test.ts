jest.mock('../services/asaas/client', () => {
  const actual = jest.requireActual('../services/asaas/client');
  return {
    __esModule: true,
    ...actual,
    default: { ...actual.default, getAs: jest.fn(), postAs: jest.fn(), putAs: jest.fn(), deleteAs: jest.fn() },
  };
});
import asaasClient, { AsaasApiError } from '../services/asaas/client';
import { connectStoreAsaas, getStoreApiKey, getStoreAsaasStatus, StoreAsaasNotReadyError } from '../services/asaasLoja/account';
import env from '../config/env';
import logger from '../config/logger';
import { prisma } from '../lib/prisma';
import { storeIdForProduct } from './helpers/storeOwner';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';

const DOMAIN = '@saas13.test';
let storeId: string;

const ORIGINAL_ASAAS_URL = env.ASAAS_API_URL;
afterAll(() => { (env as any).ASAAS_API_URL = ORIGINAL_ASAAS_URL; });

beforeEach(async () => {
  jest.clearAllMocks();
  (env as any).ASAAS_API_URL = 'https://sandbox.asaas.com/api/v3';
  storeId = await storeIdForProduct(DOMAIN);
});
afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

describe('t1.3 — conta Asaas da loja', () => {
  it('chave válida: grava cifrada, guarda só os 4 últimos, status valid', async () => {
    (asaasClient.getAs as jest.Mock).mockResolvedValueOnce({ balance: 0 });
    const st = await connectStoreAsaas(storeId, '$aact_hmlg_abcdef123456', 'actor-t13');
    expect(st.status).toBe('valid');
    expect(st.environment).toBe('sandbox');
    expect(st.walletId).toBeNull();
    expect(asaasClient.getAs).toHaveBeenCalledTimes(1);
    const row = await prisma.storeAsaasAccount.findUnique({ where: { storeId } });
    expect(row!.apiKeyEncrypted).not.toContain('abcdef123456');
    expect(row!.apiKeyLast4).toBe('3456');
    expect(await getStoreApiKey(storeId)).toBe('$aact_hmlg_abcdef123456');
    expect((await getStoreAsaasStatus(storeId)).status).toBe('valid');
  });

  it('linha com status invalid: getStoreApiKey lança StoreAsaasNotReadyError', async () => {
    (asaasClient.getAs as jest.Mock).mockResolvedValueOnce({ balance: 0 });
    await connectStoreAsaas(storeId, '$aact_hmlg_abcdef123456', 'actor-t13');
    await prisma.storeAsaasAccount.update({ where: { storeId }, data: { status: 'invalid' } });
    await expect(getStoreApiKey(storeId)).rejects.toBeInstanceOf(StoreAsaasNotReadyError);
    expect((await getStoreAsaasStatus(storeId)).status).toBe('invalid');
  });

  it('indisponível: loga warn com storeId/errName/status, sem a chave', async () => {
    const spy = jest.spyOn(logger as any, 'warn');
    (asaasClient.getAs as jest.Mock).mockRejectedValueOnce(new AsaasApiError(500, []));
    await expect(connectStoreAsaas(storeId, '$aact_hmlg_SEGREDO5555', 'actor-t13')).rejects.toMatchObject({ code: 'ASAAS_UNAVAILABLE' });
    const calls = spy.mock.calls;
    expect(JSON.stringify(calls)).not.toContain('SEGREDO5555');
    expect(JSON.stringify(calls)).toContain(storeId);
    spy.mockRestore();
  });

  it('sem conta: status none e getStoreApiKey lança StoreAsaasNotReadyError', async () => {
    expect((await getStoreAsaasStatus(storeId)).status).toBe('none');
    await expect(getStoreApiKey(storeId)).rejects.toBeInstanceOf(StoreAsaasNotReadyError);
  });

  it('chave recusada (401): nada gravado, erro ASAAS_KEY_INVALID', async () => {
    (asaasClient.getAs as jest.Mock).mockRejectedValueOnce(new AsaasApiError(401, [{ code: 'invalid', description: 'x' }]));
    await expect(connectStoreAsaas(storeId, '$aact_hmlg_ruim', 'actor-t13')).rejects.toMatchObject({ code: 'ASAAS_KEY_INVALID', statusCode: 400 });
    expect(await prisma.storeAsaasAccount.findUnique({ where: { storeId } })).toBeNull();
  });

  it('Asaas fora do ar / 5xx / timeout: ASAAS_UNAVAILABLE (503), nada gravado', async () => {
    (asaasClient.getAs as jest.Mock).mockRejectedValueOnce(new AsaasApiError(500, []));
    await expect(connectStoreAsaas(storeId, '$aact_hmlg_x1', 'actor-t13')).rejects.toMatchObject({ code: 'ASAAS_UNAVAILABLE', statusCode: 503 });
    (asaasClient.getAs as jest.Mock).mockRejectedValueOnce(new Error('Timeout (20000ms)'));
    await expect(connectStoreAsaas(storeId, '$aact_hmlg_x1', 'actor-t13')).rejects.toMatchObject({ code: 'ASAAS_UNAVAILABLE', statusCode: 503 });
    expect(await prisma.storeAsaasAccount.findUnique({ where: { storeId } })).toBeNull();
  });

  it('chave de sandbox com servidor em produção → ASAAS_ENV_MISMATCH', async () => {
    (env as any).ASAAS_API_URL = 'https://api.asaas.com/v3';
    await expect(connectStoreAsaas(storeId, '$aact_hmlg_x', 'actor-t13')).rejects.toMatchObject({ code: 'ASAAS_ENV_MISMATCH' });
    expect(asaasClient.getAs).not.toHaveBeenCalled();
  });

  it('chave de produção com servidor em sandbox (default) → ASAAS_ENV_MISMATCH', async () => {
    await expect(connectStoreAsaas(storeId, '$aact_prod_x', 'actor-t13')).rejects.toMatchObject({ code: 'ASAAS_ENV_MISMATCH' });
  });

  it('chave que não começa com $aact_ → ASAAS_KEY_FORMAT', async () => {
    await expect(connectStoreAsaas(storeId, 'abc', 'actor-t13')).rejects.toMatchObject({ code: 'ASAAS_KEY_FORMAT' });
  });

  it('a chave nunca aparece em log nem na mensagem de erro', async () => {
    const key = '$aact_hmlg_SEGREDO987654';
    const spies = (['warn', 'error', 'info', 'debug'] as const).map((l) => jest.spyOn(logger as any, l));
    (asaasClient.getAs as jest.Mock).mockRejectedValueOnce(new AsaasApiError(401, [{ code: 'invalid', description: 'x' }]));
    let err: any;
    try { await connectStoreAsaas(storeId, key, 'actor-t13'); } catch (e) { err = e; }
    expect(err.message).not.toContain('SEGREDO987654');
    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(logged).not.toContain('SEGREDO987654');
    spies.forEach((s) => s.mockRestore());
  });
});
