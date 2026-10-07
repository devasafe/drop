/**
 * Task 1.6 — webhook de pagamento POR LOJA (modo direto) e conciliação.
 *  - POST /webhooks/asaas/loja/:storeId com token próprio da loja (só o SHA-256 fica no banco);
 *  - confirmação sem Payout/carteira (o dinheiro já está na conta da loja);
 *  - registro do webhook na conta Asaas da loja ao conectar a chave;
 *  - GET /orders/:id/pix concilia com a chave da LOJA (nunca a conta-mãe).
 * Asaas mockado em services/asaas/client (sem rede).
 */
jest.mock('../services/asaas/client', () => {
  const actual = jest.requireActual('../services/asaas/client');
  return {
    __esModule: true,
    ...actual,
    default: {
      ...actual.default,
      get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn(),
      getAs: jest.fn(), postAs: jest.fn(), putAs: jest.fn(), deleteAs: jest.fn(),
    },
  };
});

import crypto from 'crypto';
import request from 'supertest';
import app from '../app';
import asaasClient, { AsaasApiError } from '../services/asaas/client';
import { prisma } from '../lib/prisma';
import env from '../config/env';
import logger from '../config/logger';
import notifier from '../services/notifier';
import { encryptSensitiveData } from '../utils/encryption';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import { ownerIdForStore } from './helpers/storeOwner';
import { connectStoreAsaas } from '../services/asaasLoja/account';
import { registerPaymentWebhook, verifyStoreWebhookToken } from '../services/asaasLoja/webhook';
import * as orderPaymentDirect from '../services/asaasLoja/orderPaymentDirect';

const DOMAIN = '@saas16.test';
const KEY_A = '$aact_hmlg_LOJA_A_0001';
const KEY_B = '$aact_hmlg_LOJA_B_0002';
const TOKEN_A = 'a'.repeat(48);
const TOKEN_B = 'b'.repeat(48);
const sha = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

const get = asaasClient.get as jest.Mock;
const getAs = asaasClient.getAs as jest.Mock;
const postAs = asaasClient.postAs as jest.Mock;

const ORIGINAL_ASAAS_URL = env.ASAAS_API_URL;
const ORIGINAL_PUBLIC = (env as any).PUBLIC_API_URL;
const ORIGINAL_WH_TOKEN = env.ASAAS_WEBHOOK_TOKEN;

const roomEmits: { room: string; event: string }[] = [];
const fakeIo = { to: (room: string) => ({ emit: (event: string) => { roomEmits.push({ room, event }); } }), emit: jest.fn() };
let ioSpy: jest.SpyInstance;

beforeAll(() => {
  (env as any).ASAAS_API_URL = 'https://sandbox.asaas.com/api/v3';
  (env as any).PUBLIC_API_URL = 'https://api.exemplo.test';
});
afterAll(() => {
  (env as any).ASAAS_API_URL = ORIGINAL_ASAAS_URL;
  (env as any).PUBLIC_API_URL = ORIGINAL_PUBLIC;
  env.ASAAS_WEBHOOK_TOKEN = ORIGINAL_WH_TOKEN;
});

beforeEach(() => {
  jest.clearAllMocks();
  get.mockReset(); getAs.mockReset(); postAs.mockReset();
  roomEmits.length = 0;
  ioSpy = jest.spyOn(notifier as any, 'io', 'get').mockReturnValue(fakeIo as any);
});

