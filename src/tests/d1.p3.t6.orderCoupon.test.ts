// src/tests/d1.p3.t6.orderCoupon.test.ts
/**
 * D1 · P3.6 — o pedido guarda o cupom aplicado (custódia e modo direto).
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
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { createWallet } from './helpers/financePg';
import { grantStoreConsent } from './helpers/storeConsent';

const DOMAIN = '@d1p3t6.test';
const STORE_KEY = '$aact_hmlg_LOJA';
const postAs = asaasClient.postAs as jest.Mock;
const getAs = asaasClient.getAs as jest.Mock;
const ORIGINAL_GATEWAY = env.PAYMENT_GATEWAY;
const couponCodes: string[] = [];
let restore: () => Promise<void>;

function randomCpf(): string {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (n.every((d) => d === n[0])) n[0] = (n[0] + 1) % 10;
  const dv = (b: number[]) => { const s = b.reduce((a, d, i) => a + d * (b.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  n.push(dv(n)); n.push(dv(n));
  return n.join('');
}

beforeAll(async () => {
  restore = await snapshotPlatformConfig();
  (env as any).PAYMENT_GATEWAY = 'none';
});
afterAll(async () => {
  await restore();
  (env as any).PAYMENT_GATEWAY = ORIGINAL_GATEWAY;
  await prisma.$disconnect();
});
beforeEach(() => {
  jest.clearAllMocks();
  postAs.mockReset();
  getAs.mockReset();
  (getRoute as jest.Mock).mockResolvedValue({ distanceKm: 3, durationSeconds: 600, polyline: 'abc', source: 'google' });
});
afterEach(async () => {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  const ids = stores.map((s) => s.id);
  await prisma.storeAsaasCustomer.deleteMany({ where: { storeId: { in: ids } } });
  await prisma.storeAsaasAudit.deleteMany({ where: { storeId: { in: ids } } });
  if (couponCodes.length) await prisma.coupon.deleteMany({ where: { code: { in: couponCodes.splice(0) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function buyer(): Promise<TestUser> {
  const u = await createTestUser('cliente', DOMAIN);
  await prisma.user.update({ where: { id: u.userId }, data: { cpf: randomCpf() } });
  await createWallet({ owner: u.userId, ownerType: 'user', balance: 1000, totalIncome: 1000, totalSpent: 0 });
  return u;
}

async function loja(withAsaas: boolean) {
  const dono = await createTestUser('lojista', DOMAIN);
  const store = await prisma.store.create({
    data: { ownerId: dono.userId, name: 'Loja P3.6', isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any,
  });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Item', price: 20, quantity: 10 } } as any);
  if (withAsaas) {
    await prisma.storeAsaasAccount.create({
      data: { storeId: store.id, apiKeyEncrypted: encryptSensitiveData(STORE_KEY), apiKeyLast4: 'LOJA', environment: 'sandbox', status: 'valid' },
    });
    await grantStoreConsent(store.id);
  }
  return { store, product };
}

async function cupom(storeId: string) {
  const code = `P3T6${Date.now().toString().slice(-6)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
  couponCodes.push(code);
  return prisma.coupon.create({
    data: {
      code, type: 'store', discountType: 'percent', discountValue: 10, storeId,
      validFrom: new Date(Date.now() - 86400000), validUntil: new Date(Date.now() + 86400000), createdBy: 'test',
    },
  });
}

const body = (storeId: string, productId: string, extra: Record<string, unknown> = {}) => ({
  storeId, products: [{ productId, quantity: 2 }], paymentMethod: 'pix', deliveryDistanceKm: 0,
  address: 'Rua X, 1 - Centro', latitude: -22.95, longitude: -43.25, ...extra,
});

describe('custódia (carteira, sem gateway)', () => {
  beforeEach(async () => { await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test'); });

  it('pedido com cupom guarda o couponId', async () => {
    const cliente = await buyer();
    const { store, product } = await loja(false);
    const c = await cupom(store.id);
    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(body(store.id, product.id, { cupomCode: c.code }));
    expect(res.status).toBe(201);
    const order = await prisma.order.findFirst({ where: { storeId: store.id } });
    expect(order!.couponId).toBe(c.id);
  });

  it('pedido sem cupom: couponId nulo', async () => {
    const cliente = await buyer();
    const { store, product } = await loja(false);
    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(body(store.id, product.id));
    expect(res.status).toBe(201);
    const order = await prisma.order.findFirst({ where: { storeId: store.id } });
    expect(order!.couponId).toBeNull();
  });
});

describe('modo direto (Pix na conta da loja)', () => {
  beforeEach(async () => { await updatePlatformConfig({ settlementMode: 'direto', directCardEnabled: false } as any, 'test'); });

  it('pedido com cupom da loja guarda o couponId', async () => {
    const cliente = await buyer();
    const { store, product } = await loja(true);
    const c = await cupom(store.id);
    postAs.mockImplementation(async (_key: string, path: string) => {
      if (path === '/customers') return { id: 'cus_p36' };
      if (path === '/payments') return { id: `pay_p36_${Date.now()}`, status: 'PENDING' };
      throw new Error(`rota inesperada ${path}`);
    });
    getAs.mockResolvedValue({ encodedImage: 'img', payload: 'copia', expirationDate: '2026-10-09 23:59:59' });

    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(body(store.id, product.id, { cupomCode: c.code }));
    expect(res.status).toBe(201);
    const order = await prisma.order.findUnique({ where: { id: res.body.order._id } });
    expect(order!.paymentProvider).toBe('asaas_loja');
    expect(order!.couponId).toBe(c.id);
  });
});
