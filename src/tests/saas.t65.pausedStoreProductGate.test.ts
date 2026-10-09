/**
 * B5 — modo direto: GET /products/:id e GET /stores/:id/top-products também escondem a loja
 * pausada/cancelada (link direto não mostra loja fora do ar). O DONO autenticado continua
 * recebendo o próprio produto (a tela de edição usa essa rota). Custódia: nada muda.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@saas65.test';
let restore: () => Promise<void>;

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); });
beforeEach(async () => { await updatePlatformConfig({ settlementMode: 'direto' } as any, 'test'); });
afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });

async function cenario(billing: Record<string, unknown> | null) {
  const dono = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  // plan 3: top-products é exclusivo do Plano 3
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja t65', isOpen: true, isVerified: true, plan: 3 } as any });
  if (billing) await prisma.storeSaasBilling.create({ data: { storeId: store.id, trialEndsAt: new Date(Date.now() - 30 * 86400000), ...billing } as any });
  const prod = await prisma.product.create({ data: { storeId: store.id, name: 'Prod t65', price: 10, quantity: 5 } as any });
  const order = await prisma.order.create({
    data: { customerId: cliente.userId, storeId: store.id, totalValue: 10, deliveryFee: 0, status: 'entregue', paymentMethod: 'pix', paymentStatus: 'paid' },
  });
  await prisma.orderItem.create({ data: { orderId: order.id, productId: prod.id, quantity: 2, price: 10 } as any });
  return { dono, cliente, store, prod };
}

const paused = { status: 'paused', pausedAt: new Date() };

describe('t65 — produto e top-produtos de loja pausada', () => {
  it('direto + paused: GET /products/:id 404 para o público', async () => {
    const c = await cenario(paused);
    const res = await request(app).get(`/api/products/${c.prod.id}`);
    expect(res.status).toBe(404);
  });

  it('direto + paused: o dono autenticado ainda recebe o produto', async () => {
    const c = await cenario(paused);
    const res = await request(app).get(`/api/products/${c.prod.id}`).set('Authorization', bearer(c.dono));
    expect(res.status).toBe(200);
    expect(res.body._id).toBe(c.prod.id);
  });

  it('direto + paused: outro usuário autenticado (cliente) segue com 404', async () => {
    const c = await cenario(paused);
    const res = await request(app).get(`/api/products/${c.prod.id}`).set('Authorization', bearer(c.cliente));
    expect(res.status).toBe(404);
  });

  it('direto + paused: top-products sem itens', async () => {
    const c = await cenario(paused);
    const res = await request(app).get(`/api/stores/${c.store.id}/top-products`);
    expect(res.status).toBe(200);
    expect(res.body.products).toEqual([]);
  });

  it('direto + loja ativa: produto e top-products respondem', async () => {
    const c = await cenario({ status: 'active', paidUntil: new Date(Date.now() + 10 * 86400000) });
    const p = await request(app).get(`/api/products/${c.prod.id}`);
    expect(p.status).toBe(200);
    const t = await request(app).get(`/api/stores/${c.store.id}/top-products`);
    expect(t.status).toBe(200);
    expect(t.body.products.length).toBe(1);
  });

  it('direto + loja sem linha de cobrança: continua visível', async () => {
    const c = await cenario(null);
    expect((await request(app).get(`/api/products/${c.prod.id}`)).status).toBe(200);
  });

  it('custódia: nada muda mesmo com linha paused', async () => {
    await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');
    const c = await cenario(paused);
    expect((await request(app).get(`/api/products/${c.prod.id}`)).status).toBe(200);
    const t = await request(app).get(`/api/stores/${c.store.id}/top-products`);
    expect(t.status).toBe(200);
    expect(t.body.products.length).toBe(1);
  });
});
