/**
 * Sandbox 2026-10-09: o webhook de pagamentos da loja foi editado no painel do Asaas e passou a
 * apontar para `/autorizacao` — nenhum PAYMENT_* / TRANSFER_* chegava ao endereço certo.
 * "Testar configuração" agora confere a URL e, se estiver errada, regrava o webhook (PUT, token
 * novo, só o hash no banco). URL certa ou ausente na resposta → não mexe.
 */
jest.mock('../services/asaas/client', () => {
  const actual = jest.requireActual('../services/asaas/client');
  return {
    __esModule: true,
    ...actual,
    default: { ...actual.default, getAs: jest.fn(), postAs: jest.fn(), putAs: jest.fn(), deleteAs: jest.fn() },
  };
});
import { createHash } from 'crypto';
import asaasClient from '../services/asaas/client';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { ownerIdForStore } from './helpers/storeOwner';
import { testStoreAsaas } from '../services/asaasLoja/account';
import { verifyStoreWebhookToken } from '../services/asaasLoja/webhook';

const DOMAIN = '@saas57.test';
const KEY = '$aact_hmlg_LOJA_57_0001';
const OLD_HASH = createHash('sha256').update('x'.repeat(48)).digest('hex');
const getAs = asaasClient.getAs as jest.Mock;
const putAs = asaasClient.putAs as jest.Mock;

const ORIGINAL_ASAAS_URL = env.ASAAS_API_URL;
const ORIGINAL_PUBLIC = (env as any).PUBLIC_API_URL;
beforeAll(() => {
  (env as any).ASAAS_API_URL = 'https://sandbox.asaas.com/api/v3';
  (env as any).PUBLIC_API_URL = 'https://api.exemplo.test';
});
afterAll(() => {
  (env as any).ASAAS_API_URL = ORIGINAL_ASAAS_URL;
  (env as any).PUBLIC_API_URL = ORIGINAL_PUBLIC;
});
beforeEach(() => { getAs.mockReset(); putAs.mockReset(); });
afterEach(() => cleanupUsersByEmailDomain(DOMAIN));

async function store() {
  const s = await prisma.store.create({ data: { ownerId: await ownerIdForStore(DOMAIN), name: 'Loja T57', isOpen: true } });
  await prisma.storeAsaasAccount.create({
    data: {
      storeId: s.id, apiKeyEncrypted: encryptSensitiveData(KEY), apiKeyLast4: '0001', environment: 'sandbox', status: 'valid',
      paymentWebhookId: 'wh_57', paymentWebhookTokenHash: OLD_HASH,
    },
  });
  return s.id;
}

describe('t57 — Testar configuração regrava o webhook de pagamentos com URL errada', () => {
  it('URL apontando para /autorizacao → PUT com a URL certa e token novo; checklist ok', async () => {
    const storeId = await store();
    const expected = `https://api.exemplo.test/webhooks/asaas/loja/${storeId}`;
    getAs
      .mockResolvedValueOnce({ balance: 1 })
      .mockResolvedValueOnce({ id: 'wh_57', enabled: true, interrupted: false, url: `${expected}/autorizacao` });
    putAs.mockResolvedValueOnce({ id: 'wh_57', enabled: true, interrupted: false, url: expected });

    const st = await testStoreAsaas(storeId);

    expect(putAs).toHaveBeenCalledTimes(1);
    const [key, path, body] = putAs.mock.calls[0];
    expect(key).toBe(KEY);
    expect(path).toBe('/webhooks/wh_57');
    expect(body).toMatchObject({ url: expected, enabled: true, interrupted: false });
    expect(body.authToken).toHaveLength(48);
    expect(body.events).toEqual(expect.arrayContaining(['PAYMENT_RECEIVED', 'TRANSFER_DONE', 'TRANSFER_FAILED']));
    const row = await prisma.storeAsaasAccount.findUnique({ where: { storeId } });
    expect(row!.paymentWebhookTokenHash).not.toBe(OLD_HASH);
    expect(await verifyStoreWebhookToken(storeId, body.authToken, 'payment')).toBe(true);
    expect(st.checklist.paymentWebhook).toBe(true);
  });

  it('URL certa → não regrava', async () => {
    const storeId = await store();
    getAs
      .mockResolvedValueOnce({ balance: 1 })
      .mockResolvedValueOnce({ id: 'wh_57', enabled: true, interrupted: false, url: `https://api.exemplo.test/webhooks/asaas/loja/${storeId}` });

    const st = await testStoreAsaas(storeId);

    expect(putAs).not.toHaveBeenCalled();
    expect(st.checklist.paymentWebhook).toBe(true);
    expect((await prisma.storeAsaasAccount.findUnique({ where: { storeId } }))!.paymentWebhookTokenHash).toBe(OLD_HASH);
  });

  it('falha ao regravar → checklist false e o hash antigo fica', async () => {
    const storeId = await store();
    getAs
      .mockResolvedValueOnce({ balance: 1 })
      .mockResolvedValueOnce({ id: 'wh_57', enabled: true, interrupted: false, url: 'https://outro.exemplo/x' });
    putAs.mockRejectedValueOnce(new Error('falhou'));

    const st = await testStoreAsaas(storeId);

    expect(st.checklist.paymentWebhook).toBe(false);
    expect((await prisma.storeAsaasAccount.findUnique({ where: { storeId } }))!.paymentWebhookTokenHash).toBe(OLD_HASH);
  });
});
