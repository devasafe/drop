/**
 * Troca de modo com pedido em andamento (decisão do usuário, 2026-10-08):
 * "eu posso ter mudado o modo, mas o pedido tem que ser finalizado" — o pedido segue
 * até o fim pelas regras do modo em que NASCEU (Order.paymentProvider), nunca pelo
 * settlementMode do momento.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@saas18.test';
let restore: () => Promise<void>;

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); });

afterEach(async () => {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  const storeIds = stores.map((s) => s.id);
  const orders = await prisma.order.findMany({ where: { storeId: { in: storeIds } }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  await prisma.deliveryInvoice.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.payout.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.storeSubscription.deleteMany({ where: { storeId: { in: storeIds } } }).catch(() => undefined);
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function paidOrder(provider: 'asaas' | 'asaas_loja', deliveryFee: number) {
  const lojista = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const store = await prisma.store.create({
    data: { ownerId: lojista.userId, name: 'Loja 18', plan: 1, isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any,
  });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Item', price: 20, quantity: 10 } } as any);
  const order = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId: store.id, items: { create: [{ productId: product.id, quantity: 1, price: 20 }] },
      subtotal: 20, totalValue: 20 + deliveryFee, deliveryFee, deliveryDistance: 3, status: 'criado', paymentMethod: 'pix',
      paymentStatus: 'paid', asaasChargeStatus: 'received', paymentProvider: provider,
    } as any,
  });
  return { lojista, order };
}

describe('pedido termina no modo em que nasceu', () => {
  it('pedido da custódia (loja plano 1, taxa 0) aceito depois da troca para direto continua sem motoboy', async () => {
    await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');
    const { lojista, order } = await paidOrder('asaas', 0);
    await updatePlatformConfig({ settlementMode: 'direto' } as any, 'test');

    const res = await request(app).post(`/api/orders/${order.id}/accept`).set('Authorization', bearer(lojista)).send({});
    expect(res.status).toBe(200);
    expect(res.body.requiresDelivery).toBe(false);
    // Sem Delivery: um motoboy não pode pegar corrida de taxa R$ 0 que ninguém pagou.
    expect(await prisma.delivery.findFirst({ where: { orderId: order.id } })).toBeNull();
  });

  it('pedido do modo direto aceito depois da volta para custódia continua indo ao pool de motoboys', async () => {
    await updatePlatformConfig({ settlementMode: 'direto' } as any, 'test');
    const { lojista, order } = await paidOrder('asaas_loja', 8);
    await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');

    const res = await request(app).post(`/api/orders/${order.id}/accept`).set('Authorization', bearer(lojista)).send({});
    expect(res.status).toBe(200);
    const delivery = await prisma.delivery.findFirst({ where: { orderId: order.id } });
    expect(delivery).toBeTruthy();
    expect(Number(delivery!.fee)).toBe(8);
  });
});
