/**
 * Task 2.2 — webhook de autorização de transferências/estornos Pix (fechado por padrão).
 */
import request from 'supertest';
import app from '../app';
import logger from '../config/logger';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { ownerIdForStore } from './helpers/storeOwner';
import { sha256Hex } from '../services/asaasLoja/webhook';
import { parseAuthorizationRequest, normalizePixKey } from '../controllers/transferAuthController';
import fixture from './fixtures/asaas-transfer-auth.json';

const DOMAIN = '@saas22.test';
const TOKEN = 'tok_auth_loja_22_abcdefabcdefabcdefabcdef';
const OTHER_TOKEN = 'tok_auth_outra_22_abcdefabcdefabcdefabcdef';
const KEY = '12345678909';

let storeId: string;
let otherStoreId: string;

beforeEach(async () => {
  jest.restoreAllMocks();
  const ownerId = await ownerIdForStore(DOMAIN);
  const mk = async (name: string, tok: string) => {
    const s = await prisma.store.create({ data: { ownerId, name, isOpen: true } as any });
    await prisma.storeAsaasAccount.create({
      data: { storeId: s.id, apiKeyEncrypted: encryptSensitiveData('$aact_hmlg_X22'), apiKeyLast4: 'X22', environment: 'sandbox', status: 'valid', authWebhookTokenHash: sha256Hex(tok) },
    });
    return s.id;
  };
  storeId = await mk('Loja 22', TOKEN);
  otherStoreId = await mk('Outra 22', OTHER_TOKEN);
});

