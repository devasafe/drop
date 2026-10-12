// src/tests/d1.p4.3.orderReady.test.ts
/** D1 · P4.3 — loja marca "pronto para retirada"; o motoboy da entrega é avisado, sem PIN. */
jest.mock('../utils/socketEmitter', () => {
  const actual = jest.requireActual('../utils/socketEmitter');
  return { __esModule: true, ...actual, emitToRoom: jest.fn(), emitAdminNotification: jest.fn() };
});

import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { emitToRoom } from '../utils/socketEmitter';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@d1p43.test';
const emit = emitToRoom as jest.Mock;

beforeEach(() => emit.mockReset());
afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });
afterAll(async () => { await prisma.$disconnect(); });

async function cenario(opts: { accepted?: boolean; status?: string; delivery?: 'assigned' | 'picked' | 'none' } = {}) {
  const dono = await createTestUser('lojista', DOMAIN);
  const outro = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const motoboy = await createTestUser('motoboy', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja P43', isOpen: true } });
  const order = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId: store.id, totalValue: 30, deliveryFee: 10, paymentMethod: 'pix',
      paymentStatus: 'paid', status: opts.status ?? 'pago', acceptedAt: opts.accepted === false ? null : new Date(),
    } as any,
  });
  let delivery: any = null;
  if ((opts.delivery ?? 'assigned') !== 'none') {
    delivery = await prisma.delivery.create({
      data: { orderId: order.id, status: opts.delivery ?? 'assigned', fee: 10, distance: 3, motoboyId: motoboy.userId, pin: '12345', pinRetirada: '54321' } as any,
    });
    await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } as any });
  }
  return { dono, outro, motoboy, store, order, delivery };
}
const ready = (id: string, who: any) => request(app).post(`/api/orders/${id}/ready`).set('Authorization', bearer(who)).send({});

describe('POST /api/orders/:id/ready', () => {
  it('grava readyAt e avisa SÓ o motoboy da entrega, sem PIN', async () => {
    const { dono, motoboy, store, order, delivery } = await cenario();
    const r = await ready(order.id, dono);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect((row as any).readyAt).toBeInstanceOf(Date);
    expect(new Date(r.body.data.readyAt).toISOString()).toBe((row as any).readyAt.toISOString());

    const calls = emit.mock.calls.filter((c) => c[1] === 'order:ready');
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe(`user:${motoboy.userId}`);
    expect(calls[0][2]).toMatchObject({ orderId: order.id, deliveryId: delivery.id, storeId: store.id, storeName: 'Loja P43' });
    const payload = JSON.stringify(calls[0][2]);
    expect(payload).not.toContain('12345');
    expect(payload).not.toContain('54321');
    expect(payload.toLowerCase()).not.toContain('pin');
  });

  it('segunda chamada: mesmo readyAt e nenhum aviso novo', async () => {
    const { dono, order } = await cenario();
    const r1 = await ready(order.id, dono);
    emit.mockReset();
    const r2 = await ready(order.id, dono);
    expect(r2.status).toBe(200);
    expect(r2.body.data.readyAt).toBe(r1.body.data.readyAt);
    expect(emit.mock.calls.filter((c) => c[1] === 'order:ready')).toHaveLength(0);
  });

  it('chamadas simultâneas gravam uma vez só', async () => {
    const { dono, order } = await cenario();
    const rs = await Promise.all([ready(order.id, dono), ready(order.id, dono)]);
    expect(rs.map((r) => r.status)).toEqual([200, 200]);
    expect(rs[0].body.data.readyAt).toBe(rs[1].body.data.readyAt);
    expect(emit.mock.calls.filter((c) => c[1] === 'order:ready')).toHaveLength(1);
  });

  it('sem motoboy atribuído (entrega já retirada ou Plano 1): grava e não emite', async () => {
    const a = await cenario({ delivery: 'picked' });
    expect((await ready(a.order.id, a.dono)).status).toBe(200);
    const b = await cenario({ delivery: 'none' });
    expect((await ready(b.order.id, b.dono)).status).toBe(200);
    expect(emit.mock.calls.filter((c) => c[1] === 'order:ready')).toHaveLength(0);
  });

  it('outro lojista → 403; pedido inexistente → 404', async () => {
    const { outro, order } = await cenario();
    expect((await ready(order.id, outro)).status).toBe(403);
    expect((await ready('nao-existe', outro)).status).toBe(404);
    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect((row as any).readyAt).toBeNull();
  });

  it('sem aceite, cancelado ou entregue → 409 ORDER_NOT_READYABLE', async () => {
    for (const opts of [{ accepted: false, status: 'criado' }, { status: 'cancelado' }, { status: 'entregue' }]) {
      const { dono, order } = await cenario(opts as any);
      const r = await ready(order.id, dono);
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe('ORDER_NOT_READYABLE');
    }
  });

  it('cliente → 403 (rota só de lojista)', async () => {
    const { order } = await cenario();
    const cliente = await createTestUser('cliente', DOMAIN);
    expect((await ready(order.id, cliente)).status).toBe(403);
  });
});
