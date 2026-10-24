/**
 * Task 3 (DS v2) — cotação exposta em endpoints e área de entrega imposta no pedido.
 *  - POST /orders/quote: DeliveryQuote + campos antigos; fora da área = 200 com inArea:false.
 *  - POST /stores/quotes: lote público por estimativa, respeitando KYC e mensalidade.
 *  - createOrder: fora do raio efetivo (LINHA RETA) = 409 OUT_OF_AREA antes de baixar estoque; a rota só dá taxa/prazo.
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
import asaasClient from '../services/asaas/client';
import { getRoute } from '../services/routeService';
import { prisma } from '../lib/prisma';
import env from '../config/env';
import { encryptSensitiveData } from '../utils/encryption';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { calculateDeliveryFeeWithConfig } from '../utils/walletCalculations';
import walletService from '../services/wallet.prisma.service';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { ownerIdForStore } from './helpers/storeOwner';
import { grantStoreConsent, paymentsReadyStoreData } from './helpers/storeConsent';

const DOMAIN = '@dq3.test';
const STORE_KEY = '$aact_hmlg_LOJA_DQ3';
const postAs = asaasClient.postAs as jest.Mock;
const getAs = asaasClient.getAs as jest.Mock;
const routeMock = getRoute as jest.Mock;

// Loja no Rio; ~1 grau de latitude = 111,19 km.
const STORE_LAT = -22.9;
const STORE_LNG = -43.2;
const north = (km: number) => ({ latitude: STORE_LAT + km / 111.19, longitude: STORE_LNG });

let restore: () => Promise<void>;
const ORIGINAL_GATEWAY = env.PAYMENT_GATEWAY;
const ORIGINAL_ASAAS_URL = env.ASAAS_API_URL;
const ORIGINAL_KYC = process.env.KYC_ENFORCED;

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

function route(km: number, source = 'routes') {
  return { distanceKm: km, distanceMeters: km * 1000, durationSeconds: 600, polyline: 'poly', source };
}

beforeAll(async () => {
  restore = await snapshotPlatformConfig();
  (env as any).PAYMENT_GATEWAY = 'none';
  (env as any).ASAAS_API_URL = 'https://sandbox.asaas.com/api/v3';
});
afterAll(async () => {
  await restore();
  (env as any).PAYMENT_GATEWAY = ORIGINAL_GATEWAY;
  (env as any).ASAAS_API_URL = ORIGINAL_ASAAS_URL;
  if (ORIGINAL_KYC === undefined) delete process.env.KYC_ENFORCED;
  else process.env.KYC_ENFORCED = ORIGINAL_KYC;
});

beforeEach(async () => {
  jest.clearAllMocks();
  postAs.mockReset();
  getAs.mockReset();
  routeMock.mockReset();
  routeMock.mockResolvedValue(route(3));
  delete process.env.KYC_ENFORCED;
  await updatePlatformConfig({
    settlementMode: 'direto', directCardEnabled: false,
    defaultDeliveryRadiusKm: 12, defaultPrepMinutes: 15, courierAvgSpeedKmh: 25, routeDetourFactor: 1.3,
  } as any, 'test');
});

afterEach(async () => {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  const storeIds = stores.map((s) => s.id);
  await prisma.storeAsaasCustomer.deleteMany({ where: { storeId: { in: storeIds } } });
  await prisma.storeAsaasAudit.deleteMany({ where: { storeId: { in: storeIds } } });
  await prisma.storeSubscription.deleteMany({ where: { storeId: { in: storeIds } } }).catch(() => undefined);
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function buyer(): Promise<TestUser> {
  const u = await createTestUser('cliente', DOMAIN);
  await prisma.user.update({ where: { id: u.userId }, data: { cpf: randomCpf() } });
  return u;
}

/** `ready`: conta (fictícia) + aceite, que a vitrine do modo direto exige; storeWithAccount cria a real. */
async function makeStore(data: Record<string, unknown> = {}, ready = true) {
  return prisma.store.create({
    data: {
      ownerId: await ownerIdForStore(DOMAIN), name: 'Loja DQ3', isOpen: true,
      latitude: String(STORE_LAT), longitude: String(STORE_LNG), ...(ready ? paymentsReadyStoreData() : {}), ...data,
    } as any,
  });
}