afterEach(async () => {
  ioSpy.mockRestore();
  await prisma.webhookEvent.deleteMany({ where: { eventId: { contains: 'evt_t16_' } } });
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  await prisma.storeAsaasAudit.deleteMany({ where: { storeId: { in: stores.map((s) => s.id) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function storeWith(opts: { key?: string; token?: string | null; account?: boolean } = {}) {
  const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore(DOMAIN), name: 'Loja T16', isOpen: true } });
  if (opts.account !== false) {
    await prisma.storeAsaasAccount.create({
      data: {
        storeId: store.id, apiKeyEncrypted: encryptSensitiveData(opts.key ?? KEY_A), apiKeyLast4: (opts.key ?? KEY_A).slice(-4),
        environment: 'sandbox', status: 'valid',
        paymentWebhookId: opts.token === null ? null : 'wh_existente',
        paymentWebhookTokenHash: opts.token === null ? null : sha(opts.token ?? TOKEN_A),
      },
    });
  }
  return store;
}

async function directOrder(storeId: string, paymentId: string, extra: Record<string, unknown> = {}) {
  const cliente = await createTestUser('cliente', DOMAIN);
  const order = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId, totalValue: 30, subtotal: 25, deliveryFee: 5,
      paymentMethod: 'pix', paymentStatus: 'pending', asaasChargeStatus: 'pending',
      asaasPaymentId: paymentId, paymentProvider: 'asaas_loja', ...extra,
    } as any,
  });
  return { order, cliente };
}

const uid = () => Math.random().toString(36).slice(2, 10);
const event = (id: string, type: string, paymentId: string, status = 'RECEIVED') => ({
  id, event: type, payment: { id: paymentId, status, value: 30 },
});
const send = (storeId: string, body: any, token?: string) => {
  const r = request(app).post(`/webhooks/asaas/loja/${storeId}`);
  return (token === undefined ? r : r.set('asaas-access-token', token)).send(body);
};

describe('t1.6 — autenticação do webhook por loja', () => {
  it('sem header → 401', async () => {
    const store = await storeWith();
    const res = await send(store.id, event(`evt_t16_${uid()}`, 'PAYMENT_RECEIVED', 'pay_x'));
    expect(res.status).toBe(401);
  });

  it('token da loja A em /loja/B → 401; loja inexistente e loja sem hash → MESMA resposta 401', async () => {
    const lojaA = await storeWith({ token: TOKEN_A });
    const lojaB = await storeWith({ key: KEY_B, token: TOKEN_B });
    const semHash = await storeWith({ token: null });
    const semConta = await storeWith({ account: false });

    const cruzado = await send(lojaB.id, event(`evt_t16_${uid()}`, 'PAYMENT_RECEIVED', 'pay_x'), TOKEN_A);
    const inexistente = await send('loja-que-nao-existe', event(`evt_t16_${uid()}`, 'PAYMENT_RECEIVED', 'pay_x'), TOKEN_A);
    const r3 = await send(semHash.id, event(`evt_t16_${uid()}`, 'PAYMENT_RECEIVED', 'pay_x'), TOKEN_A);
    const r4 = await send(semConta.id, event(`evt_t16_${uid()}`, 'PAYMENT_RECEIVED', 'pay_x'), TOKEN_A);

    for (const r of [cruzado, inexistente, r3, r4]) {
      expect(r.status).toBe(401);
      expect(r.body).toEqual(cruzado.body);
    }
    expect(lojaA.id).toBeTruthy();
    expect(await prisma.webhookEvent.count({ where: { eventId: { contains: 'evt_t16_' } } })).toBe(0);
  });

  it('verifyStoreWebhookToken: compara hashes; token errado/vazio → false; tipo auth sem hash → false', async () => {
    const store = await storeWith({ token: TOKEN_A });
    expect(await verifyStoreWebhookToken(store.id, TOKEN_A, 'payment')).toBe(true);
    expect(await verifyStoreWebhookToken(store.id, TOKEN_B, 'payment')).toBe(false);
    expect(await verifyStoreWebhookToken(store.id, '', 'payment')).toBe(false);
    expect(await verifyStoreWebhookToken(store.id, TOKEN_A, 'auth')).toBe(false);
  });

  it('o webhook da custódia continua exigindo o token global (token de loja não serve lá)', async () => {
    env.ASAAS_WEBHOOK_TOKEN = 'token-global-t16';
    await storeWith({ token: TOKEN_A });
    const res = await request(app).post('/webhooks/asaas').set('asaas-access-token', TOKEN_A)
      .send(event(`evt_t16_${uid()}`, 'PAYMENT_RECEIVED', 'pay_x'));
    expect(res.status).toBe(401);
  });
});

