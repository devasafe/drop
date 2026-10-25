// src/tests/opreal.semMotoboy.test.ts
/**
 * Operação real · telas de pedido sem motoboy e devolução (DS v2, frames "Pedido · sem motoboy",
 * "Pedido · entrega não concluída" e "Devolução · escolha do cliente").
 * - "Continuar esperando" reinicia o relógio do pool: o job não pergunta de novo 5 min depois.
 * - A escolha do cliente na devolução chega ao painel da loja na hora.
 */
jest.mock('../utils/socketEmitter', () => {
  const actual = jest.requireActual('../utils/socketEmitter');
  return { __esModule: true, ...actual, emitToRoom: jest.fn(), emitAdminNotification: jest.fn() };
});

import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { emitToRoom } from '../utils/socketEmitter';
import { runPoolTimeout } from '../jobs/poolTimeout.job';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@semmotoboy.test';
const emit = emitToRoom as jest.Mock;
let restorePlatformConfig: () => Promise<void>;

beforeAll(async () => {
  restorePlatformConfig = await snapshotPlatformConfig();
  const existing = await prisma.platformConfig.findFirst({ orderBy: { updatedAt: 'asc' } });
  if (existing) await prisma.platformConfig.update({ where: { id: existing.id }, data: { poolTimeoutMin: 15 } });
  else await prisma.platformConfig.create({ data: { poolTimeoutMin: 15 } as any });
});
beforeEach(() => emit.mockReset());
afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });
afterAll(async () => { await restorePlatformConfig(); await prisma.$disconnect(); });

async function pedidoNoPool() {
  const dono = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja Sem Motoboy', isOpen: true } });
  const order = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId: store.id, totalValue: 90, deliveryFee: 20, paymentMethod: 'pix',
      paymentStatus: 'paid', status: 'aguardando_motoboy', acceptedAt: new Date(), awaitingCustomerPoolDecision: true,
    } as any,
  });
  // No pool há 1 h: bem além dos 15 min.
  const delivery = await prisma.delivery.create({
    data: { orderId: order.id, motoboyId: null, fee: 20, status: 'pending', createdAt: new Date(Date.now() - 60 * 60 * 1000) } as any,
  });
  await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } as any });
  return { cliente, order, delivery };
}

describe('pool-timeout · continuar esperando', () => {
  it('reinicia o relógio do pool: a varredura seguinte não marca o pedido de novo', async () => {
    const { cliente, order, delivery } = await pedidoNoPool();

    const r = await request(app).post(`/api/orders/${order.id}/pool-timeout`).set('Authorization', bearer(cliente)).send({ escolha: 'seguir' });
    expect(r.status).toBe(200);

    const d = await prisma.delivery.findUnique({ where: { id: delivery.id } });
    expect(Date.now() - d!.createdAt.getTime()).toBeLessThan(60 * 1000);

    await runPoolTimeout();
    const o = await prisma.order.findUnique({ where: { id: order.id } });
    expect(o!.awaitingCustomerPoolDecision).toBe(false);
  });

  it('não mexe numa entrega que um motoboy pegou nesse meio-tempo', async () => {
    const { cliente, order, delivery } = await pedidoNoPool();
    const motoboy = await createTestUser('motoboy', DOMAIN);
    const antes = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.delivery.update({ where: { id: delivery.id }, data: { status: 'assigned', motoboyId: motoboy.userId, createdAt: antes } as any });

    const r = await request(app).post(`/api/orders/${order.id}/pool-timeout`).set('Authorization', bearer(cliente)).send({ escolha: 'seguir' });
    expect(r.status).toBe(200);

    const d = await prisma.delivery.findUnique({ where: { id: delivery.id } });
    expect(d!.createdAt.getTime()).toBe(antes.getTime());
  });
});

describe('pos-devolucao · nova entrega', () => {
  it('avisa o painel da loja para recarregar e mostrar a escolha do cliente', async () => {
    const dono = await createTestUser('lojista', DOMAIN);
    const cliente = await createTestUser('cliente', DOMAIN);
    const motoboy = await createTestUser('motoboy', DOMAIN);
    const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja Devolução', isOpen: true } });
    const order = await prisma.order.create({
      data: {
        customerId: cliente.userId, storeId: store.id, totalValue: 200, deliveryFee: 20, paymentMethod: 'pix',
        paymentStatus: 'paid', status: 'enviado', acceptedAt: new Date(),
      } as any,
    });
    const delivery = await prisma.delivery.create({
      data: { orderId: order.id, motoboyId: motoboy.userId, fee: 20, status: 'picked', statusDevolucao: 'aguardando_confirmacao', pinDevolucao: '654321' } as any,
    });
    await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } as any });

    const r = await request(app).post(`/api/orders/${order.id}/pos-devolucao`).set('Authorization', bearer(cliente)).send({ escolha: 'reentrega' });
    expect(r.status).toBe(200);

    const calls = emit.mock.calls.filter((c) => c[0] === `store:${store.id}` && c[1] === 'order:updated');
    expect(calls).toHaveLength(1);
    expect(calls[0][2]).toMatchObject({ orderId: order.id, pendingReturnAction: 'reassign' });
    expect(JSON.stringify(calls[0][2])).not.toContain('654321');
  });
});