async function storeWithAccount(data: Record<string, unknown> = {}) {
  const store = await makeStore(data, false);
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Item', price: 20, quantity: 10 } } as any);
  await prisma.storeAsaasAccount.create({
    data: {
      storeId: store.id, apiKeyEncrypted: encryptSensitiveData(STORE_KEY), apiKeyLast4: 'DQ3X',
      environment: 'sandbox', status: 'valid',
    },
  });
  await grantStoreConsent(store.id);
  return { store, product };
}

function mockHappyAsaas() {
  postAs.mockImplementation(async (_key: string, path: string) => {
    if (path === '/customers') return { id: 'cus_dq3' };
    if (path === '/payments') return { id: 'pay_dq3', status: 'PENDING' };
    throw new Error(`rota inesperada ${path}`);
  });
  getAs.mockResolvedValue({ encodedImage: 'img', payload: 'copia', expirationDate: '2026-10-09 23:59:59' });
}

const qty = async (productId: string) => (await prisma.product.findUnique({ where: { id: productId } }))!.quantity;

// ───────────────────────────── /orders/quote ─────────────────────────────
describe('POST /orders/quote', () => {
  it('dentro da área: DeliveryQuote + campos antigos, taxa = a do pedido', async () => {
    const cliente = await buyer();
    const store = await makeStore();
    routeMock.mockResolvedValue(route(9));
    const res = await request(app).post('/api/orders/quote').set('Authorization', bearer(cliente))
      .send({ storeId: store.id, ...north(7) });
    expect(res.status).toBe(200);
    const fee = await calculateDeliveryFeeWithConfig(9);
    expect(res.body).toMatchObject({
      storeId: store.id, inArea: true, fee, freeDelivery: false, open: true, source: 'route',
      // campos antigos (checkout atual)
      plan: null, deliveryFee: fee, distanceKm: 9, distanceMeters: 9000, durationSeconds: 600, polyline: 'poly',
      routeSource: 'routes',
    });
    // 15 min de preparo + 10 min de rota = 25
    expect(res.body.etaMinutes).toEqual([25, 35]);
  });

  it('fora da área (linha reta): 200 com inArea:false, sem taxa e sem rotear', async () => {
    const cliente = await buyer();
    const store = await makeStore();
    const res = await request(app).post('/api/orders/quote').set('Authorization', bearer(cliente))
      .send({ storeId: store.id, ...north(20) });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ inArea: false, reason: 'OUT_OF_AREA', fee: null, deliveryFee: null, distanceKm: null });
    for (const k of ['plan', 'deliveryFee', 'distanceKm', 'distanceMeters', 'durationSeconds', 'polyline', 'source']) {
      expect(res.body).toHaveProperty(k);
    }
    expect(routeMock).not.toHaveBeenCalled();
  });

  it('borda: reta dentro do raio e rota acima dele → dentro da área (o raio é linha reta); taxa pela rota', async () => {
    const cliente = await buyer();
    const store = await makeStore();
    routeMock.mockResolvedValue(route(14));
    const res = await request(app).post('/api/orders/quote').set('Authorization', bearer(cliente))
      .send({ storeId: store.id, ...north(9) });
    expect(res.status).toBe(200);
    const fee = await calculateDeliveryFeeWithConfig(14);
    expect(res.body).toMatchObject({ inArea: true, fee, deliveryFee: fee, distanceKm: 14, source: 'route' });
    expect(res.body.reason).toBeUndefined();
  });

  it('loja inexistente continua 404', async () => {
    const cliente = await buyer();
    const res = await request(app).post('/api/orders/quote').set('Authorization', bearer(cliente))
      .send({ storeId: 'nao-existe', ...north(3) });
    expect(res.status).toBe(404);
  });
});

