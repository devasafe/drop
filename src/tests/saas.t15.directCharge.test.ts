/**
 * Task 1.5 — modo direto (SaaS): a cobrança Pix nasce na conta Asaas DA LOJA.
 * Asaas mockado em services/asaas/client (sem rede); rota mockada em routeService.
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

import request from 'supertest';
import app from '../app';
import asaasClient, { AsaasApiError } from '../services/asaas/client';
import { getRoute } from '../services/routeService';
import { prisma } from '../lib/prisma';
import env from '../config/env';
import logger from '../config/logger';
import { encryptSensitiveData } from '../utils/encryption';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { calculateDeliveryFeeWithConfig } from '../utils/walletCalculations';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { ownerIdForStore } from './helpers/storeOwner';
import { getPaymentProvider } from '../services/paymentProvider';
import { connectStoreAsaas } from '../services/asaasLoja/account';
import { saoPauloToday } from '../services/asaasLoja/charge';

const DOMAIN = '@saas15.test';
const STORE_KEY = '$aact_hmlg_LOJA';
const post = asaasClient.post as jest.Mock;
const postAs = asaasClient.postAs as jest.Mock;
const getAs = asaasClient.getAs as jest.Mock;

let restore: () => Promise<void>;
const ORIGINAL_GATEWAY = env.PAYMENT_GATEWAY;
const ORIGINAL_ASAAS_URL = env.ASAAS_API_URL;
const couponCodes: string[] = [];

/** CPF válido aleatório (dígitos verificadores corretos). */
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
  (env as any).PAYMENT_GATEWAY = 'none'; // o modo direto independe do PAYMENT_GATEWAY
  (env as any).ASAAS_API_URL = 'https://sandbox.asaas.com/api/v3';
});
afterAll(async () => {
  await restore();
  (env as any).PAYMENT_GATEWAY = ORIGINAL_GATEWAY;
  (env as any).ASAAS_API_URL = ORIGINAL_ASAAS_URL;
});

beforeEach(async () => {
  jest.clearAllMocks();
  postAs.mockReset();
  getAs.mockReset();
  (getRoute as jest.Mock).mockResolvedValue({ distanceKm: 3, durationSeconds: 600, polyline: 'abc', source: 'google' });
  await updatePlatformConfig({ settlementMode: 'direto', directCardEnabled: false } as any, 'test');
});

