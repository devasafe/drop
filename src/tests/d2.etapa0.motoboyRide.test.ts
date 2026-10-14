/**
 * D2 · Etapa 0 — rede do backend para as ações do motoboy que o redesign vai religar:
 * aceite, finalizar com PIN (certo, errado, travado), cliente ausente (antes e depois da
 * espera) e devolver a corrida. Teste de comportamento da Etapa 0: intocável.
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
import { snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { criarCorrida, limparCorridas, minutesAgo, RIDE_PIN_ENTREGA } from './helpers/motoboyRide';

const DOMAIN = '@d2etapa0.test';
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

const post = (path: string, u: TestUser, body: Record<string, unknown> = {}) =>
  request(app).post(`/api/deliveries/${path}`).set('Authorization', bearer(u)).send(body);
const entrega = (id: string) => prisma.delivery.findUnique({ where: { id } });
const pedido = (id: string) => prisma.order.findUnique({ where: { id } });

describe('Etapa 0 · aceite', () => {
  it('o motoboy aceita: 200, entrega assigned com assignedAt, resposta com pinRetirada e sem o PIN do cliente', async () => {
    const c = await criarCorrida(DOMAIN, { status: 'pending' });
    const res = await post(`${c.deliveryId}/claim`, c.motoboy);
    expect(res.status).toBe(200);
    expect(res.body.pinRetirada).toMatch(/^\d{5}$/);
    expect(res.body.pin).toBeUndefined();
    const d = await entrega(c.deliveryId);
    expect(d?.status).toBe('assigned');
    expect(d?.motoboyId).toBe(c.motoboy.userId);
    expect(d?.assignedAt).toBeTruthy();
  });

  it('outro motoboy tenta a corrida já aceita: 409 com a mensagem de sempre e a corrida continua do primeiro', async () => {
    const c = await criarCorrida(DOMAIN, { status: 'assigned' });
    const outro = await createTestUser('motoboy', DOMAIN);
    const res = await post(`${c.deliveryId}/claim`, outro);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Already claimed or not available');
    expect((await entrega(c.deliveryId))?.motoboyId).toBe(c.motoboy.userId);
  });

  it('pedido cancelado: 409 ORDER_CLOSED e a entrega continua no pool', async () => {
    const c = await criarCorrida(DOMAIN, { status: 'pending', orderStatus: 'cancelado' });
    const res = await post(`${c.deliveryId}/claim`, c.motoboy);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ORDER_CLOSED');
    const d = await entrega(c.deliveryId);
    expect(d?.status).toBe('pending');
    expect(d?.motoboyId).toBeNull();
  });
});

describe('Etapa 0 · finalizar com o PIN do cliente', () => {
  it('PIN errado: 400 "PIN inválido", entrega continua picked e o PIN não volta', async () => {
    const c = await criarCorrida(DOMAIN, { status: 'picked' });
    const res = await post(`${c.deliveryId}/finalizar`, c.motoboy, { pin: '00000' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('PIN inválido');
    expect(JSON.stringify(res.body)).not.toContain(RIDE_PIN_ENTREGA);
    expect((await entrega(c.deliveryId))?.status).toBe('picked');
  });

  it('5 PINs errados travam: a tentativa seguinte, mesmo com o PIN certo, responde 429 PIN_LOCKED', async () => {
    const c = await criarCorrida(DOMAIN, { status: 'picked' });
    for (let i = 0; i < 5; i++) {
      expect((await post(`${c.deliveryId}/finalizar`, c.motoboy, { pin: '00000' })).status).toBe(400);
    }
    const res = await post(`${c.deliveryId}/finalizar`, c.motoboy, { pin: RIDE_PIN_ENTREGA });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('PIN_LOCKED');
    expect(res.body.error).toMatch(/Muitas tentativas de PIN/);
    expect((await entrega(c.deliveryId))?.status).toBe('picked');
  });

  it('PIN certo: 200 e a entrega vai para delivered com deliveredAt', async () => {
    const c = await criarCorrida(DOMAIN, { status: 'picked' });
    const res = await post(`${c.deliveryId}/finalizar`, c.motoboy, { pin: RIDE_PIN_ENTREGA });
    expect(res.status).toBe(200);
    const d = await entrega(c.deliveryId);
    expect(d?.status).toBe('delivered');
    expect(d?.deliveredAt).toBeTruthy();
  });

  it('antes da retirada (assigned): 400 e nada muda', async () => {
    const c = await criarCorrida(DOMAIN, { status: 'assigned' });
    const res = await post(`${c.deliveryId}/finalizar`, c.motoboy, { pin: RIDE_PIN_ENTREGA });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Retirada ainda não validada pela loja');
    expect((await entrega(c.deliveryId))?.status).toBe('assigned');
  });
});

describe('Etapa 0 · cliente ausente', () => {
  it('antes da espera: 400 com waitMinutesRequired e remainingMs, e nada é cancelado', async () => {
    const c = await criarCorrida(DOMAIN, { status: 'picked', pickedAt: minutesAgo(2), updatedAt: minutesAgo(2) });
    const res = await post(`${c.deliveryId}/cliente-ausente`, c.motoboy, { reason: 'Cliente não atende' });
    expect(res.status).toBe(400);
    expect(res.body.waitMinutesRequired).toBe(15);
    expect(res.body.remainingMs).toBeGreaterThan(12 * 60_000);
    expect(res.body.remainingMs).toBeLessThanOrEqual(13 * 60_000 + 5_000);
    expect((await pedido(c.orderId))?.status).toBe('enviado');
    expect((await entrega(c.deliveryId))?.status).toBe('picked');
  });

  it('depois da espera: 200, pedido cancelado e entrega cancelada com código de devolução', async () => {
    const c = await criarCorrida(DOMAIN, { status: 'picked', pickedAt: minutesAgo(30), updatedAt: minutesAgo(30) });
    const res = await post(`${c.deliveryId}/cliente-ausente`, c.motoboy, { reason: 'Cliente não atende' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelado');
    expect(res.body.pinDevolucao).toMatch(/^\d{6}$/);
    expect((await pedido(c.orderId))?.status).toBe('cancelado');
    const d = await entrega(c.deliveryId);
    expect(d?.status).toBe('cancelled');
    expect(d?.statusDevolucao).toBe('aguardando_confirmacao');
  });

  it('outro motoboy: 403 e nada muda', async () => {
    const c = await criarCorrida(DOMAIN, { status: 'picked', pickedAt: minutesAgo(30), updatedAt: minutesAgo(30) });
    const outro = await createTestUser('motoboy', DOMAIN);
    const res = await post(`${c.deliveryId}/cliente-ausente`, outro, { reason: 'x' });
    expect(res.status).toBe(403);
    expect((await pedido(c.orderId))?.status).toBe('enviado');
  });
});

describe('Etapa 0 · devolver a corrida', () => {
  it('antes de retirar (assigned): 200 e a entrega volta ao pool sem motoboy e sem PINs', async () => {
    const c = await criarCorrida(DOMAIN, { status: 'assigned' });
    const res = await post(`${c.deliveryId}/reject`, c.motoboy, {
      reason: 'Problema pessoal ou técnico', action: 'reassign', reasonCode: 'motoboy_unavailable',
    });
    expect(res.status).toBe(200);
    const d = await entrega(c.deliveryId);
    expect(d?.status).toBe('pending');
    expect(d?.motoboyId).toBeNull();
    expect(d?.pin).toBeNull();
    expect(d?.pinRetirada).toBeNull();
  });

  it('depois de retirar (picked): 202 com pinDevolucao de 6 dígitos e a entrega aguarda a loja', async () => {
    const c = await criarCorrida(DOMAIN, { status: 'picked' });
    const res = await post(`${c.deliveryId}/reject`, c.motoboy, {
      reason: 'Não consigo chegar ao local', action: 'reassign', reasonCode: 'delivery_failed',
    });
    expect(res.status).toBe(202);
    expect(res.body.pinDevolucao).toMatch(/^\d{6}$/);
    const d = await entrega(c.deliveryId);
    expect(d?.status).toBe('picked');
    expect(d?.statusDevolucao).toBe('aguardando_confirmacao');
    expect(d?.pinDevolucao).toBe(res.body.pinDevolucao);
  });
});
