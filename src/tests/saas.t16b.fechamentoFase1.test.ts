/**
 * Task 1.6b — fechamento da Fase 1 do modo SaaS (pendências das revisões 1.4b, 1.5 e 1.6).
 *  A. Pix do modo direto expira/cancela com a chave DA LOJA (e não expira se já foi pago);
 *  B. entrega de pedido direto não cria Payout nem mexe em carteira;
 *  C. guard CEO do admin de contas Asaas é por rota (não intercepta /api/admin/stores/*);
 *  D. connect/disconnect concorrentes não viram 500;
 *  E. cupom inválido não deixa estoque baixado (bug pré-existente, nos dois modos);
 *  G. falha depois da cobrança criada gera log de reconciliação.
 * (F fica em saas.t16.) Asaas mockado em services/asaas/client (sem rede).
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
jest.mock('../services/routeService', () => {
  const actual = jest.requireActual('../services/routeService');
  return { __esModule: true, ...actual, getRoute: jest.fn() };
});

import express from 'express';
import request from 'supertest';
import app from '../app';
import asaasClient, { AsaasApiError } from '../services/asaas/client';
import { getRoute } from '../services/routeService';
import { prisma } from '../lib/prisma';
import env from '../config/env';
import logger from '../config/logger';
import { encryptSensitiveData } from '../utils/encryption';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { ownerIdForStore } from './helpers/storeOwner';
import { expireStalePixOrders } from '../services/asaas/expireOrders';
import { expirePixOrdersTick } from '../jobs/expirePixOrders.job';
import { getPaymentProvider } from '../services/paymentProvider';
import { connectStoreAsaas, disconnectStoreAsaas } from '../services/asaasLoja/account';
import adminStoreAsaasRouter from '../routes/adminStoreAsaas';

const DOMAIN = '@saas16b.test';
const STORE_KEY = '$aact_hmlg_LOJA_16B';
const del = asaasClient.delete as jest.Mock;
const deleteAs = asaasClient.deleteAs as jest.Mock;
const getAs = asaasClient.getAs as jest.Mock;
const postAs = asaasClient.postAs as jest.Mock;

let restore: () => Promise<void>;
const ORIGINAL_GATEWAY = env.PAYMENT_GATEWAY;
const ORIGINAL_ASAAS_URL = env.ASAAS_API_URL;
const couponCodes: string[] = [];

function randomCpf(): string {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (n.every((d) => d === n[0])) n[0] = (n[0] + 1) % 10;
  const dv = (base: number[]) => {
    const s = base.reduce((acc, d, i) => acc + d * (base.length + 1 - i), 0);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  n.push(dv(n));
  n.push(dv(n));
  return n.join('');
}

beforeAll(async () => {
  restore = await snapshotPlatformConfig();
  (env as any).ASAAS_API_URL = 'https://sandbox.asaas.com/api/v3';
});
afterAll(async () => {
  await restore();
  (env as any).PAYMENT_GATEWAY = ORIGINAL_GATEWAY;
  (env as any).ASAAS_API_URL = ORIGINAL_ASAAS_URL;
});

beforeEach(async () => {
  jest.clearAllMocks();
  del.mockReset(); deleteAs.mockReset(); getAs.mockReset(); postAs.mockReset();
  (env as any).PAYMENT_GATEWAY = 'none';
  (getRoute as jest.Mock).mockResolvedValue({ distanceKm: 3, durationSeconds: 600, polyline: 'abc', source: 'google' });
  await updatePlatformConfig({ settlementMode: 'direto', directCardEnabled: false, autoApprovePayouts: false } as any, 'test');
});

afterEach(async () => {
  jest.restoreAllMocks();
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  const storeIds = stores.map((s) => s.id);
  const orders = await prisma.order.findMany({ where: { storeId: { in: storeIds } }, select: { id: true } });
  await prisma.deliveryInvoice.deleteMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
  await prisma.payout.deleteMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
  await prisma.storeAsaasCustomer.deleteMany({ where: { storeId: { in: storeIds } } });
  await prisma.storeAsaasAudit.deleteMany({ where: { storeId: { in: storeIds } } });
  if (couponCodes.length) await prisma.coupon.deleteMany({ where: { code: { in: couponCodes.splice(0) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function buyer(): Promise<TestUser> {
  const u = await createTestUser('cliente', DOMAIN);
  await prisma.user.update({ where: { id: u.userId }, data: { cpf: randomCpf() } });
  return u;
}

async function storeWithAccount(opts: { account?: boolean; quantity?: number } = {}) {
  const store = await prisma.store.create({
    data: { ownerId: await ownerIdForStore(DOMAIN), name: 'Loja 16b', isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any,
  });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Item', price: 20, quantity: opts.quantity ?? 10 } } as any);
  if (opts.account !== false) {
    await prisma.storeAsaasAccount.create({
      data: {
        storeId: store.id, apiKeyEncrypted: encryptSensitiveData(STORE_KEY), apiKeyLast4: '_16B',
        environment: 'sandbox', status: 'valid',
      },
    });
  }
  return { store, product };
}

async function staleOrder(storeId: string, productId: string, opts: { provider?: 'asaas' | 'asaas_loja'; paymentId?: string; minutesAgo?: number } = {}) {
  const cliente = await createTestUser('cliente', DOMAIN);
  const order = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId,
      items: { create: [{ productId, quantity: 2, price: 20 }] },
      totalValue: 40, deliveryFee: 0, status: 'criado', paymentMethod: 'pix',
      paymentStatus: 'pending', asaasChargeStatus: 'pending',
      asaasPaymentId: opts.paymentId ?? `pay_16b_${Math.random().toString(36).slice(2, 8)}`,
      paymentProvider: opts.provider ?? 'asaas_loja',
    } as any,
  });
  await prisma.order.update({ where: { id: order.id }, data: { createdAt: new Date(Date.now() - (opts.minutesAgo ?? 40) * 60000) } });
  return order;
}

const qty = async (productId: string) => (await prisma.product.findUnique({ where: { id: productId } }))!.quantity;

// ───────────────────────────── A ─────────────────────────────
describe('A — expiração do Pix do modo direto (chave da loja)', () => {
  it('pedido direto vencido: exclui a cobrança com a chave DA LOJA, cancela e devolve estoque; conta-mãe nunca é chamada', async () => {
    const { store, product } = await storeWithAccount();
    const order = await staleOrder(store.id, product.id, { paymentId: 'pay_16b_venc' });
    deleteAs.mockResolvedValue({ deleted: true });

    await expireStalePixOrders();

    expect(deleteAs).toHaveBeenCalledWith(STORE_KEY, '/payments/pay_16b_venc');
    expect(del).not.toHaveBeenCalled();
    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after!.status).toBe('cancelado');
    expect(after!.paymentStatus).toBe('failed');
    expect(after!.asaasChargeStatus).toBe('none');
    expect(await qty(product.id)).toBe(12); // 10 + 2 devolvidos
  });

  it('corrida: a exclusão falha porque o cliente pagou → NÃO expira e confirma o pedido pela chave da loja', async () => {
    const { store, product } = await storeWithAccount();
    const order = await staleOrder(store.id, product.id, { paymentId: 'pay_16b_pago' });
    deleteAs.mockRejectedValue(new AsaasApiError(400, [{ code: 'invalid_action', description: 'cobrança recebida' }]));
    getAs.mockResolvedValue({ status: 'RECEIVED' });

    await expireStalePixOrders();

    expect(getAs).toHaveBeenCalledWith(STORE_KEY, '/payments/pay_16b_pago');
    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after!.status).toBe('criado');
    expect(after!.paymentStatus).toBe('paid');
    expect(await qty(product.id)).toBe(10); // estoque NÃO devolvido
    expect(await prisma.payout.count({ where: { orderId: order.id } })).toBe(0);
  });

  it('exclusão falha e a cobrança segue pendente → nada muda (tenta de novo na próxima varredura)', async () => {
    const { store, product } = await storeWithAccount();
    const order = await staleOrder(store.id, product.id);
    deleteAs.mockRejectedValue(new AsaasApiError(500, []));
    getAs.mockResolvedValue({ status: 'PENDING' });

    await expireStalePixOrders();

    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after!.status).toBe('criado');
    expect(after!.paymentStatus).toBe('pending');
    expect(await qty(product.id)).toBe(10);
  });

  it('pedido direto recente não expira', async () => {
    const { store, product } = await storeWithAccount();
    const order = await staleOrder(store.id, product.id, { minutesAgo: 1 });
    await expireStalePixOrders();
    expect(deleteAs).not.toHaveBeenCalled();
    expect((await prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe('criado');
  });

  it('job sem gateway Asaas (só modo direto): expira o pedido direto e não toca o de custódia', async () => {
    (env as any).PAYMENT_GATEWAY = 'none';
    const { store, product } = await storeWithAccount();
    const direto = await staleOrder(store.id, product.id);
    const custodia = await staleOrder(store.id, product.id, { provider: 'asaas' });
    deleteAs.mockResolvedValue({ deleted: true });

    await expirePixOrdersTick();

    expect((await prisma.order.findUnique({ where: { id: direto.id } }))!.status).toBe('cancelado');
    expect((await prisma.order.findUnique({ where: { id: custodia.id } }))!.status).toBe('criado');
    expect(del).not.toHaveBeenCalled();
  });

  it('job com gateway Asaas: cada pedido cancela na conta onde a cobrança nasceu', async () => {
    (env as any).PAYMENT_GATEWAY = 'asaas';
    const { store, product } = await storeWithAccount();
    const direto = await staleOrder(store.id, product.id, { paymentId: 'pay_16b_dir' });
    const custodia = await staleOrder(store.id, product.id, { provider: 'asaas', paymentId: 'pay_16b_mae' });
    deleteAs.mockResolvedValue({ deleted: true });
    del.mockResolvedValue({ deleted: true });

    await expirePixOrdersTick();

    expect(deleteAs).toHaveBeenCalledWith(STORE_KEY, '/payments/pay_16b_dir');
    expect(deleteAs).not.toHaveBeenCalledWith(expect.anything(), '/payments/pay_16b_mae');
    expect(del).toHaveBeenCalledWith('/payments/pay_16b_mae');
    expect(del).not.toHaveBeenCalledWith('/payments/pay_16b_dir');
    expect((await prisma.order.findUnique({ where: { id: direto.id } }))!.status).toBe('cancelado');
    expect((await prisma.order.findUnique({ where: { id: custodia.id } }))!.status).toBe('cancelado');
  });

  it('provider asaas_loja.cancelCharge: DELETE com a chave da loja; pedido desconhecido → false sem chamar o Asaas', async () => {
    const { store, product } = await storeWithAccount();
    await staleOrder(store.id, product.id, { paymentId: 'pay_16b_prov' });
    deleteAs.mockResolvedValue({ deleted: true });
    const provider = getPaymentProvider('asaas_loja');
    expect(await provider.cancelCharge('pay_16b_prov')).toBe(true);
    expect(deleteAs).toHaveBeenCalledWith(STORE_KEY, '/payments/pay_16b_prov');
    deleteAs.mockClear();
    expect(await provider.cancelCharge('pay_16b_inexistente')).toBe(false);
    expect(deleteAs).not.toHaveBeenCalled();
  });
});

// ───────────────────────────── B ─────────────────────────────
describe('B — entrega de pedido direto não cria repasse de custódia', () => {
  async function entregaPicked(provider: 'asaas' | 'asaas_loja') {
    const { store } = await storeWithAccount();
    const cliente = await createTestUser('cliente', DOMAIN);
    const motoboy = await createTestUser('motoboy', DOMAIN);
    const order = await prisma.order.create({
      data: {
        customerId: cliente.userId, storeId: store.id, totalValue: 30, subtotal: 20, deliveryFee: 10,
        status: 'pago', paymentMethod: 'pix', paymentStatus: 'paid', paymentProvider: provider,
      } as any,
    });
    const delivery = await prisma.delivery.create({
      data: { orderId: order.id, status: 'picked', motoboyId: motoboy.userId, fee: 10, distance: 4, pin: '12345', pinRetirada: '54321' },
    });
    return { order, delivery, motoboy };
  }

  for (const gateway of ['asaas', 'none']) {
    it(`PAYMENT_GATEWAY=${gateway}: pedido asaas_loja entregue → 0 Payout, 0 carteira do motoboy; nota de serviço gerada`, async () => {
      (env as any).PAYMENT_GATEWAY = gateway;
      await updatePlatformConfig({ autoApprovePayouts: true } as any, 'test');
      const { order, delivery, motoboy } = await entregaPicked('asaas_loja');

      const res = await request(app).post(`/api/deliveries/${delivery.id}/finalizar`).set('Authorization', bearer(motoboy)).send({ pin: '12345' });

      expect(res.status).toBe(200);
      expect((await prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe('entregue');
      expect((await prisma.delivery.findUnique({ where: { id: delivery.id } }))!.status).toBe('delivered');
      expect(await prisma.payout.count({ where: { orderId: order.id } })).toBe(0);
      expect(await prisma.wallet.count({ where: { owner: motoboy.userId } })).toBe(0);
      expect(await prisma.walletEntry.count({ where: { wallet: { owner: motoboy.userId } } })).toBe(0);
      expect(await prisma.deliveryInvoice.count({ where: { orderId: order.id } })).toBe(1);
    });
  }

  it('pedido de custódia com gateway Asaas segue criando o Payout do motoboy', async () => {
    (env as any).PAYMENT_GATEWAY = 'asaas';
    const { order, delivery, motoboy } = await entregaPicked('asaas');
    const res = await request(app).post(`/api/deliveries/${delivery.id}/finalizar`).set('Authorization', bearer(motoboy)).send({ pin: '12345' });
    expect(res.status).toBe(200);
    expect(await prisma.payout.count({ where: { orderId: order.id, recipientType: 'motoboy' } })).toBe(1);
  });
});

// ───────────────────────────── C ─────────────────────────────
describe('C — guard CEO por rota no admin de contas Asaas', () => {
  const mini = () => {
    const a = express();
    a.use(express.json());
    a.use('/api/admin/stores', adminStoreAsaasRouter);
    return a;
  };

  it('outra rota sob /api/admin/stores não é interceptada: cai no 404 do Express (não 401/403)', async () => {
    const res = await request(mini()).get('/api/admin/stores/qualquer-outra');
    expect(res.status).toBe(404);
    const res2 = await request(mini()).post('/api/admin/stores/abc/outra-coisa').send({});
    expect(res2.status).toBe(404);
  });

  it('as rotas de conta Asaas continuam exigindo autenticação/CEO', async () => {
    expect((await request(mini()).get('/api/admin/stores/asaas')).status).toBe(401);
    expect((await request(mini()).get('/api/admin/stores/abc/asaas')).status).toBe(401);
    const cliente = await createTestUser('cliente', DOMAIN);
    expect((await request(mini()).get('/api/admin/stores/asaas').set('Authorization', bearer(cliente))).status).toBe(403);
    expect((await request(mini()).delete('/api/admin/stores/abc/asaas').set('Authorization', bearer(cliente))).status).toBe(403);
  });
});

// ───────────────────────────── D ─────────────────────────────
describe('D — corridas em connect/disconnect', () => {
  it('dois disconnect simultâneos: um ok, o outro 404 STORE_ASAAS_NOT_FOUND (nunca P2025/500)', async () => {
    const { store } = await storeWithAccount();
    const results = await Promise.allSettled([
      disconnectStoreAsaas(store.id, 'actor-a'),
      disconnectStoreAsaas(store.id, 'actor-b'),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const fail = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(fail).toHaveLength(1);
    expect(fail[0].reason).toMatchObject({ statusCode: 404, code: 'STORE_ASAAS_NOT_FOUND' });
    expect(await prisma.storeAsaasAccount.count({ where: { storeId: store.id } })).toBe(0);
    expect(await prisma.storeAsaasAudit.count({ where: { storeId: store.id, action: 'disconnect' } })).toBe(1);
  });

  it('duas primeiras conexões simultâneas: nenhuma vira 500; uma linha, um connect + um replace no audit', async () => {
    const { store } = await storeWithAccount({ account: false });
    getAs.mockResolvedValue({ balance: 0 });
    postAs.mockResolvedValue({ id: 'wh_16b' });
    for (let i = 0; i < 5; i++) {
      const results = await Promise.allSettled([
        connectStoreAsaas(store.id, STORE_KEY, 'actor-a'),
        connectStoreAsaas(store.id, STORE_KEY, 'actor-b'),
      ]);
      for (const r of results) {
        if (r.status === 'rejected') expect(r.reason).toMatchObject({ statusCode: 409, code: 'CONCURRENT_UPDATE' });
      }
      expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
      expect(await prisma.storeAsaasAccount.count({ where: { storeId: store.id } })).toBe(1);
      const audits = await prisma.storeAsaasAudit.findMany({ where: { storeId: store.id } });
      expect(audits.filter((a) => a.action === 'connect')).toHaveLength(1);
      await prisma.storeAsaasAccount.deleteMany({ where: { storeId: store.id } });
      await prisma.storeAsaasAudit.deleteMany({ where: { storeId: store.id } });
    }
  });

  it('connect: P2002 na gravação é repetido uma vez como troca (sem 500)', async () => {
    const { store } = await storeWithAccount({ account: false });
    getAs.mockResolvedValue({ balance: 0 });
    postAs.mockResolvedValue({ id: 'wh_16b' });
    const { Prisma } = jest.requireActual('@prisma/client');
    const realTx = prisma.$transaction.bind(prisma);
    let calls = 0;
    jest.spyOn(prisma, '$transaction').mockImplementation(async (fn: any, ...rest: any[]) => {
      calls++;
      if (calls === 1) {
        // Simula a outra requisição criando a linha antes desta gravar.
        await prisma.storeAsaasAccount.create({
          data: { storeId: store.id, apiKeyEncrypted: encryptSensitiveData(STORE_KEY), apiKeyLast4: '_16B', environment: 'sandbox', status: 'valid' },
        });
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
      }
      return realTx(fn, ...rest);
    });

    const st = await connectStoreAsaas(store.id, STORE_KEY, 'actor-a');

    expect(st.status).toBe('valid');
    expect(calls).toBe(2);
    const audits = await prisma.storeAsaasAudit.findMany({ where: { storeId: store.id } });
    expect(audits.map((a) => a.action)).toEqual(['replace']);
  });
});

// ───────────────────────────── E ─────────────────────────────
describe('E — cupom inválido não deixa estoque baixado', () => {
  async function couponOfOtherStore() {
    const other = await prisma.store.create({ data: { ownerId: await ownerIdForStore(DOMAIN), name: 'Outra', isOpen: true } });
    const code = `T16B${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
    couponCodes.push(code);
    await prisma.coupon.create({
      data: {
        code, type: 'store', discountType: 'fixed', discountValue: 5, storeId: other.id,
        validFrom: new Date(Date.now() - 86400000), validUntil: new Date(Date.now() + 86400000), createdBy: 'test',
      },
    });
    return code;
  }

  const body = (storeId: string, products: any[], extra: Record<string, unknown> = {}) => ({
    storeId, products, paymentMethod: 'pix', deliveryDistanceKm: 0,
    address: 'Rua X, 1 - Centro', latitude: -22.95, longitude: -43.25, ...extra,
  });

  for (const mode of ['custodia', 'direto'] as const) {
    it(`modo ${mode}: cupom de outra loja → 400 e estoque continua 10 (mesmo repetindo)`, async () => {
      await updatePlatformConfig({ settlementMode: mode } as any, 'test');
      const cliente = await buyer();
      const { store, product } = await storeWithAccount();
      const code = await couponOfOtherStore();

      for (let i = 0; i < 3; i++) {
        const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente))
          .send(body(store.id, [{ productId: product.id, quantity: 4 }], { cupomCode: code }));
        expect(res.status).toBe(400);
      }
      expect(await qty(product.id)).toBe(10);
      expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0);
    });
  }

  it('produto inexistente depois de um válido → 404 e o estoque do primeiro volta', async () => {
    await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');
    const cliente = await buyer();
    const { store, product } = await storeWithAccount();
    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente))
      .send(body(store.id, [{ productId: product.id, quantity: 3 }, { productId: '00000000-0000-0000-0000-000000000000', quantity: 1 }]));
    expect(res.status).toBe(404);
    expect(await qty(product.id)).toBe(10);
  });
});

// ───────────────────────────── G ─────────────────────────────
describe('G — falha depois da cobrança criada na conta da loja', () => {
  function mockHappyAsaas(paymentId = 'pay_16b_g') {
    postAs.mockImplementation(async (_key: string, path: string) => {
      if (path === '/customers') return { id: 'cus_16b' };
      if (path === '/payments') return { id: paymentId, status: 'PENDING' };
      throw new Error(`rota inesperada ${path}`);
    });
    getAs.mockResolvedValue({ encodedImage: 'img', payload: 'copia', expirationDate: '2026-10-09 23:59:59' });
  }
  const orderBody = (storeId: string, productId: string) => ({
    storeId, products: [{ productId, quantity: 1 }], paymentMethod: 'pix', deliveryDistanceKm: 0,
    address: 'Rua X, 1 - Centro', latitude: -22.95, longitude: -43.25,
  });

  it('transaction.create falha: 201 normal (pedido e cobrança ok) + logger.error com orderId/paymentId, sem CPF/chave', async () => {
    const cliente = await buyer();
    const cpf = (await prisma.user.findUnique({ where: { id: cliente.userId } }))!.cpf!;
    const { store, product } = await storeWithAccount();
    mockHappyAsaas('pay_16b_tx');
    jest.spyOn(prisma.transaction, 'create').mockRejectedValue(new Error('db fora'));
    const errorSpy = jest.spyOn(logger as any, 'error');

    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(orderBody(store.id, product.id));

    expect(res.status).toBe(201);
    expect(res.body.pix.paymentId).toBe('pay_16b_tx');
    const order = await prisma.order.findUnique({ where: { id: res.body.order._id } });
    expect(order!.asaasPaymentId).toBe('pay_16b_tx');
    const call = errorSpy.mock.calls.find((c) => JSON.stringify(c).includes('pay_16b_tx'));
    expect(call).toBeTruthy();
    expect(JSON.stringify(call)).toContain(order!.id);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(cpf);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(STORE_KEY);
  });

  it('order.update (asaasPaymentId) falha: logger.error específico com orderId/paymentId para reconciliação', async () => {
    const cliente = await buyer();
    const cpf = (await prisma.user.findUnique({ where: { id: cliente.userId } }))!.cpf!;
    const { store, product } = await storeWithAccount();
    mockHappyAsaas('pay_16b_upd');
    const realUpdate = prisma.order.update.bind(prisma.order);
    jest.spyOn(prisma.order, 'update').mockImplementation(((args: any) =>
      args?.data?.asaasPaymentId ? Promise.reject(new Error('db fora')) : realUpdate(args)) as any);
    const errorSpy = jest.spyOn(logger as any, 'error');

    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(orderBody(store.id, product.id));

    expect(res.status).toBe(500);
    const order = await prisma.order.findFirst({ where: { storeId: store.id } });
    const call = errorSpy.mock.calls.find((c) => JSON.stringify(c).includes('pay_16b_upd'));
    expect(call).toBeTruthy();
    expect(JSON.stringify(call)).toContain(order!.id);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(cpf);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(STORE_KEY);
  });
});
