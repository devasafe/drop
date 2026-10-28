/* eslint-env jest */
/** Antifraude · motoboy novo: nas primeiras 20 entregas só pega pedido de até R$ 150 (produtos). */
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
import { criarCorrida, limparCorridas } from './helpers/motoboyRide';
import { blockedOnlineNewCouriers, NEW_COURIER_DELIVERIES } from '../services/courierTrust';

const DOMAIN = '@antifraude-novo.test';
const ORIGINAL_GATEWAY = env.PAYMENT_GATEWAY;
let restore: () => Promise<void>;
let since = new Date();
beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); (env as any).PAYMENT_GATEWAY = ORIGINAL_GATEWAY; });
beforeEach(async () => {
  since = new Date();
  (env as any).PAYMENT_GATEWAY = 'none';
  await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');
});
afterEach(async () => { await limparCorridas(DOMAIN, since); });

async function corridaDe(valorProdutos: number) {
  const c = await criarCorrida(DOMAIN, { status: 'pending' });
  await prisma.order.update({ where: { id: c.orderId }, data: { subtotal: valorProdutos, totalValue: valorProdutos + 10 } });
  await prisma.user.update({ where: { id: c.motoboy.userId }, data: { isOnline: true, currentLocation: { lat: -23.55, lng: -46.63, updatedAt: new Date() } } });
  return c;
}

const entregasFeitas = (motoboyId: string, n: number) => prisma.delivery.createMany({
  data: Array.from({ length: n }, (_, i) => ({ orderId: `acd-novo-${motoboyId}-${i}`, motoboyId, status: 'delivered' as const, fee: 8 })),
});

it('motoboy novo não pega pedido de R$ 151, e a resposta não conta a regra', async () => {
  const c = await corridaDe(151);
  const res = await request(app).post(`/api/deliveries/${c.deliveryId}/claim`).set('Authorization', bearer(c.motoboy)).send({});
  expect(res.status).toBe(409);
  expect(res.body).toEqual({ error: 'Esta corrida não está mais disponível para você.', code: 'DELIVERY_NOT_AVAILABLE' });
  expect((await prisma.delivery.findUnique({ where: { id: c.deliveryId } }))!.status).toBe('pending');
});

it('motoboy novo pega pedido de exatamente R$ 150', async () => {
  const c = await corridaDe(150);
  const res = await request(app).post(`/api/deliveries/${c.deliveryId}/claim`).set('Authorization', bearer(c.motoboy)).send({});
  expect(res.status).toBe(200);
});

it('com 20 entregas feitas o limite sai', async () => {
  const c = await corridaDe(900);
  await entregasFeitas(c.motoboy.userId, NEW_COURIER_DELIVERIES);
  const res = await request(app).post(`/api/deliveries/${c.deliveryId}/claim`).set('Authorization', bearer(c.motoboy)).send({});
  expect(res.status).toBe(200);
});

it('a lista de ofertas esconde o pedido caro do motoboy novo sem contar a regra', async () => {
  const c = await corridaDe(400);
  const res = await request(app).get('/api/deliveries/available').set('Authorization', bearer(c.motoboy));
  expect(res.status).toBe(200);
  expect(res.body.deliveries.map((d: any) => String(d._id ?? d.id))).not.toContain(c.deliveryId);
  expect(res.body).not.toHaveProperty('newCourier');
});

it('o aviso de corrida nova não vai para o motoboy novo quando o pedido é caro', async () => {
  const caro = await corridaDe(400);
  expect(await blockedOnlineNewCouriers(caro.orderId)).toContain(caro.motoboy.userId);
  const barato = await corridaDe(80);
  expect(await blockedOnlineNewCouriers(barato.orderId)).toEqual([]);
});

it('o limite vale para a soma das corridas abertas: com uma de R$ 100 em andamento, outra de R$ 100 é recusada', async () => {
  const a = await corridaDe(100);
  const ok = await request(app).post(`/api/deliveries/${a.deliveryId}/claim`).set('Authorization', bearer(a.motoboy)).send({});
  expect(ok.status).toBe(200);
  const b = await corridaDe(100);
  const res = await request(app).post(`/api/deliveries/${b.deliveryId}/claim`).set('Authorization', bearer(a.motoboy)).send({});
  expect(res.status).toBe(409);
  expect(res.body.code).toBe('DELIVERY_NOT_AVAILABLE');
});

it('dois aceites simultâneos de R$ 100: só um passa', async () => {
  const a = await corridaDe(100);
  const b = await corridaDe(100);
  const [r1, r2] = await Promise.all([
    request(app).post(`/api/deliveries/${a.deliveryId}/claim`).set('Authorization', bearer(a.motoboy)).send({}),
    request(app).post(`/api/deliveries/${b.deliveryId}/claim`).set('Authorization', bearer(a.motoboy)).send({}),
  ]);
  expect([r1.status, r2.status].sort()).toEqual([200, 409]);
});
