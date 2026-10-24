/**
 * Task 7 (DS v2) — GET /api/orders/:id/reorder ("Comprar de novo").
 * Preço e estoque ATUAIS; indisponíveis vêm marcados com `reason`; só o dono do pedido.
 * A rota fixa `/:id/reorder` convive com `/:id`, `/:id/pix` etc.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import { paymentsReadyStoreData } from './helpers/storeConsent';

const DOMAIN = '@reorder7.test';
const ORIGINAL_KYC = process.env.KYC_ENFORCED;
let restore: () => Promise<void>;

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => {
  await restore();
  if (ORIGINAL_KYC === undefined) delete process.env.KYC_ENFORCED;
  else process.env.KYC_ENFORCED = ORIGINAL_KYC;
});
beforeEach(async () => {
  process.env.KYC_ENFORCED = 'true';
  await updatePlatformConfig({ settlementMode: 'direto' } as any, 'test');
});
afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });

async function cenario(storeData: Record<string, unknown> = {}) {
  const dono = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const store = await prisma.store.create({
    data: { ownerId: dono.userId, name: 'Loja T7', isOpen: true, isVerified: true, ...paymentsReadyStoreData(), ...storeData } as any,
  });
  const apagado = await prisma.product.create({ data: { storeId: store.id, name: 'Apagado', price: 10, quantity: 9 } as any });
  const pouco = await prisma.product.create({ data: { storeId: store.id, name: 'Pouco estoque', price: 20, quantity: 2 } as any });
  const caro = await prisma.product.create({ data: { storeId: store.id, name: 'Preço mudou', price: 35, quantity: 9 } as any });
  const order = await prisma.order.create({
    data: { customerId: cliente.userId, storeId: store.id, totalValue: 100, deliveryFee: 0, status: 'entregue', paymentMethod: 'pix', paymentStatus: 'paid' },
  });
  await prisma.orderItem.createMany({
    data: [
      { orderId: order.id, productId: apagado.id, quantity: 1, price: 10 },
      { orderId: order.id, productId: pouco.id, quantity: 5, price: 20 },
      { orderId: order.id, productId: caro.id, quantity: 2, price: 30 },
    ],
  });
  return { dono, cliente, store, order, apagado, pouco, caro };
}

// FK de OrderItem→Product é RESTRICT; o apagamento "real" (dados legados/cascata) é simulado sem FK.
async function apagarSemFk(productId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
    await tx.product.delete({ where: { id: productId } });
  });
}

const reorder = (id: string, who?: any) => {
  const r = request(app).get(`/api/orders/${id}/reorder`);
  return who ? r.set('Authorization', bearer(who)) : r;
};

describe('GET /api/orders/:id/reorder', () => {
  it('pedido de 3 itens: apagado, estoque menor e preço alterado', async () => {
    const c = await cenario();
    await apagarSemFk(c.apagado.id);
    const res = await reorder(c.order.id, c.cliente);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.storeId).toBe(c.store.id);
    expect(res.body.data.storeName).toBe('Loja T7');
    expect(res.body.data.storeAvailable).toBe(true);
    const items = res.body.data.items as any[];
    expect(items).toHaveLength(3);
    const by = (id: string) => items.find((i) => i.productId === id);

    expect(by(c.apagado.id)).toMatchObject({ available: false, reason: 'DELETED', quantity: 0, requestedQuantity: 1, previousPrice: 10 });

    expect(by(c.pouco.id)).toMatchObject({
      available: true, reason: null, price: 20, previousPrice: 20, quantity: 2, requestedQuantity: 5, priceChanged: false,
    });

    expect(by(c.caro.id)).toMatchObject({
      available: true, reason: null, price: 35, previousPrice: 30, quantity: 2, requestedQuantity: 2, priceChanged: true, name: 'Preço mudou',
    });
  });

  it('produto sem estoque: OUT_OF_STOCK', async () => {
    const c = await cenario();
    await prisma.product.update({ where: { id: c.pouco.id }, data: { quantity: 0 } });
    const res = await reorder(c.order.id, c.cliente);
    const item = res.body.data.items.find((i: any) => i.productId === c.pouco.id);
    expect(item).toMatchObject({ available: false, reason: 'OUT_OF_STOCK', quantity: 0 });
  });

  it('loja pausada pela mensalidade: todos STORE_UNAVAILABLE', async () => {
    const c = await cenario();
    await prisma.storeSaasBilling.create({
      data: { storeId: c.store.id, status: 'paused', pausedAt: new Date(), trialEndsAt: new Date(Date.now() - 30 * 86400000) } as any,
    });
    const res = await reorder(c.order.id, c.cliente);
    expect(res.status).toBe(200);
    expect(res.body.data.storeAvailable).toBe(false);
    expect(res.body.data.items).toHaveLength(3);
    for (const i of res.body.data.items) expect(i).toMatchObject({ available: false, reason: 'STORE_UNAVAILABLE' });
  });

  it('loja sem KYC (KYC_ENFORCED=true): STORE_UNAVAILABLE', async () => {
    const c = await cenario({ isVerified: false });
    const res = await reorder(c.order.id, c.cliente);
    expect(res.body.data.storeAvailable).toBe(false);
    for (const i of res.body.data.items) expect(i.reason).toBe('STORE_UNAVAILABLE');
  });

  it('não-dono: 403 (mesma convenção de GET /orders/:id), inclusive o dono da loja', async () => {
    const c = await cenario();
    const outro = await createTestUser('cliente', DOMAIN);
    expect((await reorder(c.order.id, outro)).status).toBe(403);
    expect((await reorder(c.order.id, c.dono)).status).toBe(403);
  });

  it('sem login: 401; pedido inexistente: 404', async () => {
    const c = await cenario();
    expect((await reorder(c.order.id)).status).toBe(401);
    expect((await reorder('nao-existe', c.cliente)).status).toBe(404);
  });

  it('ordem das rotas: /:id e /:id/pix continuam respondendo ao lado de /:id/reorder', async () => {
    const c = await cenario();
    const base = await request(app).get(`/api/orders/${c.order.id}`).set('Authorization', bearer(c.cliente));
    expect(base.status).toBe(200);
    expect(base.body.items ?? base.body.data?.items ?? base.body.products ?? base.body.data?.products).toBeDefined();
    const re = await reorder(c.order.id, c.cliente);
    expect(re.body.data.items).toBeDefined();
    expect(re.body.data.storeId).toBe(c.store.id);
    // /stats/cancellations (fixa) não é engolida por /:id
    const stats = await request(app).get('/api/orders/stats/cancellations').set('Authorization', bearer(c.cliente));
    expect(stats.status).toBe(403);
  });
});