afterEach(async () => {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  await prisma.storeAsaasCustomer.deleteMany({ where: { storeId: { in: stores.map((s) => s.id) } } });
  await prisma.storeAsaasAudit.deleteMany({ where: { storeId: { in: stores.map((s) => s.id) } } });
  if (couponCodes.length) await prisma.coupon.deleteMany({ where: { code: { in: couponCodes.splice(0) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function buyer(opts: { cpf?: string | null } = {}): Promise<TestUser> {
  const u = await createTestUser('cliente', DOMAIN);
  const cpf = opts.cpf === undefined ? randomCpf() : opts.cpf;
  await prisma.user.update({ where: { id: u.userId }, data: { cpf } });
  return u;
}

async function storeWithAccount(opts: {
  deliveryMode?: 'propria' | 'pool_drop';
  account?: 'valid' | 'invalid' | 'none';
  price?: number;
} = {}) {
  const store = await prisma.store.create({
    data: {
      ownerId: await ownerIdForStore(DOMAIN), name: 'Loja Direta', isOpen: true,
      latitude: '-22.90', longitude: '-43.20', deliveryMode: opts.deliveryMode ?? 'pool_drop',
    } as any,
  });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Item', price: opts.price ?? 20, quantity: 10 } } as any);
  const account = opts.account ?? 'valid';
  if (account !== 'none') {
    await prisma.storeAsaasAccount.create({
      data: {
        storeId: store.id, apiKeyEncrypted: encryptSensitiveData(STORE_KEY), apiKeyLast4: 'LOJA',
        environment: 'sandbox', status: account,
      },
    });
  }
  return { store, product };
}

function orderBody(storeId: string, productId: string, extra: Record<string, unknown> = {}) {
  return {
    storeId, products: [{ productId, quantity: 1 }], paymentMethod: 'pix',
    deliveryDistanceKm: 0, address: 'Rua X, 1 - Centro', latitude: -22.95, longitude: -43.25,
    ...extra,
  };
}

function mockHappyAsaas(customerId = 'cus_1', paymentId = 'pay_1') {
  postAs.mockImplementation(async (_key: string, path: string) => {
    if (path === '/customers') return { id: customerId };
    if (path === '/payments') return { id: paymentId, status: 'PENDING' };
    throw new Error(`rota inesperada ${path}`);
  });
  getAs.mockResolvedValue({ encodedImage: 'img', payload: 'copia', expirationDate: '2026-10-09 23:59:59' });
}

const paymentCalls = () => postAs.mock.calls.filter((c) => c[1] === '/payments');
const customerCalls = () => postAs.mock.calls.filter((c) => c[1] === '/customers');

describe('t1.5 — cobrança Pix na conta Asaas da loja (modo direto)', () => {
  it('cobrança criada com a chave da LOJA, nunca com a da conta-mãe', async () => {
    const cliente = await buyer();
    const { store, product } = await storeWithAccount();
    mockHappyAsaas();

    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(orderBody(store.id, product.id));

    expect(res.status).toBe(201);
    expect(post).not.toHaveBeenCalled();
    expect(asaasClient.get).not.toHaveBeenCalled();
    const [custKey, , custBody] = customerCalls()[0];
    expect(custKey).toBe(STORE_KEY);
    expect(custBody).toMatchObject({ cpfCnpj: expect.stringMatching(/^\d{11}$/), externalReference: cliente.userId });
    const [key, path, body] = paymentCalls()[0];
    expect(key).toBe(STORE_KEY);
    expect(path).toBe('/payments');
    expect(body).toMatchObject({ customer: 'cus_1', billingType: 'PIX', externalReference: res.body.order._id, dueDate: saoPauloToday() });
    expect(body.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(getAs).toHaveBeenCalledWith(STORE_KEY, '/payments/pay_1/pixQrCode', expect.any(Number));

    // Mesmo formato do PIX de hoje (PixPaymentSheet sem mudança)
    expect(res.body.pix).toMatchObject({ paymentId: 'pay_1', qrCodePayload: 'copia', qrCodeImage: 'img' });
    expect(res.body.order.asaasPaymentId).toBe('pay_1');

    const order = await prisma.order.findFirst({ where: { asaasPaymentId: 'pay_1', storeId: store.id } });
    expect(order!.paymentProvider).toBe('asaas_loja');
    expect(order!.asaasChargeStatus).toBe('pending');
    expect(order!.walletDistribution).toEqual({ storeAmount: Number(order!.totalValue), appCommission: 0, commissionPercent: 0 });
    expect(await prisma.payout.count({ where: { orderId: order!.id } })).toBe(0);
    expect(await prisma.appCashboxEntry.count({ where: { orderId: order!.id } })).toBe(0);
  });

  it('valor da cobrança = recalculado no servidor (subtotal do banco + taxa da rota − cupom da loja)', async () => {
    const cliente = await buyer();
    const { store, product } = await storeWithAccount({ price: 20 });
    const code = `T15L${Date.now().toString().slice(-6)}`;
    couponCodes.push(code);
    await prisma.coupon.create({
      data: {
        code, type: 'store', discountType: 'percent', discountValue: 10, storeId: store.id,
        validFrom: new Date(Date.now() - 86400000), validUntil: new Date(Date.now() + 86400000), createdBy: 'test',
      },
    });
    mockHappyAsaas();

    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente))
      .send(orderBody(store.id, product.id, { products: [{ productId: product.id, quantity: 2, price: 0.01 }], deliveryDistanceKm: 0, cupomCode: code }));

    expect(res.status).toBe(201);
    const fee = await calculateDeliveryFeeWithConfig(3);
    expect(fee).toBeGreaterThan(0);
    const expected = Number((40 + fee - 4).toFixed(2));
    expect(paymentCalls()[0][2].value).toBe(expected);
    const order = await prisma.order.findUnique({ where: { id: res.body.order._id } });
    expect(Number(order!.totalValue)).toBe(expected);
    expect(Number(order!.deliveryFee)).toBe(fee);
    // Loja sem StoreSubscription = Plano 1 no modo custódia (taxa 0); no direto o plano é ignorado.
    expect(await prisma.storeSubscription.count({ where: { storeId: store.id } })).toBe(0);
    // cupom da loja NÃO lança nada no caixa do app
    expect(await prisma.appCashboxEntry.count({ where: { orderId: order!.id } })).toBe(0);
    expect((await prisma.coupon.findUnique({ where: { code } }))!.usedCount).toBe(1);
  });

  it("deliveryMode 'propria' → taxa 0 mesmo com rota", async () => {
    const cliente = await buyer();
    const { store, product } = await storeWithAccount({ deliveryMode: 'propria', price: 20 });
    mockHappyAsaas();

    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(orderBody(store.id, product.id));

    expect(res.status).toBe(201);
    expect(paymentCalls()[0][2].value).toBe(20);
    const order = await prisma.order.findUnique({ where: { id: res.body.order._id } });
    expect(Number(order!.deliveryFee)).toBe(0);
  });

  it.each(['none', 'invalid'] as const)('loja com conta Asaas %s → 409 STORE_PAYMENTS_NOT_READY e nenhum pedido criado', async (account) => {
    const cliente = await buyer();
    const { store, product } = await storeWithAccount({ account });

    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(orderBody(store.id, product.id));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STORE_PAYMENTS_NOT_READY');
    expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0);
    expect((await prisma.product.findUnique({ where: { id: product.id } }))!.quantity).toBe(10);
    expect(postAs).not.toHaveBeenCalled();
  });

  it('cliente compra em duas lojas → um customer por conta; 2ª compra na mesma loja reaproveita', async () => {
    const cliente = await buyer();
    const a = await storeWithAccount();
    const b = await storeWithAccount();
    mockHappyAsaas('cus_A', 'pay_A1');
    expect((await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(orderBody(a.store.id, a.product.id))).status).toBe(201);
    mockHappyAsaas('cus_B', 'pay_B1');
    expect((await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(orderBody(b.store.id, b.product.id))).status).toBe(201);
    mockHappyAsaas('cus_NAO_USAR', 'pay_A2');
    expect((await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(orderBody(a.store.id, a.product.id))).status).toBe(201);

    const rows = await prisma.storeAsaasCustomer.findMany({ where: { userId: cliente.userId }, orderBy: { customerId: 'asc' } });
    expect(rows.map((r) => [r.storeId, r.customerId])).toEqual([[a.store.id, 'cus_A'], [b.store.id, 'cus_B']]);
    expect(customerCalls()).toHaveLength(2);
    expect(paymentCalls()[2][2].customer).toBe('cus_A');
  });

  it('corrida: ensureStoreCustomer simultâneo não duplica a linha no banco', async () => {
    const cliente = await buyer();
    const { store } = await storeWithAccount();
    postAs.mockResolvedValueOnce({ id: 'cus_X' }).mockResolvedValueOnce({ id: 'cus_Y' });
    const { ensureStoreCustomer } = await import('../services/asaasLoja/charge');
    const [x, y] = await Promise.all([ensureStoreCustomer(store.id, cliente.userId), ensureStoreCustomer(store.id, cliente.userId)]);
    expect(x).toBe(y);
    expect(await prisma.storeAsaasCustomer.count({ where: { storeId: store.id, userId: cliente.userId } })).toBe(1);
  });

  it.each(['/customers', '/payments'])('chave revogada (401 em %s) → loja vira invalid, pedido compensado, 409', async (failPath) => {
    const cliente = await buyer();
    const { store, product } = await storeWithAccount();
    const warn = jest.spyOn(logger as any, 'warn');
    const error = jest.spyOn(logger as any, 'error');
    postAs.mockImplementation(async (_k: string, path: string) => {
      if (path === failPath) throw new AsaasApiError(401, [{ code: 'invalid_access_token', description: 'A chave de API fornecida é inválida' }]);
      if (path === '/customers') return { id: 'cus_1' };
      return { id: 'pay_1', status: 'PENDING' };
    });

    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(orderBody(store.id, product.id));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STORE_PAYMENTS_NOT_READY');
    const acc = await prisma.storeAsaasAccount.findUnique({ where: { storeId: store.id } });
    expect(acc!.status).toBe('invalid');
    expect(acc!.lastError).toBeTruthy();
    expect(acc!.lastError).not.toContain('aact');
    expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0);
    expect((await prisma.product.findUnique({ where: { id: product.id } }))!.quantity).toBe(10);
    expect(JSON.stringify([...warn.mock.calls, ...error.mock.calls])).not.toContain(STORE_KEY);
    warn.mockRestore();
    error.mockRestore();
  });

  it('outro erro do Asaas (500) → pedido compensado, 502, conta continua valid', async () => {
    const cliente = await buyer();
    const { store, product } = await storeWithAccount();
    postAs.mockImplementation(async (_k: string, path: string) => {
      if (path === '/customers') return { id: 'cus_1' };
      throw new AsaasApiError(500, [{ code: 'x', description: 'falha interna' }]);
    });

    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(orderBody(store.id, product.id));

    expect(res.status).toBe(502);
    expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0);
    expect((await prisma.product.findUnique({ where: { id: product.id } }))!.quantity).toBe(10);
    expect((await prisma.storeAsaasAccount.findUnique({ where: { storeId: store.id } }))!.status).toBe('valid');
  });

  const CARD = {
    card: { holderName: 'Fulano', number: '4111111111111111', expiryMonth: '12', expiryYear: '2030', ccv: '123' },
    cardHolder: { name: 'Fulano', email: 'f@x.com', cpfCnpj: '39053344705', postalCode: '20000000', addressNumber: '1', phone: '21999999999' },
  };

  it('credit_card com directCardEnabled=false → 400 METHOD_NOT_ALLOWED, nada criado', async () => {
    const cliente = await buyer();
    const { store, product } = await storeWithAccount();
    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente))
      .send(orderBody(store.id, product.id, { paymentMethod: 'credit_card', ...CARD }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('METHOD_NOT_ALLOWED');
    expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0);
    expect((await prisma.product.findUnique({ where: { id: product.id } }))!.quantity).toBe(10);
  });

  it('credit_card com directCardEnabled=true → 501 NOT_IMPLEMENTED (por enquanto)', async () => {
    await updatePlatformConfig({ directCardEnabled: true } as any, 'test');
    const cliente = await buyer();
    const { store, product } = await storeWithAccount();
    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente))
      .send(orderBody(store.id, product.id, { paymentMethod: 'credit_card', ...CARD }));
    expect(res.status).toBe(501);
    expect(res.body.code).toBe('NOT_IMPLEMENTED');
    expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0);
  });

  it("método 'money' → 400 METHOD_NOT_ALLOWED", async () => {
    const cliente = await buyer();
    const { store, product } = await storeWithAccount();
    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente))
      .send(orderBody(store.id, product.id, { paymentMethod: 'money' }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('METHOD_NOT_ALLOWED');
  });

  it('useWalletBalance → ignorado: walletApplied 0, nada debitado, cobra o total', async () => {
    const cliente = await buyer();
    await prisma.wallet.create({ data: { owner: cliente.userId, ownerType: 'user', balance: 50 } as any });
    const { store, product } = await storeWithAccount({ deliveryMode: 'propria', price: 20 });
    mockHappyAsaas();

    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente))
      .send(orderBody(store.id, product.id, { useWalletBalance: true }));

    expect(res.status).toBe(201);
    expect(paymentCalls()[0][2].value).toBe(20);
    const order = await prisma.order.findUnique({ where: { id: res.body.order._id } });
    expect(Number(order!.walletApplied)).toBe(0);
    const w = await prisma.wallet.findFirst({ where: { owner: cliente.userId, ownerType: 'user' } });
    expect(Number(w!.balance)).toBe(50);
    expect(await prisma.walletEntry.count({ where: { walletId: w!.id } })).toBe(0);
  });

  it('cupom global → 400 COUPON_NOT_ALLOWED, nada criado', async () => {
    const cliente = await buyer();
    const { store, product } = await storeWithAccount();
    const code = `T15G${Date.now().toString().slice(-6)}`;
    couponCodes.push(code);
    await prisma.coupon.create({
      data: {
        code, type: 'global', discountType: 'fixed', discountValue: 5,
        validFrom: new Date(Date.now() - 86400000), validUntil: new Date(Date.now() + 86400000), createdBy: 'test',
      },
    });
    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente))
      .send(orderBody(store.id, product.id, { cupomCode: code }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('COUPON_NOT_ALLOWED');
    expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0);
    expect((await prisma.product.findUnique({ where: { id: product.id } }))!.quantity).toBe(10);
  });

  describe('CPF do comprador', () => {
    it('sem CPF no usuário nem no body → 400 CPF_REQUIRED antes de criar qualquer coisa', async () => {
      const cliente = await buyer({ cpf: null });
      const { store, product } = await storeWithAccount();
      const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(orderBody(store.id, product.id));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CPF_REQUIRED');
      expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0);
      expect((await prisma.product.findUnique({ where: { id: product.id } }))!.quantity).toBe(10);
      expect(postAs).not.toHaveBeenCalled();
    });

    it('CPF inválido no body → 400 CPF_REQUIRED e nada gravado', async () => {
      const cliente = await buyer({ cpf: null });
      const { store, product } = await storeWithAccount();
      const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente))
        .send(orderBody(store.id, product.id, { cpf: '12345678900' }));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CPF_REQUIRED');
      expect((await prisma.user.findUnique({ where: { id: cliente.userId } }))!.cpf).toBeNull();
    });

    it('CPF válido no body (com máscara) → grava em User.cpf e usa na criação do customer', async () => {
      const cliente = await buyer({ cpf: null });
      const { store, product } = await storeWithAccount();
      mockHappyAsaas();
      const cpf = randomCpf();
      const masked = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
      const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente))
        .send(orderBody(store.id, product.id, { cpf: masked }));
      expect(res.status).toBe(201);
      expect((await prisma.user.findUnique({ where: { id: cliente.userId } }))!.cpf).toBe(cpf);
      expect(customerCalls()[0][2].cpfCnpj).toBe(cpf);
    });
  });

  it('modo custódia continua no caminho antigo (nenhuma chamada com chave de loja)', async () => {
    await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');
    const cliente = await buyer();
    const { store, product } = await storeWithAccount();
    await prisma.wallet.create({ data: { owner: cliente.userId, ownerType: 'user', balance: 500 } as any });
    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(orderBody(store.id, product.id));
    expect(res.status).toBe(201);
    expect(postAs).not.toHaveBeenCalled();
    const order = await prisma.order.findFirst({ where: { storeId: store.id } });
    expect(order!.paymentProvider).not.toBe('asaas_loja');
  });
});