// ───────────────────────────── /stores/quotes ─────────────────────────────
describe('POST /stores/quotes', () => {
  it('lote público: dentro, fora, sem coordenadas; pausada pela mensalidade (modo direto) não aparece', async () => {
    const dentro = await makeStore();
    const fora = await makeStore({ latitude: String(STORE_LAT + 1), longitude: String(STORE_LNG) });
    const semCoord = await makeStore({ latitude: null, longitude: null });
    const pausada = await makeStore();
    await prisma.storeSaasBilling.create({
      data: { storeId: pausada.id, status: 'paused', trialEndsAt: new Date(Date.now() - 86400000), pausedAt: new Date() },
    });

    const res = await request(app).post('/api/stores/quotes')
      .send({ ...north(5), storeIds: [dentro.id, fora.id, semCoord.id, pausada.id] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const byId: Record<string, any> = Object.fromEntries(res.body.data.map((q: any) => [q.storeId, q]));
    expect(Object.keys(byId).sort()).toEqual([dentro.id, fora.id, semCoord.id].sort());
    expect(byId[dentro.id]).toMatchObject({ inArea: true, source: 'estimate', freeDelivery: false });
    expect(byId[dentro.id].fee).toBeGreaterThan(0);
    expect(byId[fora.id]).toMatchObject({ inArea: false, reason: 'OUT_OF_AREA', fee: null });
    expect(byId[semCoord.id]).toMatchObject({ inArea: false, reason: 'STORE_NO_LOCATION', fee: null });
    expect(routeMock).not.toHaveBeenCalled();
  });

  it('custódia: Plano 1 (inclusive sem assinatura) sai com taxa 0; Plano 2 cobra', async () => {
    await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');
    const semSub = await makeStore();
    const p1 = await makeStore();
    const p2 = await makeStore();
    await prisma.storeSubscription.create({ data: { storeId: p1.id, storeName: 'p1', currentPlan: 'plan1' } as any });
    await prisma.storeSubscription.create({ data: { storeId: p2.id, storeName: 'p2', currentPlan: 'plan2' } as any });

    const res = await request(app).post('/api/stores/quotes')
      .send({ ...north(5), storeIds: [semSub.id, p1.id, p2.id] });

    expect(res.status).toBe(200);
    const byId: Record<string, any> = Object.fromEntries(res.body.data.map((q: any) => [q.storeId, q]));
    expect(byId[semSub.id]).toMatchObject({ fee: 0, freeDelivery: true });
    expect(byId[p1.id]).toMatchObject({ fee: 0, freeDelivery: true });
    expect(byId[p2.id].fee).toBeGreaterThan(0);
    expect(byId[p2.id].freeDelivery).toBe(false);
  });

  it('modo direto ignora o plano: Plano 1 cobra a fórmula', async () => {
    const p1 = await makeStore();
    await prisma.storeSubscription.create({ data: { storeId: p1.id, storeName: 'p1', currentPlan: 'plan1' } as any });
    const res = await request(app).post('/api/stores/quotes').send({ ...north(5), storeIds: [p1.id] });
    expect(res.status).toBe(200);
    expect(res.body.data[0].fee).toBeGreaterThan(0);
  });

  it('KYC_ENFORCED: loja não verificada não aparece', async () => {
    process.env.KYC_ENFORCED = 'true';
    const ok = await makeStore({ isVerified: true });
    const pendente = await makeStore({ isVerified: false });
    const res = await request(app).post('/api/stores/quotes').send({ ...north(5), storeIds: [ok.id, pendente.id] });
    expect(res.status).toBe(200);
    expect(res.body.data.map((q: any) => q.storeId)).toEqual([ok.id]);
  });

  it('loja inexistente é só ausente, não erro', async () => {
    const res = await request(app).post('/api/stores/quotes').send({ ...north(5), storeIds: ['nao-existe'] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [] });
  });

  it('acima de 50 lojas, lista vazia, ids repetidos ou ponto inválido → 400', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `s${i}`);
    expect((await request(app).post('/api/stores/quotes').send({ ...north(5), storeIds: ids })).status).toBe(400);
    expect((await request(app).post('/api/stores/quotes').send({ ...north(5), storeIds: [] })).status).toBe(400);
    expect((await request(app).post('/api/stores/quotes').send({ ...north(5), storeIds: ['a', 'a'] })).status).toBe(400);
    expect((await request(app).post('/api/stores/quotes').send({ latitude: 'x', longitude: 1, storeIds: ['a'] })).status).toBe(400);
    expect((await request(app).post('/api/stores/quotes').send({ latitude: 91, longitude: 1, storeIds: ['a'] })).status).toBe(400);
  });
});