afterEach(async () => {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  const ids = stores.map((s) => s.id);
  await prisma.motoboyTransfer.deleteMany({ where: { storeId: { in: ids } } });
  await prisma.directRefund.deleteMany({ where: { storeId: { in: ids } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

let seq = 0;
async function mkTransfer(o: Partial<{ storeId: string; status: string; amount: number; key: string; authorizedAt: Date | null }> = {}) {
  seq += 1;
  return prisma.motoboyTransfer.create({
    data: {
      deliveryId: `del22-${Date.now()}-${seq}`,
      orderId: `ord22-${seq}`,
      storeId: o.storeId ?? storeId,
      motoboyId: 'mb22',
      amount: o.amount ?? 12.5,
      pixKeyEncrypted: encryptSensitiveData(o.key ?? KEY),
      pixKeyType: 'CPF',
      status: o.status ?? 'requested',
      authorizedAt: o.authorizedAt ?? null,
    },
  });
}

const transferBody = (t: { id: string }, over: any = {}) => ({
  type: 'TRANSFER',
  transfer: { id: 'tra_1', value: 12.5, externalReference: t.id, pixAddressKey: KEY, ...over },
});
const call = (body: any, token: string | null = TOKEN, sid = storeId) => {
  const r = request(app).post(`/webhooks/asaas/loja/${sid}/autorizacao`);
  if (token !== null) r.set('asaas-access-token', token);
  return r.send(body);
};
const expectRefused = (res: any, reason?: string) => {
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('REFUSED');
  if (reason) expect(res.body.refuseReason).toBe(reason);
};

describe('t2.2 — autorização de transferências', () => {
  it('APPROVED quando tudo bate; grava authorizedAt; segunda chamada idêntica aprova sem regravar', async () => {
    const t = await mkTransfer();
    const r1 = await call(transferBody(t));
    expect(r1.status).toBe(200);
    expect(r1.body).toEqual({ status: 'APPROVED' });
    const a1 = (await prisma.motoboyTransfer.findUnique({ where: { id: t.id } }))!.authorizedAt;
    expect(a1).toBeTruthy();
    const r2 = await call(transferBody(t));
    expect(r2.body).toEqual({ status: 'APPROVED' });
    expect((await prisma.motoboyTransfer.findUnique({ where: { id: t.id } }))!.authorizedAt).toEqual(a1);
  });

  it('aceita chave em bankAccount.pixAddressKey e CPF formatado', async () => {
    const t = await mkTransfer();
    const res = await call({ type: 'transfer', transfer: { value: 12.5, externalReference: t.id, bankAccount: { pixAddressKey: '123.456.789-09' } } });
    expect(res.body.status).toBe('APPROVED');
  });

  it('token ausente, inválido ou de outra loja → REFUSED (200) e nada gravado', async () => {
    const t = await mkTransfer();
    for (const tok of [null, 'errado', OTHER_TOKEN]) expectRefused(await call(transferBody(t), tok), 'INVALID_TOKEN');
    expect((await prisma.motoboyTransfer.findUnique({ where: { id: t.id } }))!.authorizedAt).toBeNull();
  });

  it('bill, mobilePhoneRecharge, pixQrCode e type desconhecido → REFUSED', async () => {
    for (const type of ['BILL', 'bill', 'MOBILE_PHONE_RECHARGE', 'PIX_QR_CODE', 'XYZ']) {
      expectRefused(await call({ type, bill: { value: 10 } }), 'UNSUPPORTED_TYPE');
    }
    expectRefused(await call({ bill: { value: 10 } }), 'UNSUPPORTED_TYPE');
  });

  it('externalReference inexistente, ausente ou de outra loja → REFUSED', async () => {
    const t = await mkTransfer();
    expectRefused(await call(transferBody({ id: 'nao-existe' })), 'UNKNOWN_TRANSFER');
    expectRefused(await call({ type: 'TRANSFER', transfer: { value: 12.5, pixAddressKey: KEY } }), 'UNKNOWN_TRANSFER');
    expectRefused(await call(transferBody(t), OTHER_TOKEN, otherStoreId), 'STORE_MISMATCH');
    const o = await mkTransfer({ storeId: otherStoreId });
    expectRefused(await call(transferBody(o)), 'STORE_MISMATCH');
    expect((await prisma.motoboyTransfer.findUnique({ where: { id: o.id } }))!.authorizedAt).toBeNull();
  });

  it('status diferente de requested (pending, done, failed, uncertain) → REFUSED', async () => {
    for (const status of ['pending', 'done', 'failed', 'uncertain', 'cancelled']) {
      const t = await mkTransfer({ status });
      expectRefused(await call(transferBody(t)), 'INVALID_STATUS');
      expect((await prisma.motoboyTransfer.findUnique({ where: { id: t.id } }))!.authorizedAt).toBeNull();
    }
  });

  it('valor diferente (centavos) → REFUSED; 12.50 === 12.5; 12.51 recusa', async () => {
    const t = await mkTransfer();
    expectRefused(await call(transferBody(t, { value: 12.51 })), 'AMOUNT_MISMATCH');
    expectRefused(await call(transferBody(t, { value: undefined })), 'AMOUNT_MISMATCH');
    expect((await call(transferBody(t, { value: '12.50' }))).body.status).toBe('APPROVED');
  });

  it('chave Pix diferente do snapshot ou ausente → REFUSED', async () => {
    const t = await mkTransfer();
    expectRefused(await call(transferBody(t, { pixAddressKey: '98765432100' })), 'PIX_KEY_MISMATCH');
    expectRefused(await call(transferBody(t, { pixAddressKey: undefined })), 'PIX_KEY_MISMATCH');
    expect((await prisma.motoboyTransfer.findUnique({ where: { id: t.id } }))!.authorizedAt).toBeNull();
  });

  it('e-mail comparado em minúsculo', async () => {
    const t = await mkTransfer({ key: 'Fulano@Mail.com' });
    expect((await call(transferBody(t, { pixAddressKey: ' fulano@mail.COM ' }))).body.status).toBe('APPROVED');
  });

  it('corpo vazio/inválido → REFUSED, nunca 500', async () => {
    expectRefused(await call({}));
    expectRefused(await call({ type: 'TRANSFER' }));
  });

  it('exceção interna → REFUSED (fail closed)', async () => {
    const t = await mkTransfer();
    jest.spyOn(prisma.motoboyTransfer, 'findUnique').mockRejectedValueOnce(new Error('db down'));
    expectRefused(await call(transferBody(t)), 'INTERNAL_ERROR');
  });
});

describe('t2.2 — pixRefund', () => {
  async function mkRefund(o: Partial<{ status: string; amount: number; storeId: string }> = {}) {
    seq += 1;
    return prisma.directRefund.create({
      data: { orderId: `ordref22-${Date.now()}-${seq}`, storeId: o.storeId ?? storeId, asaasPaymentId: `pay_22_${seq}`, amount: o.amount ?? 30, status: o.status ?? 'requested', requestedBy: 'u' },
    });
  }
  const body = (r: { asaasPaymentId: string }, over: any = {}, key = 'paymentId') => ({ type: 'PIX_REFUND', pixRefund: { [key]: r.asaasPaymentId, value: 30, ...over } });

  it('APPROVED com DirectRefund requested da mesma loja, mesmo pagamento e valor (paymentId ou payment)', async () => {
    const r = await mkRefund();
    expect((await call(body(r))).body).toEqual({ status: 'APPROVED' });
    expect((await call(body(r, {}, 'payment'))).body).toEqual({ status: 'APPROVED' });
  });

  it('REFUSED: sem refund, outra loja, status ≠ requested, valor diferente', async () => {
    const r = await mkRefund();
    expectRefused(await call(body({ asaasPaymentId: 'pay_nada' })), 'UNKNOWN_REFUND');
    expectRefused(await call(body(r), OTHER_TOKEN, otherStoreId), 'UNKNOWN_REFUND');
    const done = await mkRefund({ status: 'done' });
    expectRefused(await call(body(done)), 'UNKNOWN_REFUND');
    expectRefused(await call(body(r, { value: 29.99 })), 'AMOUNT_MISMATCH');
    expectRefused(await call({ type: 'PIX_REFUND', pixRefund: { value: 30 } }), 'UNKNOWN_REFUND');
  });
});

describe('t2.2 — log e parsing', () => {
  it('loga [transfer-auth] sem chave Pix nem token', async () => {
    const spy = jest.spyOn(logger as any, 'info');
    const t = await mkTransfer();
    await call(transferBody(t));
    await call(transferBody(t, { pixAddressKey: '00000000000' }));
    const calls = spy.mock.calls.filter((c) => c[0] === '[transfer-auth]');
    expect(calls.length).toBe(2);
    expect(calls[0][1]).toMatchObject({ storeId, transferId: t.id, decision: 'APPROVED' });
    expect(calls[1][1]).toMatchObject({ decision: 'REFUSED', reason: 'PIX_KEY_MISMATCH' });
    const dump = JSON.stringify(calls);
    expect(dump).not.toContain(KEY);
    expect(dump).not.toContain(TOKEN);
  });

  it('parseAuthorizationRequest lê a fixture assumida e variações', () => {
    const f: any = fixture;
    expect(parseAuthorizationRequest(f.transfer)).toMatchObject({ kind: 'transfer', valueCents: 1250 });
    expect(parseAuthorizationRequest(f.pixRefund)).toEqual({ kind: 'pixRefund', paymentId: 'pay_000000000001', valueCents: 3000 });
    expect(parseAuthorizationRequest(f.bill)).toEqual({ kind: 'unsupported', type: 'BILL' });
    expect(parseAuthorizationRequest(null)).toEqual({ kind: 'invalid' });
    expect(parseAuthorizationRequest({ type: 'pix_refund', pixRefund: { payment: { id: 'pay_x' }, value: '1.1' } })).toEqual({ kind: 'pixRefund', paymentId: 'pay_x', valueCents: 110 });
  });

  it('normalizePixKey', () => {
    expect(normalizePixKey(' 123.456.789-09 ')).toBe('12345678909');
    expect(normalizePixKey('+55 (11) 91234-5678')).toBe('5511912345678');
    expect(normalizePixKey('A@B.com')).toBe('a@b.com');
  });
});

describe('t2.2 — auth-token', () => {
  it('gera o token (uma vez, só hash no banco); o token novo invalida o anterior e autoriza', async () => {
    const { createTestUser, bearer } = require('./helpers/authUser');
    const owner = await createTestUser('lojista', DOMAIN);
    const s = await prisma.store.create({ data: { ownerId: owner.userId, name: 'Loja tk22', isOpen: true } as any });
    await prisma.storeAsaasAccount.create({
      data: { storeId: s.id, apiKeyEncrypted: encryptSensitiveData('$aact_hmlg_X22'), apiKeyLast4: 'X22', environment: 'sandbox', status: 'valid' },
    });
    const gen = () => request(app).post('/api/stores/' + s.id + '/asaas/auth-token').set('Authorization', bearer(owner));
    const a = await gen();
    expect(a.status).toBe(200);
    const tok1 = a.body.data.token;
    expect(a.body.data.url).toContain('/webhooks/asaas/loja/' + s.id + '/autorizacao');
    const row = await prisma.storeAsaasAccount.findUnique({ where: { storeId: s.id } });
    expect(row!.authWebhookTokenHash).toBe(sha256Hex(tok1));
    expect(JSON.stringify(row)).not.toContain(tok1);
    const b = await gen();
    const tok2 = b.body.data.token;
    expect(tok2).not.toBe(tok1);
    expectRefused(await call({ type: 'BILL' }, tok1, s.id), 'INVALID_TOKEN');
    expectRefused(await call({ type: 'BILL' }, tok2, s.id), 'UNSUPPORTED_TYPE');
  });
});