describe('t1.6 — confirmação do pagamento pelo webhook da loja', () => {
  it('PAYMENT_RECEIVED válido: pedido da loja vira pago, sem Payout, loja e cliente notificados', async () => {
    const store = await storeWith();
    const pay = `pay_t16_${uid()}`;
    const { order, cliente } = await directOrder(store.id, pay);

    const res = await send(store.id, event(`evt_t16_${uid()}`, 'PAYMENT_RECEIVED', pay), TOKEN_A);

    expect(res.status).toBe(200);
    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after!.paymentStatus).toBe('paid');
    expect(after!.asaasChargeStatus).toBe('received');
    expect(await prisma.payout.count({ where: { orderId: order.id } })).toBe(0);
    expect(roomEmits.some((e) => e.room === `store:${store.id}`)).toBe(true);
    expect(roomEmits.some((e) => e.room === `user:${cliente.userId}`)).toBe(true);
  });

  it('PAYMENT_CONFIRMED (Pix) também confirma, com asaasChargeStatus confirmed', async () => {
    const store = await storeWith();
    const pay = `pay_t16_${uid()}`;
    const { order } = await directOrder(store.id, pay);
    const res = await send(store.id, event(`evt_t16_${uid()}`, 'PAYMENT_CONFIRMED', pay, 'CONFIRMED'), TOKEN_A);
    expect(res.status).toBe(200);
    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after!.paymentStatus).toBe('paid');
    expect(after!.asaasChargeStatus).toBe('confirmed');
  });

  it('mesmo evento duas vezes: processa uma vez (idempotência por event.id em WebhookEvent)', async () => {
    const store = await storeWith();
    const pay = `pay_t16_${uid()}`;
    await directOrder(store.id, pay);
    const ev = event(`evt_t16_${uid()}`, 'PAYMENT_RECEIVED', pay);

    const r1 = await send(store.id, ev, TOKEN_A);
    const r2 = await send(store.id, ev, TOKEN_A);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r2.body.duplicate).toBe(true);
    expect(await prisma.webhookEvent.count({ where: { eventId: { contains: ev.id } } })).toBe(1);
    expect(roomEmits.filter((e) => e.room === `store:${store.id}` && e.event === 'new_order')).toHaveLength(1);
  });

  it('mesmo event.id vindo de duas lojas (contas Asaas diferentes) não colide', async () => {
    const lojaA = await storeWith({ token: TOKEN_A });
    const lojaB = await storeWith({ key: KEY_B, token: TOKEN_B });
    const payA = `pay_t16_${uid()}`;
    const payB = `pay_t16_${uid()}`;
    const { order: oA } = await directOrder(lojaA.id, payA);
    const { order: oB } = await directOrder(lojaB.id, payB);
    const id = `evt_t16_${uid()}`;

    expect((await send(lojaA.id, event(id, 'PAYMENT_RECEIVED', payA), TOKEN_A)).body.duplicate).toBeUndefined();
    expect((await send(lojaB.id, event(id, 'PAYMENT_RECEIVED', payB), TOKEN_B)).body.duplicate).toBeUndefined();
    expect((await prisma.order.findUnique({ where: { id: oA.id } }))!.paymentStatus).toBe('paid');
    expect((await prisma.order.findUnique({ where: { id: oB.id } }))!.paymentStatus).toBe('paid');
  });

  it('pagamento de OUTRA loja: ignorado com aviso, 200, pedido alheio intocado', async () => {
    const lojaA = await storeWith({ token: TOKEN_A });
    const lojaB = await storeWith({ key: KEY_B, token: TOKEN_B });
    const pay = `pay_t16_${uid()}`;
    const { order } = await directOrder(lojaB.id, pay);
    const warn = jest.spyOn(logger as any, 'warn');

    const res = await send(lojaA.id, event(`evt_t16_${uid()}`, 'PAYMENT_RECEIVED', pay), TOKEN_A);

    expect(res.status).toBe(200);
    expect((await prisma.order.findUnique({ where: { id: order.id } }))!.paymentStatus).toBe('pending');
    expect(warn).toHaveBeenCalled();
    expect(roomEmits).toHaveLength(0);
    warn.mockRestore();
  });

  it('pedido de custódia (paymentProvider asaas) com o mesmo paymentId não é tocado pelo webhook da loja', async () => {
    const store = await storeWith();
    const pay = `pay_t16_${uid()}`;
    const { order } = await directOrder(store.id, pay, { paymentProvider: 'asaas' });
    const res = await send(store.id, event(`evt_t16_${uid()}`, 'PAYMENT_RECEIVED', pay), TOKEN_A);
    expect(res.status).toBe(200);
    expect((await prisma.order.findUnique({ where: { id: order.id } }))!.paymentStatus).toBe('pending');
  });

  it('pedido cancelado não ressuscita', async () => {
    const store = await storeWith();
    const pay = `pay_t16_${uid()}`;
    const { order } = await directOrder(store.id, pay, { status: 'cancelado' });
    await send(store.id, event(`evt_t16_${uid()}`, 'PAYMENT_RECEIVED', pay), TOKEN_A);
    expect((await prisma.order.findUnique({ where: { id: order.id } }))!.paymentStatus).toBe('pending');
  });

  it('PAYMENT_REFUNDED da loja marca o pedido estornado (sem efeito de carteira)', async () => {
    const store = await storeWith();
    const pay = `pay_t16_${uid()}`;
    const { order } = await directOrder(store.id, pay, { paymentStatus: 'paid', asaasChargeStatus: 'received' });
    const res = await send(store.id, event(`evt_t16_${uid()}`, 'PAYMENT_REFUNDED', pay, 'REFUNDED'), TOKEN_A);
    expect(res.status).toBe(200);
    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after!.paymentStatus).toBe('refunded');
    expect(after!.asaasChargeStatus).toBe('refunded');
  });

  it('evento gravado cuja execução FALHOU é reprocessado na re-tentativa do Asaas', async () => {
    const store = await storeWith();
    const pay = `pay_t16_${uid()}`;
    const { order } = await directOrder(store.id, pay);
    const ev = event(`evt_t16_${uid()}`, 'PAYMENT_RECEIVED', pay);
    await prisma.webhookEvent.create({
      data: { provider: 'asaas_loja', eventId: `loja:${store.id}:${ev.id}`, event: ev.event, payload: ev, processed: false, processError: 'db fora' },
    });

    const res = await send(store.id, ev, TOKEN_A);

    expect(res.status).toBe(200);
    expect((await prisma.order.findUnique({ where: { id: order.id } }))!.paymentStatus).toBe('paid');
    const row = await prisma.webhookEvent.findUnique({ where: { eventId: `loja:${store.id}:${ev.id}` } });
    expect(row!.processed).toBe(true);
  });

  it('TRANSFER_DONE (Fase 2) é aceito e ignorado com 200', async () => {
    const store = await storeWith();
    const res = await send(store.id, { id: `evt_t16_${uid()}`, event: 'TRANSFER_DONE', transfer: { id: 'tr_1' } }, TOKEN_A);
    expect(res.status).toBe(200);
  });
});

