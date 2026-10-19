// src/tests/delivery.c2.t9.timestamps.test.ts
/** Fase C2 — Task 9. Hora real de aceite, retirada e entrega na Delivery. */
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

const DOMAIN = '@c2horas.test';
const ORIGINAL_GATEWAY = env.PAYMENT_GATEWAY;
let restore: () => Promise<void>;
beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); (env as any).PAYMENT_GATEWAY = ORIGINAL_GATEWAY; await prisma.$disconnect(); });
beforeEach(async () => {
  (env as any).PAYMENT_GATEWAY = 'none';
  await updatePlatformConfig({ settlementMode: 'direto', motoboyShareDirect: 80, directTransferMaxAmount: 150 } as any, 'test');
});
afterEach(async () => {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  const orders = await prisma.order.findMany({ where: { storeId: { in: stores.map((s) => s.id) } }, select: { id: true } });
  const ids = orders.map((o) => o.id);
  await prisma.motoboyTransfer.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.deliveryInvoice.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.payout.deleteMany({ where: { orderId: { in: ids } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function cenario(status: 'pending' | 'assigned' | 'picked') {
  const dono = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const motoboy = await createTestUser('motoboy', DOMAIN);
  // Pedido direto: sem chave Pix o motoboy não pega a corrida (MOTOBOY_PIX_KEY_REQUIRED).
  await prisma.user.update({ where: { id: motoboy.userId }, data: { asaas: { status: 'none', pixKey: '12345678909', pixKeyType: 'CPF' } } as any });
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja T9', isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any });
  const order = await prisma.order.create({
    data: { customerId: cliente.userId, storeId: store.id, totalValue: 30, subtotal: 20, deliveryFee: 10, status: 'pago', paymentMethod: 'pix', paymentStatus: 'paid', paymentProvider: 'asaas_loja' } as any,
  });
  const delivery = await prisma.delivery.create({
    data: {
      orderId: order.id, status, fee: 10, distance: 4,
      ...(status === 'pending' ? {} : { motoboyId: motoboy.userId, pin: '12345', pinRetirada: '54321' }),
    } as any,
  });
  await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } as any });
  return { dono, cliente, motoboy, order, delivery };
}
const recente = (d: Date | null | undefined) => !!d && Math.abs(Date.now() - new Date(d).getTime()) < 60_000;

it('claim grava assignedAt', async () => {
  const { motoboy, delivery } = await cenario('pending');
  const r = await request(app).post(`/api/deliveries/${delivery.id}/claim`).set('Authorization', bearer(motoboy)).send({});
  expect(r.status).toBe(200);
  const d = await prisma.delivery.findUnique({ where: { id: delivery.id } });
  expect(recente((d as any).assignedAt)).toBe(true);
  expect((d as any).pickedAt).toBeNull();
});

it('PIN de retirada grava pickedAt', async () => {
  const { dono, delivery } = await cenario('assigned');
  const r = await request(app).post(`/api/deliveries/${delivery.id}/validar-pin-retirada`).set('Authorization', bearer(dono)).send({ pinRetirada: '54321' });
  expect(r.status).toBe(200);
  const d = await prisma.delivery.findUnique({ where: { id: delivery.id } });
  expect(recente((d as any).pickedAt)).toBe(true);
});

it('PIN de entrega grava deliveredAt e o cliente vê as horas no pedido', async () => {
  const { motoboy, cliente, order, delivery } = await cenario('picked');
  const r = await request(app).post(`/api/deliveries/${delivery.id}/finalizar`).set('Authorization', bearer(motoboy)).send({ pin: '12345' });
  expect(r.status).toBe(200);
  const d = await prisma.delivery.findUnique({ where: { id: delivery.id } });
  expect(recente((d as any).deliveredAt)).toBe(true);
  const o = await request(app).get(`/api/orders/${order.id}`).set('Authorization', bearer(cliente));
  expect(recente(o.body.delivery.deliveredAt)).toBe(true);
});