// ───────────────────────────── createOrder ─────────────────────────────
describe('createOrder — área de entrega', () => {
  function orderBody(storeId: string, productId: string, extra: Record<string, unknown> = {}) {
    return {
      storeId, products: [{ productId, quantity: 2 }], paymentMethod: 'pix',
      deliveryDistanceKm: 0, address: 'Rua X, 1 - Centro', ...north(7), ...extra,
    };
  }

  it('linha reta além do raio padrão → 409 OUT_OF_AREA, sem rotear, baixar estoque nem cobrar', async () => {
    const cliente = await buyer();
    const { store, product } = await storeWithAccount();
    mockHappyAsaas();

    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente))
      .send(orderBody(store.id, product.id, north(12.5)));

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'Esta loja não entrega nesse endereço.', code: 'OUT_OF_AREA' });
    expect(await qty(product.id)).toBe(10);
    expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0);
    expect(routeMock).not.toHaveBeenCalled();
    expect(postAs).not.toHaveBeenCalled();
  });

  it('borda: reta dentro do raio e rota acima dele → pedido aceito, taxa pelo km da rota', async () => {
    const cliente = await buyer();
    const { store, product } = await storeWithAccount();
    mockHappyAsaas();
    routeMock.mockResolvedValue(route(14));

    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente))
      .send(orderBody(store.id, product.id, north(9)));

    expect(res.status).toBe(201);
    const fee = await calculateDeliveryFeeWithConfig(14);
    const order = await prisma.order.findUnique({ where: { id: res.body.order._id } });
    expect(Number(order!.deliveryFee)).toBe(fee);
    expect(await qty(product.id)).toBe(8);
  });

  it('raio menor da loja vale: reta de 7 km com raio de 5 km → 409', async () => {
    const cliente = await buyer();
    const { store, product } = await storeWithAccount({ deliveryRadiusKm: 5 });
    mockHappyAsaas();
    routeMock.mockResolvedValue(route(7));
    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(orderBody(store.id, product.id));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('OUT_OF_AREA');
    expect(await qty(product.id)).toBe(10);
  });

  it('loja com localização e pedido sem coordenadas → 400 NO_ADDRESS, sem baixar estoque', async () => {
    const cliente = await buyer();
    const { store, product } = await storeWithAccount();
    mockHappyAsaas();
    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente))
      .send(orderBody(store.id, product.id, { latitude: undefined, longitude: undefined }));
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Informe o endereço de entrega.', code: 'NO_ADDRESS' });
    expect(await qty(product.id)).toBe(10);
    expect(routeMock).not.toHaveBeenCalled();
    expect(postAs).not.toHaveBeenCalled();
  });

  it('dentro da área segue igual: 201, taxa pela rota, estoque baixado', async () => {
    const cliente = await buyer();
    const { store, product } = await storeWithAccount();
    mockHappyAsaas();
    routeMock.mockResolvedValue(route(12)); // borda: no raio entra

    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(orderBody(store.id, product.id));

    expect(res.status).toBe(201);
    const fee = await calculateDeliveryFeeWithConfig(12);
    const order = await prisma.order.findUnique({ where: { id: res.body.order._id } });
    expect(Number(order!.deliveryFee)).toBe(fee);
    expect(Number(order!.totalValue)).toBe(Number((40 + fee).toFixed(2)));
    expect(await qty(product.id)).toBe(8);
  });
});

