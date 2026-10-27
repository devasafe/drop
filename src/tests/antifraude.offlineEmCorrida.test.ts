/* eslint-env jest */
/** Antifraude · com entrega em andamento o motoboy não sai do ar. */
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

const DOMAIN = '@antifraude-offline.test';
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

const online = (id: string) => prisma.user.findUnique({ where: { id }, select: { isOnline: true } }).then((u) => u!.isOnline);

it.each(['assigned', 'picked'] as const)('corrida %s: ficar offline é recusado (409) e ele continua online', async (status) => {
  const c = await criarCorrida(DOMAIN, { status });
  await prisma.user.update({ where: { id: c.motoboy.userId }, data: { isOnline: true } });
  const res = await request(app).post('/api/deliveries/availability').set('Authorization', bearer(c.motoboy)).send({ isOnline: false });
  expect(res.status).toBe(409);
  expect(res.body).toEqual({ error: 'Termine a entrega antes de ficar offline.', code: 'RIDE_IN_PROGRESS' });
  expect(await online(c.motoboy.userId)).toBe(true);

  // O envio de posição também não tira do ar.
  await request(app).post('/api/deliveries/location').set('Authorization', bearer(c.motoboy)).send({ lat: -23.5, lng: -46.6, isOnline: false });
  expect(await online(c.motoboy.userId)).toBe(true);
});

it('sem corrida em andamento, fica offline normalmente', async () => {
  const c = await criarCorrida(DOMAIN, { status: 'pending' });
  await prisma.user.update({ where: { id: c.motoboy.userId }, data: { isOnline: true } });
  const res = await request(app).post('/api/deliveries/availability').set('Authorization', bearer(c.motoboy)).send({ isOnline: false });
  expect(res.status).toBe(200);
  expect(await online(c.motoboy.userId)).toBe(false);
});
