/** GPS do app Android: o POST /deliveries/location também repassa a posição da corrida ao cliente e à loja. */
jest.mock('../services/notifier', () => {
  const actual = jest.requireActual('../services/notifier');
  return { __esModule: true, ...actual, default: actual.default, relayActiveRidesLocation: jest.fn(async () => undefined) };
});

import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { relayActiveRidesLocation } from '../services/notifier';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@app-android-gps.test';
const relay = relayActiveRidesLocation as jest.Mock;

beforeEach(() => relay.mockClear());
afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });

it('grava a posição e repassa às corridas em andamento, com a precisão', async () => {
  const m = await createTestUser('motoboy', DOMAIN);
  const r = await request(app).post('/api/deliveries/location').set('Authorization', bearer(m))
    .send({ lat: -23.55, lng: -46.63, isOnline: true, accuracy: 12 });
  expect(r.status).toBe(200);
  expect(relay).toHaveBeenCalledWith(m.userId, { latitude: -23.55, longitude: -46.63, accuracy: 12 });
  const me = await prisma.user.findUnique({ where: { id: m.userId }, select: { currentLocation: true, isOnline: true } });
  expect(me!.isOnline).toBe(true);
  expect((me!.currentLocation as any).lat).toBe(-23.55);
});

it('coordenada inválida não grava nem repassa', async () => {
  const m = await createTestUser('motoboy', DOMAIN);
  const r = await request(app).post('/api/deliveries/location').set('Authorization', bearer(m)).send({ lat: 200, lng: 0 });
  expect(r.status).toBe(400);
  expect(relay).not.toHaveBeenCalled();
});