// ─────────────── createOrder — custódia (lote final F1) ───────────────
describe('createOrder — custódia: Plano 1 sem entrega integrada', () => {
  async function custodyStore(plan: 'plan1' | 'plan2' | null, data: Record<string, unknown> = {}) {
    const store = await makeStore(data);
    const product = await prisma.product.create({ data: { storeId: store.id, name: 'Item', price: 20, quantity: 10 } } as any);
    if (plan) await prisma.storeSubscription.create({ data: { storeId: store.id, storeName: 'sub', currentPlan: plan } as any });
    return { store, product };
  }
  async function fundedBuyer() {
    const cliente = await buyer();
    await walletService.credit({ owner: cliente.userId, ownerType: 'user', amount: 500, reason: 'teste F1', category: 'transfer' } as any);
    return cliente;
  }
  // Payload do /checkout-vitrine: coordenadas fixas em 0.
  const vitrineBody = (storeId: string, productId: string, extra: Record<string, unknown> = {}) => ({
    storeId, products: [{ productId, quantity: 2 }], paymentMethod: 'pix', deliveryDistanceKm: 0,
    address: 'Rua X, 1 - Centro', latitude: 0, longitude: 0, ...extra,
  });

  beforeEach(async () => {
    await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');
  });

  it('Plano 1 com lat/lng 0 (payload do vitrine) → pedido criado, taxa 0, sem rotear', async () => {
    const cliente = await fundedBuyer();
    const { store, product } = await custodyStore('plan1');
    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(vitrineBody(store.id, product.id));
    expect(res.status).toBe(201);
    const order = await prisma.order.findFirst({ where: { storeId: store.id } });
    expect(order).not.toBeNull();
    expect(Number(order!.deliveryFee)).toBe(0);
    expect(await qty(product.id)).toBe(8);
    expect(routeMock).not.toHaveBeenCalled();
  });

  it('Plano 1 sem assinatura e fora do raio → pedido criado (sem checagem de área)', async () => {
    const cliente = await fundedBuyer();
    const { store, product } = await custodyStore(null);
    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente))
      .send(vitrineBody(store.id, product.id, north(30)));
    expect(res.status).toBe(201);
    const order = await prisma.order.findFirst({ where: { storeId: store.id } });
    expect(Number(order!.deliveryFee)).toBe(0);
  });

  it('Plano 2 sem coordenadas → 400 NO_ADDRESS, sem baixar estoque', async () => {
    const cliente = await fundedBuyer();
    const { store, product } = await custodyStore('plan2');
    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(vitrineBody(store.id, product.id));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_ADDRESS');
    expect(await qty(product.id)).toBe(10);
  });

  it('Plano 2 fora da área → 409 OUT_OF_AREA, sem baixar estoque', async () => {
    const cliente = await fundedBuyer();
    const { store, product } = await custodyStore('plan2');
    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente))
      .send(vitrineBody(store.id, product.id, north(12.5)));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('OUT_OF_AREA');
    expect(await qty(product.id)).toBe(10);
    expect(routeMock).not.toHaveBeenCalled();
  });
});

// ─────────────── createOrder — loja sem localização (lote final F4) ───────────────
describe('createOrder — loja sem localização', () => {
  const body = (storeId: string, productId: string) => ({
    storeId, products: [{ productId, quantity: 2 }], paymentMethod: 'pix', deliveryDistanceKm: 0,
    address: 'Rua X, 1 - Centro', ...north(3),
  });

  it('modo direto: 409 STORE_NO_LOCATION antes do estoque e da cobrança', async () => {
    const cliente = await buyer();
    const { store, product } = await storeWithAccount({ latitude: null, longitude: null });
    mockHappyAsaas();
    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(body(store.id, product.id));
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'Esta loja ainda não configurou a localização.', code: 'STORE_NO_LOCATION' });
    expect(await qty(product.id)).toBe(10);
    expect(postAs).not.toHaveBeenCalled();
  });

  it('custódia Plano 2: 409 STORE_NO_LOCATION', async () => {
    await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');
    const cliente = await buyer();
    const store = await makeStore({ latitude: null, longitude: null });
    const product = await prisma.product.create({ data: { storeId: store.id, name: 'Item', price: 20, quantity: 10 } } as any);
    await prisma.storeSubscription.create({ data: { storeId: store.id, storeName: 'p2', currentPlan: 'plan2' } as any });
    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(body(store.id, product.id));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STORE_NO_LOCATION');
    expect(await qty(product.id)).toBe(10);
  });

  it('custódia Plano 1: segue aceitando (sem entrega integrada)', async () => {
    await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');
    const cliente = await buyer();
    await walletService.credit({ owner: cliente.userId, ownerType: 'user', amount: 500, reason: 'teste F4', category: 'transfer' } as any);
    const store = await makeStore({ latitude: null, longitude: null });
    const product = await prisma.product.create({ data: { storeId: store.id, name: 'Item', price: 20, quantity: 10 } } as any);
    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(body(store.id, product.id));
    expect(res.status).toBe(201);
    expect(await qty(product.id)).toBe(8);
  });
});
