/**
 * D1 · Etapa 0 — rede do backend para as ações da loja que o redesign vai religar:
 * aceite, recusa com motivo (reasonCode gravado) e PIN de retirada.
 * Teste de comportamento da Etapa 0: intocável.
 */
jest.mock('../utils/socketEmitter', () => {
  const actual = jest.requireActual('../utils/socketEmitter');
  return { __esModule: true, ...actual, emitToRoom: jest.fn(), emitAdminNotification: jest.fn() };
});

import request from 'supertest';
import app from '../app';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@d1etapa0.test';
const PIN_RETIRADA = '54321';
const ORIGINAL_GATEWAY = env.PAYMENT_GATEWAY;
let restore: () => Promise<void>;

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); (env as any).PAYMENT_GATEWAY = ORIGINAL_GATEWAY; });
beforeEach(async () => {
  (env as any).PAYMENT_GATEWAY = 'none';
  await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');
});
afterEach(async () => {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  const storeIds = stores.map((s) => s.id);
  const orders = await prisma.order.findMany({ where: { storeId: { in: storeIds } }, select: { id: true } });
  const ids = orders.map((o) => o.id);
  await prisma.appCashboxEntry.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.deliveryInvoice.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.payout.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.storeSubscription.deleteMany({ where: { storeId: { in: storeIds } } }).catch(() => undefined);
  await cleanupUsersByEmailDomain(DOMAIN);
});

/** Pedido da custódia, pago e ainda não aceito; loja Plano 1 (sem motoboy), 1 item com estoque 10. */
async function pedidoNovo() {
  const lojista = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const store = await prisma.store.create({
    data: { ownerId: lojista.userId, name: 'Loja Etapa 0', plan: 1, isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any,
  });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Item', price: 20, quantity: 10 } } as any);
  const order = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId: store.id, items: { create: [{ productId: product.id, quantity: 1, price: 20 }] },
      subtotal: 20, totalValue: 20, deliveryFee: 0, deliveryDistance: 3, status: 'criado', paymentMethod: 'pix',
      paymentStatus: 'paid', asaasChargeStatus: 'received', paymentProvider: 'asaas',
    } as any,
  });
  return { lojista, cliente, store, product, order };
}

/** Entrega com motoboy atribuído, aguardando a retirada na loja. */
async function entregaAtribuida() {
  const dono = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const motoboy = await createTestUser('motoboy', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja PIN', isOpen: true } as any });
  const order = await prisma.order.create({
    data: { customerId: cliente.userId, storeId: store.id, totalValue: 30, subtotal: 20, deliveryFee: 10, status: 'pago', paymentMethod: 'pix', paymentStatus: 'paid' } as any,
  });
  const delivery = await prisma.delivery.create({
    data: { orderId: order.id, status: 'assigned', motoboyId: motoboy.userId, fee: 10, distance: 4, pin: '12345', pinRetirada: PIN_RETIRADA } as any,
  });
  await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } as any });
  return { dono, delivery };
}

describe('Etapa 0 · aceite', () => {
  it('o dono aceita: 200, pedido vai para pago com acceptedAt', async () => {
    const { lojista, order } = await pedidoNovo();
    const res = await request(app).post(`/api/orders/${order.id}/accept`).set('Authorization', bearer(lojista)).send({});
    expect(res.status).toBe(200);
    expect(res.body.requiresDelivery).toBe(false);
    const saved = await prisma.order.findUnique({ where: { id: order.id } });
    expect(saved?.status).toBe('pago');
    expect(saved?.acceptedAt).toBeTruthy();
  });

  it('lojista de outra loja: 403 e o pedido não muda', async () => {
    const { order } = await pedidoNovo();
    const intruso = await createTestUser('lojista', DOMAIN);
    const res = await request(app).post(`/api/orders/${order.id}/accept`).set('Authorization', bearer(intruso)).send({});
    expect(res.status).toBe(403);
    const saved = await prisma.order.findUnique({ where: { id: order.id } });
    expect(saved?.status).toBe('criado');
    expect(saved?.acceptedAt).toBeNull();
  });
});

describe('Etapa 0 · recusa', () => {
  it('com reasonCode: grava o código e o texto no cancelamento, rejeita e devolve o estoque', async () => {
    const { lojista, order, product } = await pedidoNovo();
    const res = await request(app).post(`/api/orders/${order.id}/reject`).set('Authorization', bearer(lojista))
      .send({ reason: 'Muitos pedidos para processar', reasonCode: 'store_busy' });
    expect(res.status).toBe(200);
    const c = await prisma.cancellation.findFirst({ where: { orderId: order.id } });
    expect(c?.reasonCode).toBe('store_busy');
    expect(c?.reason).toBe('Muitos pedidos para processar');
    expect(c?.cancelledBy).toBe('store');
    expect((await prisma.order.findUnique({ where: { id: order.id } }))?.status).toBe('rejeitado');
    expect((await prisma.product.findUnique({ where: { id: product.id } }))?.quantity).toBe(11);
  });

  it('"other" com texto livre: grava other e o texto', async () => {
    const { lojista, order } = await pedidoNovo();
    const res = await request(app).post(`/api/orders/${order.id}/reject`).set('Authorization', bearer(lojista))
      .send({ reason: 'Acabou o gás', reasonCode: 'other' });
    expect(res.status).toBe(200);
    const c = await prisma.cancellation.findFirst({ where: { orderId: order.id } });
    expect(c?.reasonCode).toBe('other');
    expect(c?.reason).toBe('Acabou o gás');
  });

  it('sem reasonCode: continua gravando store_rejected', async () => {
    const { lojista, order } = await pedidoNovo();
    const res = await request(app).post(`/api/orders/${order.id}/reject`).set('Authorization', bearer(lojista)).send({ reason: 'Sem estoque' });
    expect(res.status).toBe(200);
    const c = await prisma.cancellation.findFirst({ where: { orderId: order.id } });
    expect(c?.reasonCode).toBe('store_rejected');
  });
});

describe('Etapa 0 · PIN de retirada', () => {
  it('PIN errado: 400 legível, entrega continua assigned e o PIN não volta na resposta', async () => {
    const { dono, delivery } = await entregaAtribuida();
    const res = await request(app).post(`/api/deliveries/${delivery.id}/validar-pin-retirada`).set('Authorization', bearer(dono)).send({ pinRetirada: '11111' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('PIN de retirada inválido');
    expect(JSON.stringify(res.body)).not.toContain(PIN_RETIRADA);
    expect((await prisma.delivery.findUnique({ where: { id: delivery.id } }))?.status).toBe('assigned');
  });

  it('PIN certo: 200, entrega vai para picked e o PIN não volta na resposta', async () => {
    const { dono, delivery } = await entregaAtribuida();
    const res = await request(app).post(`/api/deliveries/${delivery.id}/validar-pin-retirada`).set('Authorization', bearer(dono)).send({ pinRetirada: PIN_RETIRADA });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(PIN_RETIRADA);
    expect((await prisma.delivery.findUnique({ where: { id: delivery.id } }))?.status).toBe('picked');
  });
});
