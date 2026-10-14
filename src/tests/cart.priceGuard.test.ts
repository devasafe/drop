/**
 * Sacola sempre com preço atual ("Compre novamente" com preço velho):
 * A) GET /products?ids=a,b,c — conferência da sacola em lote, com os mesmos gates da vitrine.
 * B) POST /orders com products[].expectedPrice — preço mostrado diferente do banco → 409
 *    PRICE_CHANGED ANTES de baixar estoque, criar pedido ou cobrar. Sem o campo, nada muda.
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

jest.mock('../services/asaas/payment', () => ({
  __esModule: true,
  ensureAsaasCustomer: jest.fn(async () => 'cus_test'),
  createPixCharge: jest.fn(async () => ({ paymentId: 'pay_pg_1', status: 'PENDING', qrCodePayload: 'pix', qrCodeImage: 'img' })),
  createCardCharge: jest.fn(),
}));

jest.mock('../services/routeService', () => {
  const actual = jest.requireActual('../services/routeService');
  return { __esModule: true, ...actual, getRoute: jest.fn() };
});

import app from '../app';
import { getRoute } from '../services/routeService';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import { ownerIdForStore } from './helpers/storeOwner';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createWallet } from './helpers/financePg';
import { ensurePlatformConfig, updatePlatformConfig } from '../repositories/platformConfig.repository';
import { createPixCharge, createCardCharge } from '../services/asaas/payment';

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_with_minimum_32_characters_length_ok';
const DOMAIN = '@pricegd.test';
let restoreConfig: () => Promise<void>;
let gatewayOriginal: any;

beforeAll(async () => {
  gatewayOriginal = env.PAYMENT_GATEWAY;
  restoreConfig = await snapshotPlatformConfig();
  await ensurePlatformConfig('system');
  await updatePlatformConfig({
    settlementMode: 'custodia', cardFeePercent: 2.99, cardFeeFixed: 0.49, cardAnticipationMonthlyRate: 1.99,
    cardInstallmentMaxCount: 12, cardInstallmentMinValue: 5,
  } as any, 'system');
}, 60000);

afterAll(async () => {
  env.PAYMENT_GATEWAY = gatewayOriginal;
  await restoreConfig();
});

afterEach(async () => {
  env.PAYMENT_GATEWAY = gatewayOriginal;
  await cleanupUsersByEmailDomain(DOMAIN);
  (createPixCharge as jest.Mock).mockClear();
  (createCardCharge as jest.Mock).mockReset();
});

async function buyer() {
  const user = await prisma.user.create({
    data: {
      name: 'Comprador pg', email: `buyer-${Date.now()}-${Math.random().toString(36).slice(2)}${DOMAIN}`,
      passwordHash: await bcrypt.hash('Senha123!', 10), role: 'cliente', roles: ['cliente'], activeRole: 'cliente', cpf: '39053344705',
      verification: { email: { status: 'verified' }, phone: { status: 'verified' }, document: { status: 'approved', type: 'cpf', number: '39053344705' } },
    },
  });
  await createWallet({ owner: user.id, ownerType: 'user', balance: 0, totalIncome: 0, totalSpent: 0 });
  return { user, token: jwt.sign({ id: user.id, role: 'cliente', activeRole: 'cliente', roles: ['cliente'] }, JWT_SECRET) };
}

async function loja(name = 'Loja pg') {
  return prisma.store.create({ data: { ownerId: await ownerIdForStore(DOMAIN), name, isOpen: true, isVerified: true } as any });
}
const produto = (storeId: string, data: Record<string, unknown>) =>
  prisma.product.create({ data: { storeId, name: 'Item', price: 19, quantity: 10, ...data } } as any);

describe('A — GET /products?ids=', () => {
  it('devolve só os pedidos, com preço, nome, imagem, estoque e loja atuais; pausado e inexistente não voltam', async () => {
    const store = await loja();
    const a = await produto(store.id, { name: 'RedBull', price: 19, oldPrice: 25, image: 'rb.jpg', quantity: 3 });
    const b = await produto(store.id, { name: 'Esgotado', price: 7, quantity: 0 });
    const pausado = await produto(store.id, { name: 'Pausado', isActive: false });
    await produto(store.id, { name: 'Fora da lista' });

    const res = await request(app).get(`/api/products?ids=${a.id},${b.id},${pausado.id},naoexiste123`);
    expect(res.status).toBe(200);
    const byId = new Map(res.body.products.map((p: any) => [p._id, p]));
    expect([...byId.keys()].sort()).toEqual([a.id, b.id].sort());
    expect(byId.get(a.id)).toEqual(expect.objectContaining({ name: 'RedBull', price: 19, oldPrice: 25, image: 'rb.jpg', quantity: 3, isActive: true, storeId: store.id }));
    expect(byId.get(b.id)).toEqual(expect.objectContaining({ quantity: 0 }));
  });

  it('loja oculta pela mensalidade (modo direto) não volta', async () => {
    await updatePlatformConfig({ settlementMode: 'direto' } as any, 'system');
    try {
      const store = await loja();
      await prisma.storeSaasBilling.create({ data: { storeId: store.id, trialEndsAt: new Date(Date.now() - 30 * 86400000), status: 'paused', pausedAt: new Date() } as any });
      const p = await produto(store.id, {});
      const res = await request(app).get(`/api/products?ids=${p.id}`);
      expect(res.status).toBe(200);
      expect(res.body.products).toEqual([]);
    } finally {
      await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'system');
    }
  });

  it('mais de 50 ids ou id malformado: 400', async () => {
    const many = Array.from({ length: 51 }, (_, i) => `id${i}`).join(',');
    expect((await request(app).get(`/api/products?ids=${many}`)).status).toBe(400);
    expect((await request(app).get(`/api/products?ids=${encodeURIComponent("a,b';drop")}`)).status).toBe(400);
    expect((await request(app).get('/api/products?ids=')).status).toBe(400);
  });

  it('sem ids: a listagem de sempre (com paginação)', async () => {
    const res = await request(app).get('/api/products?limit=1');
    expect(res.status).toBe(200);
    expect(res.body.pagination).toBeDefined();
  });
});

describe('B — POST /orders com expectedPrice', () => {
  const pedido = (storeId: string, products: any[], extra: Record<string, unknown> = {}) => ({
    storeId, products, paymentMethod: 'pix', deliveryDistanceKm: 0, address: 'Rua X, 1 - Centro', ...extra,
  });
  const post = (token: string, body: any) => request(app).post('/api/orders').set('Authorization', `Bearer ${token}`).send(body);

  it('Pix: preço mostrado diferente do atual → 409 PRICE_CHANGED com os preços atuais; nada criado, cobrado ou baixado', async () => {
    env.PAYMENT_GATEWAY = 'asaas';
    const { token } = await buyer();
    const store = await loja();
    const p1 = await produto(store.id, { name: 'RedBull', price: 19 });
    const p2 = await produto(store.id, { name: 'Água', price: 3 });
    const res = await post(token, pedido(store.id, [
      { productId: p1.id, quantity: 2, price: 27000, expectedPrice: 27000 },
      { productId: p2.id, quantity: 1, expectedPrice: 3 },
    ]));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Os preços mudaram. Confira a sacola.', code: 'PRICE_CHANGED', items: [{ productId: p1.id, price: 19 }] });
    expect(createPixCharge).not.toHaveBeenCalled();
    expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0);
    expect((await prisma.product.findUnique({ where: { id: p1.id } }))?.quantity).toBe(10);
  });

  it('corrida: o lojista muda o preço DEPOIS da checagem (durante a rota) → 409 no laço, estoque intacto, nada criado nem cobrado', async () => {
    env.PAYMENT_GATEWAY = 'asaas';
    const { token } = await buyer();
    const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore(DOMAIN), name: 'Loja corrida', isOpen: true, isVerified: true, latitude: '-22.90', longitude: '-43.20' } as any });
    const outro = await produto(store.id, { name: 'Água', price: 3 });
    const p1 = await produto(store.id, { name: 'RedBull', price: 19 });
    (getRoute as jest.Mock).mockImplementationOnce(async () => {
      await prisma.product.update({ where: { id: p1.id }, data: { price: 25 } });
      return { distanceKm: 3, durationSeconds: 600, source: 'route' };
    });
    const res = await post(token, pedido(store.id, [
      { productId: outro.id, quantity: 1, expectedPrice: 3 },
      { productId: p1.id, quantity: 2, expectedPrice: 19 },
    ], { latitude: -22.91, longitude: -43.21 }));
    expect(getRoute).toHaveBeenCalled();
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Os preços mudaram. Confira a sacola.', code: 'PRICE_CHANGED', items: [{ productId: p1.id, price: 25 }] });
    expect(createPixCharge).not.toHaveBeenCalled();
    expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0);
    expect((await prisma.product.findUnique({ where: { id: outro.id } }))?.quantity).toBe(10);
    expect((await prisma.product.findUnique({ where: { id: p1.id } }))?.quantity).toBe(10);
  });

  it('cartão: diverge → 409 antes de cobrar', async () => {
    env.PAYMENT_GATEWAY = 'asaas';
    const { token } = await buyer();
    const store = await loja();
    const p1 = await produto(store.id, { price: 25 });
    const res = await post(token, pedido(store.id, [{ productId: p1.id, quantity: 1, expectedPrice: 19 }], {
      paymentMethod: 'credit_card',
      card: { holderName: 'Fulano de Tal', number: '4111111111111111', expiryMonth: '12', expiryYear: '2030', ccv: '123' },
      cardHolder: { name: 'Fulano de Tal', email: `f${DOMAIN}`, cpfCnpj: '12345678909', postalCode: '12345678', addressNumber: '100', phone: '11999999999' },
    }));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PRICE_CHANGED');
    expect(createCardCharge).not.toHaveBeenCalled();
    expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0);
  });

  it('preço mostrado igual ao atual (centavos) → pedido segue', async () => {
    env.PAYMENT_GATEWAY = 'asaas';
    const { token } = await buyer();
    const store = await loja();
    const p1 = await produto(store.id, { price: 19.9 });
    const res = await post(token, pedido(store.id, [{ productId: p1.id, quantity: 1, expectedPrice: 19.9 }]));
    expect(res.status).toBe(201);
    expect(createPixCharge).toHaveBeenCalledTimes(1);
  });

  it('sem expectedPrice (app antigo) → comportamento de hoje: segue com o preço do banco', async () => {
    env.PAYMENT_GATEWAY = 'asaas';
    const { token } = await buyer();
    const store = await loja();
    const p1 = await produto(store.id, { price: 19 });
    const res = await post(token, pedido(store.id, [{ productId: p1.id, quantity: 1, price: 27000 }]));
    expect(res.status).toBe(201);
    expect((createPixCharge as jest.Mock).mock.calls[0][0].value).toBe(19);
  });
});