describe('t1.6 — registro do webhook na conta da loja', () => {
  it('registerPaymentWebhook: POST /webhooks com a chave da loja, token aleatório de 48 e só o hash gravado', async () => {
    const store = await storeWith({ token: null });
    const owner = await prisma.user.findFirst({ where: { ownedStores: { some: { id: store.id } } } as any });
    postAs.mockResolvedValueOnce({ id: 'wh_novo' });

    await registerPaymentWebhook(store.id);

    expect(postAs).toHaveBeenCalledTimes(1);
    const [key, path, body] = postAs.mock.calls[0];
    expect(key).toBe(KEY_A);
    expect(path).toBe('/webhooks');
    expect(body).toMatchObject({
      url: `https://api.exemplo.test/webhooks/asaas/loja/${store.id}`,
      enabled: true, interrupted: false, apiVersion: 3, sendType: 'SEQUENTIALLY',
      events: ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_REFUNDED', 'PAYMENT_REFUND_IN_PROGRESS', 'TRANSFER_DONE', 'TRANSFER_FAILED', 'TRANSFER_CANCELLED'],
    });
    expect(body.email).toBe(owner?.email);
    expect(typeof body.authToken).toBe('string');
    expect(body.authToken).toHaveLength(48);
    const row = await prisma.storeAsaasAccount.findUnique({ where: { storeId: store.id } });
    expect(row!.paymentWebhookId).toBe('wh_novo');
    expect(row!.paymentWebhookTokenHash).toBe(sha(body.authToken));
    expect(JSON.stringify(row)).not.toContain(body.authToken);
    expect(await verifyStoreWebhookToken(store.id, body.authToken, 'payment')).toBe(true);
  });

  it('connectStoreAsaas registra o webhook (checklist.paymentWebhook = true)', async () => {
    const store = await storeWith({ account: false });
    getAs.mockResolvedValueOnce({ balance: 0 });
    postAs.mockResolvedValueOnce({ id: 'wh_conn' });

    const st = await connectStoreAsaas(store.id, KEY_A, 'actor-t16');

    expect(st.status).toBe('valid');
    expect(st.checklist.paymentWebhook).toBe(true);
    expect(postAs.mock.calls[0][1]).toBe('/webhooks');
  });

  it('falha no registro não derruba a conexão: valid, paymentWebhook=false, lastError, log sem chave/token', async () => {
    const store = await storeWith({ account: false });
    getAs.mockResolvedValueOnce({ balance: 0 });
    postAs.mockRejectedValueOnce(new AsaasApiError(400, [{ code: 'invalid', description: 'limite de webhooks' }]));
    const warn = jest.spyOn(logger as any, 'warn');

    const st = await connectStoreAsaas(store.id, KEY_A, 'actor-t16');

    expect(st.status).toBe('valid');
    expect(st.checklist.paymentWebhook).toBe(false);
    const row = await prisma.storeAsaasAccount.findUnique({ where: { storeId: store.id } });
    expect(row!.status).toBe('valid');
    expect(row!.paymentWebhookId).toBeNull();
    expect(row!.paymentWebhookTokenHash).toBeNull();
    expect(row!.lastError).toBeTruthy();
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(KEY_A);
    warn.mockRestore();
  });

  it('TROCA de chave: zera webhook/hashes/confirmações da conta anterior e registra um novo', async () => {
    const store = await storeWith({ token: TOKEN_A });
    await prisma.storeAsaasAccount.update({
      where: { storeId: store.id },
      data: { authWebhookTokenHash: sha('auth-antigo'), ipWhitelistConfirmedAt: new Date(), authWebhookConfirmedAt: new Date() },
    });
    getAs.mockResolvedValueOnce({ balance: 0 });
    postAs.mockRejectedValueOnce(new Error('rede'));

    await connectStoreAsaas(store.id, KEY_B, 'actor-t16');

    const row = await prisma.storeAsaasAccount.findUnique({ where: { storeId: store.id } });
    expect(row!.paymentWebhookId).toBeNull();
    expect(row!.paymentWebhookTokenHash).toBeNull();
    expect(row!.authWebhookTokenHash).toBeNull();
    expect(row!.ipWhitelistConfirmedAt).toBeNull();
    expect(row!.authWebhookConfirmedAt).toBeNull();
    expect(postAs.mock.calls[0][0]).toBe(KEY_B);
    expect(postAs.mock.calls[0][1]).toBe('/webhooks');
    // O token da conta anterior não vale mais.
    expect((await send(store.id, event(`evt_t16_${uid()}`, 'PAYMENT_RECEIVED', 'pay_x'), TOKEN_A)).status).toBe(401);
  });

  it('TROCA de chave com registro OK: grava o webhook novo', async () => {
    const store = await storeWith({ token: TOKEN_A });
    getAs.mockResolvedValueOnce({ balance: 0 });
    postAs.mockResolvedValueOnce({ id: 'wh_conta_nova' });
    await connectStoreAsaas(store.id, KEY_B, 'actor-t16');
    const row = await prisma.storeAsaasAccount.findUnique({ where: { storeId: store.id } });
    expect(row!.paymentWebhookId).toBe('wh_conta_nova');
    expect(row!.paymentWebhookTokenHash).not.toBe(sha(TOKEN_A));
  });

  it('reconectar a MESMA chave mantém o webhook já registrado (não cria outro)', async () => {
    const store = await storeWith({ token: TOKEN_A });
    getAs.mockResolvedValueOnce({ balance: 0 });

    const st = await connectStoreAsaas(store.id, KEY_A, 'actor-t16');

    expect(postAs).not.toHaveBeenCalled();
    expect(st.checklist.paymentWebhook).toBe(true);
    const row = await prisma.storeAsaasAccount.findUnique({ where: { storeId: store.id } });
    expect(row!.paymentWebhookId).toBe('wh_existente');
    expect(row!.paymentWebhookTokenHash).toBe(sha(TOKEN_A));
  });
});

