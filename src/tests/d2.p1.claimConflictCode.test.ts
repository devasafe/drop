/* eslint-env jest */
/** D2 · P1.5 — o 409 do aceite diz POR QUE a corrida foi perdida (spec 5.1, item 1). */
jest.mock('../utils/socketEmitter', () => {
  const actual = jest.requireActual('../utils/socketEmitter');
  return { __esModule: true, ...actual, emitToRoom: jest.fn(), emitAdminNotification: jest.fn() };
});

import request from 'supertest';
import app from '../app';
import env from '../config/env';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import { criarCorrida, limparCorridas } from './helpers/motoboyRide';

const DOMAIN = '@d2p1claim.test';
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

const ALREADY = { error: 'Already claimed or not available', code: 'ALREADY_CLAIMED' };

it('corrida já aceita por outro motoboy: 409 ALREADY_CLAIMED com a mensagem de sempre', async () => {
  const c = await criarCorrida(DOMAIN, { status: 'assigned' });
  const outro = await createTestUser('motoboy', DOMAIN);
  const res = await request(app).post(`/api/deliveries/${c.deliveryId}/claim`).set('Authorization', bearer(outro)).send({});
  expect(res.status).toBe(409);
  expect(res.body).toEqual(ALREADY);
});

it('corrida que não existe mais: 409 ALREADY_CLAIMED', async () => {
  const m = await createTestUser('motoboy', DOMAIN);
  const res = await request(app).post('/api/deliveries/d2-nao-existe/claim').set('Authorization', bearer(m)).send({});
  expect(res.status).toBe(409);
  expect(res.body).toEqual(ALREADY);
});

it('pedido cancelado continua 409 ORDER_CLOSED com a mensagem de sempre', async () => {
  const c = await criarCorrida(DOMAIN, { status: 'pending', orderStatus: 'cancelado' });
  const res = await request(app).post(`/api/deliveries/${c.deliveryId}/claim`).set('Authorization', bearer(c.motoboy)).send({});
  expect(res.status).toBe(409);
  expect(res.body).toEqual({ error: 'Pedido cancelado; a corrida não está mais disponível', code: 'ORDER_CLOSED' });
});
