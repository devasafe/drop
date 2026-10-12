/** D1 · P4.2 — prazo do aceite: helper puro, job e painel usam o MESMO relógio. */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import {
  acceptDeadline, isAwaitingStoreAccept, storeAcceptTimeoutMin, DEFAULT_STORE_ACCEPT_TIMEOUT_MIN,
} from '../utils/acceptDeadline';

const DOMAIN = '@d1p42.test';
const MIN = 60 * 1000;
const minAgo = (m: number) => new Date(Date.now() - m * MIN);

describe('acceptDeadline (puro)', () => {
  it('conta do paidAt', () => {
    const paidAt = new Date('2026-10-12T15:00:00Z');
    const createdAt = new Date('2026-10-12T14:40:00Z');
    expect(acceptDeadline({ paidAt, createdAt }, 10).toISOString()).toBe('2026-10-12T15:10:00.000Z');
  });
  it('sem paidAt (pedido antigo) conta do createdAt', () => {
    const createdAt = new Date('2026-10-12T14:40:00Z');
    expect(acceptDeadline({ paidAt: null, createdAt }, 7).toISOString()).toBe('2026-10-12T14:47:00.000Z');
    expect(acceptDeadline({ createdAt }, 7).toISOString()).toBe('2026-10-12T14:47:00.000Z');
  });
  it('timeout da config, com default 10', () => {
    expect(DEFAULT_STORE_ACCEPT_TIMEOUT_MIN).toBe(10);
    expect(storeAcceptTimeoutMin(null)).toBe(10);
    expect(storeAcceptTimeoutMin({ storeAcceptTimeoutMin: 4 })).toBe(4);
  });
  it('aguarda aceite = pago, sem acceptedAt e status criado/pago (igual ao filtro do job)', () => {
    expect(isAwaitingStoreAccept({ paymentStatus: 'paid', acceptedAt: null, status: 'criado' })).toBe(true);
    expect(isAwaitingStoreAccept({ paymentStatus: 'paid', acceptedAt: null, status: 'pago' })).toBe(true);
    expect(isAwaitingStoreAccept({ paymentStatus: 'pending', acceptedAt: null, status: 'criado' })).toBe(false);
    expect(isAwaitingStoreAccept({ paymentStatus: 'paid', acceptedAt: new Date(), status: 'pago' })).toBe(false);
    expect(isAwaitingStoreAccept({ paymentStatus: 'paid', acceptedAt: null, status: 'cancelado' })).toBe(false);
  });
});

describe('GET /api/stores/dashboard — acceptDeadline e readyAt', () => {
  let restore: () => Promise<void>;
  beforeAll(async () => { restore = await snapshotPlatformConfig(); });
  afterAll(async () => { await restore(); await prisma.$disconnect(); });
  beforeEach(async () => { await updatePlatformConfig({ storeAcceptTimeoutMin: 10 } as any, 'test'); });
  afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });

  it('pedido pago aguardando aceite traz o prazo = paidAt + timeout; aceito traz null', async () => {
    const dono = await createTestUser('lojista', DOMAIN);
    const cliente = await createTestUser('cliente', DOMAIN);
    const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja P42', isOpen: true } });
    const paidAt = minAgo(3);
    const aguardando = await prisma.order.create({
      data: { customerId: cliente.userId, storeId: store.id, totalValue: 30, deliveryFee: 0, paymentMethod: 'pix', status: 'criado', paymentStatus: 'paid', paidAt, createdAt: minAgo(20) } as any,
    });
    const aceito = await prisma.order.create({
      data: { customerId: cliente.userId, storeId: store.id, totalValue: 30, deliveryFee: 0, paymentMethod: 'pix', status: 'pago', paymentStatus: 'paid', paidAt, acceptedAt: minAgo(1) } as any,
    });

    const r = await request(app).get('/api/stores/dashboard').set('Authorization', bearer(dono));
    expect(r.status).toBe(200);
    const a = r.body.orders.find((o: any) => o._id === aguardando.id);
    const b = r.body.orders.find((o: any) => o._id === aceito.id);
    expect(a.acceptDeadline).toBe(new Date(paidAt.getTime() + 10 * MIN).toISOString());
    expect(b.acceptDeadline).toBeNull();
    expect(a).toHaveProperty('readyAt', null);
  });

  it('o prazo muda com a config (nunca 5 min fixo)', async () => {
    await updatePlatformConfig({ storeAcceptTimeoutMin: 7 } as any, 'test');
    const dono = await createTestUser('lojista', DOMAIN);
    const cliente = await createTestUser('cliente', DOMAIN);
    const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja P42b', isOpen: true } });
    const paidAt = minAgo(1);
    const o = await prisma.order.create({
      data: { customerId: cliente.userId, storeId: store.id, totalValue: 10, deliveryFee: 0, paymentMethod: 'pix', status: 'criado', paymentStatus: 'paid', paidAt } as any,
    });
    const r = await request(app).get('/api/stores/dashboard').set('Authorization', bearer(dono));
    const a = r.body.orders.find((x: any) => x._id === o.id);
    expect(a.acceptDeadline).toBe(new Date(paidAt.getTime() + 7 * MIN).toISOString());
  });
});
