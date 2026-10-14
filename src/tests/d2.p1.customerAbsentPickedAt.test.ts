/** D2 · P1.7 — a espera do cliente ausente conta da retirada (pickedAt), não do updatedAt (spec 5.1, item 3). */
jest.mock('../utils/socketEmitter', () => {
  const actual = jest.requireActual('../utils/socketEmitter');
  return { __esModule: true, ...actual, emitToRoom: jest.fn(), emitAdminNotification: jest.fn() };
});

import request from 'supertest';
import app from '../app';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { snapshotPlatformConfig } from './helpers/pgCleanup';
import { bearer } from './helpers/authUser';
import { criarCorrida, limparCorridas, minutesAgo } from './helpers/motoboyRide';
import {
  customerAbsentWaitMinutes, customerAbsentWaitStart, customerAbsentAvailableAt, DEFAULT_CUSTOMER_ABSENT_WAIT_MIN,
} from '../utils/customerAbsent';

const DOMAIN = '@d2p1ausente.test';
const ORIGINAL_GATEWAY = env.PAYMENT_GATEWAY;
let restore: () => Promise<void>;
let since = new Date();
beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); (env as any).PAYMENT_GATEWAY = ORIGINAL_GATEWAY; });
beforeEach(async () => {
  since = new Date();
  (env as any).PAYMENT_GATEWAY = 'none';
  await updatePlatformConfig({
    settlementMode: 'custodia', customerAbsentWaitMin: 15,
    cancelFeeCustomerPercent: 10, cancelFeeStorePercent: 10, cancelFeeMotoboyPercent: 10, lateCancellationMotoboyShare: 50,
  } as any, 'test');
});
afterEach(async () => { await limparCorridas(DOMAIN, since); });

describe('regra pura', () => {
  const A = new Date('2026-10-14T15:00:00.000Z');
  const B = new Date('2026-10-14T15:20:00.000Z');

  it('a espera começa na retirada; sem pickedAt (entrega antiga) vale o updatedAt', () => {
    expect(customerAbsentWaitStart({ pickedAt: A, updatedAt: B }).toISOString()).toBe(A.toISOString());
    expect(customerAbsentWaitStart({ pickedAt: null, updatedAt: B }).toISOString()).toBe(B.toISOString());
  });

  it('libera em início + espera, e só com a entrega em picked', () => {
    expect(customerAbsentAvailableAt({ status: 'picked', pickedAt: A, updatedAt: B }, 15)?.toISOString()).toBe('2026-10-14T15:15:00.000Z');
    expect(customerAbsentAvailableAt({ status: 'assigned', pickedAt: null, updatedAt: B }, 15)).toBeNull();
    expect(customerAbsentAvailableAt({ status: 'cancelled', pickedAt: A, updatedAt: B }, 15)).toBeNull();
  });

  it('a espera vem da config; sem config vale 15; zero é um valor válido', () => {
    expect(customerAbsentWaitMinutes({ customerAbsentWaitMin: 20 })).toBe(20);
    expect(customerAbsentWaitMinutes({ customerAbsentWaitMin: 0 })).toBe(0);
    expect(customerAbsentWaitMinutes(null)).toBe(DEFAULT_CUSTOMER_ABSENT_WAIT_MIN);
    expect(DEFAULT_CUSTOMER_ABSENT_WAIT_MIN).toBe(15);
  });
});

describe('POST /deliveries/:id/cliente-ausente', () => {
  const ausente = (deliveryId: string, token: string) =>
    request(app).post(`/api/deliveries/${deliveryId}/cliente-ausente`).set('Authorization', token).send({ reason: 'Cliente não atende' });

  it('um PIN errado depois da retirada não reinicia a espera', async () => {
    const c = await criarCorrida(DOMAIN, { status: 'picked', pickedAt: minutesAgo(20), updatedAt: minutesAgo(20) });
    const wrong = await request(app).post(`/api/deliveries/${c.deliveryId}/finalizar`).set('Authorization', bearer(c.motoboy)).send({ pin: '00000' });
    expect(wrong.status).toBe(400);
    const row = await prisma.delivery.findUnique({ where: { id: c.deliveryId } });
    expect(Date.now() - row!.updatedAt.getTime()).toBeLessThan(60_000); // pré-condição: o PIN errado mexeu no updatedAt

    const res = await ausente(c.deliveryId, bearer(c.motoboy));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelado');
  });

  it('retirada recente com updatedAt antigo: a espera conta da retirada e ainda falta tempo', async () => {
    const c = await criarCorrida(DOMAIN, { status: 'picked', pickedAt: minutesAgo(2), updatedAt: minutesAgo(30) });
    const res = await ausente(c.deliveryId, bearer(c.motoboy));
    expect(res.status).toBe(400);
    expect(res.body.waitMinutesRequired).toBe(15);
    expect(res.body.remainingMs).toBeGreaterThan(12.5 * 60_000);
    expect(res.body.remainingMs).toBeLessThanOrEqual(13 * 60_000 + 5_000);
    expect((await prisma.order.findUnique({ where: { id: c.orderId } }))?.status).toBe('enviado');
  });

  it('entrega retirada antes da C2 (sem pickedAt): continua contando do updatedAt', async () => {
    const c = await criarCorrida(DOMAIN, { status: 'picked', pickedAt: null, updatedAt: minutesAgo(30) });
    const res = await ausente(c.deliveryId, bearer(c.motoboy));
    expect(res.status).toBe(200);
  });
});

describe('GET /deliveries/:id expõe a espera', () => {
  it('em trânsito: customerAbsentWaitMin e customerAbsentAvailableAt = pickedAt + espera', async () => {
    const pickedAt = minutesAgo(5);
    const c = await criarCorrida(DOMAIN, { status: 'picked', pickedAt });
    const res = await request(app).get(`/api/deliveries/${c.deliveryId}`).set('Authorization', bearer(c.motoboy));
    expect(res.status).toBe(200);
    expect(res.body.customerAbsentWaitMin).toBe(15);
    expect(res.body.customerAbsentAvailableAt).toBe(new Date(pickedAt.getTime() + 15 * 60_000).toISOString());
  });

  it('aguardando retirada: customerAbsentAvailableAt null', async () => {
    const c = await criarCorrida(DOMAIN, { status: 'assigned' });
    const res = await request(app).get(`/api/deliveries/${c.deliveryId}`).set('Authorization', bearer(c.motoboy));
    expect(res.body.customerAbsentWaitMin).toBe(15);
    expect(res.body.customerAbsentAvailableAt).toBeNull();
  });

  it('espera configurada em 0: libera na hora da retirada', async () => {
    await updatePlatformConfig({ customerAbsentWaitMin: 0 } as any, 'test');
    const pickedAt = minutesAgo(1);
    const c = await criarCorrida(DOMAIN, { status: 'picked', pickedAt });
    const res = await request(app).get(`/api/deliveries/${c.deliveryId}`).set('Authorization', bearer(c.motoboy));
    expect(res.body.customerAbsentWaitMin).toBe(0);
    expect(res.body.customerAbsentAvailableAt).toBe(pickedAt.toISOString());
  });
});