describe('t1.6 — GET /orders/:id/pix concilia pela chave da loja', () => {
  it('cobrança paga: consulta GET /payments/{id} com a chave da LOJA e confirma; conta-mãe nunca é chamada', async () => {
    const store = await storeWith();
    const pay = `pay_t16_${uid()}`;
    const { order, cliente } = await directOrder(store.id, pay);
    getAs.mockImplementation(async (_k: string, path: string) => {
      if (path === `/payments/${pay}`) return { id: pay, status: 'RECEIVED' };
      throw new Error(`rota inesperada ${path}`);
    });

    const res = await request(app).get(`/api/orders/${order.id}/pix`).set('Authorization', bearer(cliente));

    expect(res.status).toBe(200);
    expect(res.body.paid).toBe(true);
    expect(getAs).toHaveBeenCalledWith(KEY_A, `/payments/${pay}`);
    expect(get).not.toHaveBeenCalled();
    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after!.paymentStatus).toBe('paid');
    expect(await prisma.payout.count({ where: { orderId: order.id } })).toBe(0);
  });

  it('cobrança pendente: devolve o QR buscado com a chave da LOJA', async () => {
    const store = await storeWith();
    const pay = `pay_t16_${uid()}`;
    const { order, cliente } = await directOrder(store.id, pay);
    getAs.mockImplementation(async (_k: string, path: string) => {
      if (path === `/payments/${pay}`) return { id: pay, status: 'PENDING' };
      if (path === `/payments/${pay}/pixQrCode`) return { encodedImage: 'img', payload: 'copia', expirationDate: '2026-10-09 23:59:59' };
      throw new Error(`rota inesperada ${path}`);
    });

    const res = await request(app).get(`/api/orders/${order.id}/pix`).set('Authorization', bearer(cliente));

    expect(res.status).toBe(200);
    expect(res.body.paid).toBe(false);
    expect(res.body.qrCodePayload).toBe('copia');
    expect(res.body.qrCodeImage).toBe('img');
    expect(getAs.mock.calls.every((c) => c[0] === KEY_A)).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });
});

