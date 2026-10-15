/* eslint-env jest */
/** D2 · P1.6 — a hora real de cada etapa aparece no detalhe e no histórico (spec 5.1, item 2). */
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

const DOMAIN = '@d2p1horas.test';
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
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

it('GET /deliveries/:id (motoboy, em trânsito): assignedAt e pickedAt em ISO; deliveredAt e cancelledAt null', async () => {
  const pickedAt = minutesAgo(12);
  const c = await criarCorrida(DOMAIN, { status: 'picked', pickedAt });
  const row = await prisma.delivery.findUnique({ where: { id: c.deliveryId } });
  const res = await request(app).get(`/api/deliveries/${c.deliveryId}`).set('Authorization', bearer(c.motoboy));
  expect(res.status).toBe(200);
  expect(res.body.assignedAt).toMatch(ISO);
  expect(res.body.assignedAt).toBe(row!.assignedAt!.toISOString());
  expect(res.body.pickedAt).toBe(pickedAt.toISOString());
  expect(res.body.deliveredAt).toBeNull();
  expect(res.body.cancelledAt).toBeNull();
});

it('GET /deliveries/:id de corrida cancelada: cancelledAt em ISO', async () => {
  const c = await criarCorrida(DOMAIN, { status: 'picked' });
  const cancelledAt = minutesAgo(1);
  await prisma.delivery.update({ where: { id: c.deliveryId }, data: { status: 'cancelled', cancelledAt } });
  const res = await request(app).get(`/api/deliveries/${c.deliveryId}`).set('Authorization', bearer(c.motoboy));
  expect(res.status).toBe(200);
  expect(res.body.cancelledAt).toBe(cancelledAt.toISOString());
});

it('GET /deliveries/history: cada item traz assignedAt, pickedAt e deliveredAt', async () => {
  const c = await criarCorrida(DOMAIN, { status: 'picked' });
  const deliveredAt = minutesAgo(3);
  await prisma.delivery.update({ where: { id: c.deliveryId }, data: { status: 'delivered', deliveredAt } });
  const res = await request(app).get('/api/deliveries/history').set('Authorization', bearer(c.motoboy));
  expect(res.status).toBe(200);
  const item = (res.body as any[]).find((d) => d._id === c.deliveryId);
  expect(item).toBeDefined();
  expect(item.assignedAt).toMatch(ISO);
  expect(item.pickedAt).toMatch(ISO);
  expect(item.deliveredAt).toBe(deliveredAt.toISOString());
});
