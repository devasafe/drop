/**
 * Pedido mínimo (só produtos, sem frete): a plataforma define o piso (padrão R$ 5) e a loja
 * pode subir o dela, nunca descer. O pedido abaixo do mínimo é recusado sem mexer no estoque.
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

import app from '../app';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import { ownerIdForStore } from './helpers/storeOwner';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createWallet } from './helpers/financePg';
import { createTestUser, bearer } from './helpers/authUser';
import { ensurePlatformConfig, updatePlatformConfig } from '../repositories/platformConfig.repository';
import { effectiveMinOrder } from '../services/minOrder';

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_with_minimum_32_characters_length_ok';
const DOMAIN = '@pedidominimo.test';

let restoreConfig: () => Promise<void>;
let gatewayOriginal: any;

beforeAll(async () => {
  gatewayOriginal = env.PAYMENT_GATEWAY;
  restoreConfig = await snapshotPlatformConfig();
  await ensurePlatformConfig('system');
  await updatePlatformConfig({ settlementMode: 'custodia', minOrderValue: 5 } as any, 'system');
}, 60000);

afterAll(async () => {
  env.PAYMENT_GATEWAY = gatewayOriginal;
  await restoreConfig();
});

afterEach(async () => {
  env.PAYMENT_GATEWAY = gatewayOriginal;
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function buyer() {
  const user = await prisma.user.create({
    data: {
      name: 'Comprador mínimo',
      email: `buyer-${Date.now()}-${Math.random().toString(36).slice(2)}${DOMAIN}`,
      passwordHash: await bcrypt.hash('Senha123!', 10),
      role: 'cliente', roles: ['cliente'], activeRole: 'cliente',
      verification: {
        email: { status: 'verified' },
        phone: { status: 'verified' },
        document: { status: 'approved', type: 'cpf', number: '12345678909' },
      },
    },
  });
  await createWallet({ owner: user.id, ownerType: 'user', balance: 0, totalIncome: 0, totalSpent: 0 });
  return jwt.sign({ id: user.id, role: 'cliente', activeRole: 'cliente', roles: ['cliente'] }, JWT_SECRET);
}

async function lojaEProduto(price: number, minOrderValue: number | null = null) {
  const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore(DOMAIN), name: 'Loja mínimo', isOpen: true, minOrderValue } });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Item', price, quantity: 10 } } as any);
  return { store, product };
}

const stockOf = async (id: string) => (await prisma.product.findUnique({ where: { id } }))?.quantity;

function post(token: string, storeId: string, productId: string, quantity: number) {
  // Gateway 'none' + Pix: passando do mínimo, o fluxo legado para em "Saldo insuficiente" (400),
  // o que prova que a checagem do mínimo deixou passar.
  env.PAYMENT_GATEWAY = 'none';
  return request(app).post('/api/orders').set('Authorization', `Bearer ${token}`).send({
    deliveryDistanceKm: 0, address: 'Rua X, 1 - Centro', storeId, products: [{ productId, quantity }], paymentMethod: 'pix',
  });
}

describe('pedido mínimo · regra', () => {
  it('vale o maior entre o da plataforma e o da loja', () => {
    expect(effectiveMinOrder(null, 5)).toBe(5);
    expect(effectiveMinOrder(20, 5)).toBe(20);
    expect(effectiveMinOrder('3.50', 5)).toBe(5);
  });
});

describe('pedido mínimo · POST /orders', () => {
  it('produtos abaixo do mínimo da plataforma: 409 com quanto falta, estoque intacto', async () => {
    const token = await buyer();
    const { store, product } = await lojaEProduto(3);
    const res = await post(token, store.id, product.id, 1);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('MIN_ORDER_NOT_REACHED');
    expect(res.body.error).toBe('O pedido mínimo desta loja é R$ 5,00 em produtos. Faltam R$ 2,00.');
    expect(await stockOf(product.id)).toBe(10);
    expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0);
  });

  it('exatamente o mínimo passa da checagem', async () => {
    const token = await buyer();
    const { store, product } = await lojaEProduto(2.5);
    const res = await post(token, store.id, product.id, 2);
    expect(res.body.code).not.toBe('MIN_ORDER_NOT_REACHED');
    expect(res.body.error).toMatch(/Saldo insuficiente/);
  });

  it('a loja que subiu o mínimo recusa abaixo do dela', async () => {
    const token = await buyer();
    const { store, product } = await lojaEProduto(6, 20);
    const res = await post(token, store.id, product.id, 2);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('O pedido mínimo desta loja é R$ 20,00 em produtos. Faltam R$ 8,00.');
    expect(await stockOf(product.id)).toBe(10);
  });
});

describe('pedido mínimo · loja', () => {
  it('a loja sobe o mínimo, não desce abaixo do da DROP e volta ao padrão com null', async () => {
    const dono = await createTestUser('lojista', DOMAIN);
    const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja config mínimo', isOpen: true, isVerified: true } });
    const put = (minOrderValue: unknown) => request(app).put(`/api/stores/${store.id}`).set('Authorization', bearer(dono)).send({ minOrderValue });

    expect((await put(4)).status).toBe(400);
    expect((await put(4)).body.error).toContain('R$ 5,00');
    expect((await put(25)).status).toBe(200);
    expect(Number((await prisma.store.findUniqueOrThrow({ where: { id: store.id } })).minOrderValue)).toBe(25);

    const pub = await request(app).get(`/api/stores/${store.id}`);
    expect(pub.body.minOrderValue).toBe(25);

    expect((await put(null)).status).toBe(200);
    expect((await prisma.store.findUniqueOrThrow({ where: { id: store.id } })).minOrderValue).toBeNull();
    expect((await request(app).get(`/api/stores/${store.id}`)).body.minOrderValue).toBe(5);
  });

  it('a lista pública traz o mínimo que vale em cada loja', async () => {
    const dono = await createTestUser('lojista', DOMAIN);
    const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja lista mínimo', isOpen: true, isVerified: true, minOrderValue: 12 } });
    const list = await request(app).get('/api/stores');
    expect(list.body.find((s: any) => s.id === store.id)?.minOrderValue).toBe(12);
  });
});