describe('t1.5 — provider asaas_loja', () => {
  it('createCharge exige storeId', async () => {
    const p = getPaymentProvider('asaas_loja');
    expect(p.name).toBe('asaas_loja');
    await expect(p.createCharge({ orderId: 'o', buyerUserId: 'u', value: 10, method: 'pix' })).rejects.toThrow(/storeId/);
  });

  it('getPaymentStatus consulta com a chave da loja do pedido', async () => {
    const cliente = await buyer();
    const { store, product } = await storeWithAccount();
    mockHappyAsaas('cus_1', 'pay_status_1');
    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(orderBody(store.id, product.id));
    expect(res.status).toBe(201);
    getAs.mockReset();
    getAs.mockResolvedValueOnce({ status: 'RECEIVED' });
    const status = await getPaymentProvider('asaas_loja').getPaymentStatus('pay_status_1');
    expect(status).toBe('paid');
    expect(getAs).toHaveBeenCalledWith(STORE_KEY, '/payments/pay_status_1');
  });

  it('trocar a conta Asaas da loja limpa o cache de customers (customers pertencem à conta antiga)', async () => {
    const cliente = await buyer();
    const { store } = await storeWithAccount();
    await prisma.storeAsaasCustomer.create({ data: { storeId: store.id, userId: cliente.userId, customerId: 'cus_velho' } });
    getAs.mockResolvedValueOnce({ balance: 0 });
    await connectStoreAsaas(store.id, '$aact_hmlg_NOVACHAVE1234', 'actor-t15');
    expect(await prisma.storeAsaasCustomer.count({ where: { storeId: store.id } })).toBe(0);
  });
});
