/** O push de teste ("Avisos no celular" ligado) fala com o papel de quem ativou, não sempre de corridas. */
jest.mock('../services/pushService', () => {
  const actual = jest.requireActual('../services/pushService');
  return { __esModule: true, ...actual, isPushEnabled: jest.fn(() => true), sendPushToUser: jest.fn(async () => {}) };
});

import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { sendPushToUser } from '../services/pushService';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@opreal-pushteste.test';
const push = sendPushToUser as jest.Mock;

beforeEach(() => push.mockClear());
afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });
afterAll(async () => { await prisma.$disconnect(); });

it.each([
  ['cliente', '/pedidos', /pedido/i],
  ['motoboy', '/motoboy', /corridas/i],
  ['lojista', '/seller/dashboard', /pedidos da loja/i],
])('%s recebe o teste com o link e o texto do próprio painel', async (role, url, body) => {
  const user = await createTestUser(role, DOMAIN);
  const r = await request(app).post('/api/push/test').set('Authorization', bearer(user)).send({});
  expect(r.status).toBe(200);
  expect(push).toHaveBeenCalledWith(user.userId, expect.objectContaining({ url, body: expect.stringMatching(body) }));
});