describe('t1.6b(F) — robustez do webhook por loja', () => {
  it('erro SEM message (throw de string) → processError preenchido, evento NÃO marcado processado', async () => {
    const store = await storeWith();
    const pay = `pay_t16_${uid()}`;
    await directOrder(store.id, pay);
    const ev = event(`evt_t16_${uid()}`, 'PAYMENT_RECEIVED', pay);
    const spy = jest.spyOn(orderPaymentDirect, 'confirmDirectOrderPaid').mockRejectedValueOnce('falha-sem-message');

    const res = await send(store.id, ev, TOKEN_A);

    expect(res.status).toBe(500); // Asaas re-tenta
    const row = await prisma.webhookEvent.findUnique({ where: { eventId: `loja:${store.id}:${ev.id}` } });
    expect(row!.processed).toBe(false);
    expect(row!.processError).toBe('falha-sem-message');
    spy.mockRestore();
  });

  it('reprocessamento bem-sucedido limpa o processError anterior', async () => {
    const store = await storeWith();
    const pay = `pay_t16_${uid()}`;
    await directOrder(store.id, pay);
    const ev = event(`evt_t16_${uid()}`, 'PAYMENT_RECEIVED', pay);
    await prisma.webhookEvent.create({
      data: { provider: 'asaas_loja', eventId: `loja:${store.id}:${ev.id}`, event: ev.event, payload: ev, processed: false, processError: 'db fora' },
    });

    expect((await send(store.id, ev, TOKEN_A)).status).toBe(200);

    const row = await prisma.webhookEvent.findUnique({ where: { eventId: `loja:${store.id}:${ev.id}` } });
    expect(row!.processed).toBe(true);
    expect(row!.processError).toBeNull();
  });

  it('evento com processed=false e SEM processError (em andamento) continua tratado como duplicado', async () => {
    const store = await storeWith();
    const pay = `pay_t16_${uid()}`;
    const { order } = await directOrder(store.id, pay);
    const ev = event(`evt_t16_${uid()}`, 'PAYMENT_RECEIVED', pay);
    await prisma.webhookEvent.create({
      data: { provider: 'asaas_loja', eventId: `loja:${store.id}:${ev.id}`, event: ev.event, payload: ev, processed: false },
    });

    const res = await send(store.id, ev, TOKEN_A);

    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
    expect((await prisma.order.findUnique({ where: { id: order.id } }))!.paymentStatus).toBe('pending');
  });

  it('confirmDirectOrderPaid: falha na leitura/notificação depois do updateMany não derruba (pago fica gravado, warn)', async () => {
    const store = await storeWith();
    const pay = `pay_t16_${uid()}`;
    const { order } = await directOrder(store.id, pay);
    const warn = jest.spyOn(logger as any, 'warn');
    const ff = jest.spyOn(prisma.order, 'findFirst').mockRejectedValueOnce(new Error('db oscilou'));

    await expect(orderPaymentDirect.confirmDirectOrderPaid(store.id, pay, 'RECEIVED')).resolves.toBe(true);

    expect((await prisma.order.findUnique({ where: { id: order.id } }))!.paymentStatus).toBe('paid');
    expect(warn).toHaveBeenCalled();
    ff.mockRestore();
    warn.mockRestore();
  });

  it('registro do webhook: nenhum log (sucesso ou falha) contém o authToken enviado', async () => {
    const spies = (['info', 'warn', 'error', 'debug'] as const).map((m) => jest.spyOn(logger as any, m));
    const logged = () => JSON.stringify(spies.map((s) => s.mock.calls));

    const ok = await storeWith({ token: null });
    postAs.mockResolvedValueOnce({ id: 'wh_log_ok' });
    await registerPaymentWebhook(ok.id);
    const tokenOk = postAs.mock.calls[0][2].authToken;
    expect(tokenOk).toHaveLength(48);

    const bad = await storeWith({ account: false });
    getAs.mockResolvedValueOnce({ balance: 0 });
    postAs.mockRejectedValueOnce(new AsaasApiError(400, [{ code: 'invalid', description: 'limite' }]));
    await connectStoreAsaas(bad.id, KEY_A, 'actor-t16');
    const tokenFail = postAs.mock.calls[1][2].authToken;
    expect(tokenFail).toHaveLength(48);

    expect(logged()).not.toContain(tokenOk);
    expect(logged()).not.toContain(tokenFail);
    spies.forEach((s) => s.mockRestore());
  });
});
