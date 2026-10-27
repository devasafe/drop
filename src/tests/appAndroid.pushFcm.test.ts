/** Push do app Android (FCM): inscrição pelo token do Firebase e envio pelo firebase-admin. */
const mockSend = jest.fn();
jest.mock('firebase-admin/app', () => ({ cert: jest.fn(() => ({})), getApps: jest.fn(() => []), initializeApp: jest.fn(() => ({})) }));
jest.mock('firebase-admin/messaging', () => ({ getMessaging: jest.fn(() => ({ send: mockSend })) }));

// A credencial é lida quando o pushService carrega: precisa existir antes do require do app.
process.env.FIREBASE_SERVICE_ACCOUNT = Buffer.from(JSON.stringify({ project_id: 'drop-test' })).toString('base64');

import request from 'supertest';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const app = require('../app').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sendPushToUser, isFcmEnabled } = require('../services/pushService');

const DOMAIN = '@app-android-push.test';
const TOKEN = 'dQw4w9WgXcQ:APA91bH_token-de-teste_0123456789abcdefghijklmnopqrstuvwxyz';

beforeEach(() => mockSend.mockReset());
afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });
afterAll(() => { delete process.env.FIREBASE_SERVICE_ACCOUNT; });

it('com a credencial no ambiente, o FCM liga', () => {
  expect(isFcmEnabled()).toBe(true);
});

it('o app registra o token; reinscrever o mesmo aparelho em outra conta troca o dono', async () => {
  const a = await createTestUser('motoboy', DOMAIN);
  const b = await createTestUser('cliente', DOMAIN);
  const r1 = await request(app).post('/api/push/subscribe').set('Authorization', bearer(a)).send({ platform: 'fcm', token: TOKEN });
  expect(r1.status).toBe(200);
  let row = await prisma.pushSubscription.findUnique({ where: { endpoint: `fcm:${TOKEN}` } });
  expect(row).toMatchObject({ userId: a.userId, platform: 'fcm', p256dh: null, auth: null });

  await request(app).post('/api/push/subscribe').set('Authorization', bearer(b)).send({ platform: 'fcm', token: TOKEN });
  row = await prisma.pushSubscription.findUnique({ where: { endpoint: `fcm:${TOKEN}` } });
  expect(row!.userId).toBe(b.userId);
});

it('token inválido ou endpoint web disfarçado de fcm são recusados', async () => {
  const u = await createTestUser('cliente', DOMAIN);
  const bad = await request(app).post('/api/push/subscribe').set('Authorization', bearer(u)).send({ platform: 'fcm', token: 'a b' });
  expect(bad.status).toBe(400);
  const disguised = await request(app).post('/api/push/subscribe').set('Authorization', bearer(u))
    .send({ endpoint: `fcm:${TOKEN}`, keys: { p256dh: 'x', auth: 'y' } });
  expect(disguised.status).toBe(400);
});

it('corrida nova sai no canal "corridas" com o link nos dados; os outros avisos no canal "avisos"', async () => {
  const u = await createTestUser('motoboy', DOMAIN);
  await prisma.pushSubscription.create({ data: { userId: u.userId, endpoint: `fcm:${TOKEN}`, platform: 'fcm' } });
  mockSend.mockResolvedValue('msg-1');

  await sendPushToUser(u.userId, { title: 'Nova corrida', body: 'R$ 9,00', url: '/motoboy', tag: 'nova-corrida' });
  expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
    token: TOKEN,
    notification: { title: 'Nova corrida', body: 'R$ 9,00' },
    data: { url: '/motoboy', tag: 'nova-corrida' },
    android: expect.objectContaining({ priority: 'high', notification: expect.objectContaining({ channelId: 'corridas' }) }),
  }));

  await sendPushToUser(u.userId, { title: 'Pedido a caminho', body: '...', url: '/pedido/1', tag: 'pedido-1' });
  expect(mockSend.mock.calls[1][0].android.notification.channelId).toBe('avisos');
});

it('token que o Firebase não reconhece mais é apagado', async () => {
  const u = await createTestUser('cliente', DOMAIN);
  await prisma.pushSubscription.create({ data: { userId: u.userId, endpoint: `fcm:${TOKEN}`, platform: 'fcm' } });
  mockSend.mockRejectedValue(Object.assign(new Error('gone'), { code: 'messaging/registration-token-not-registered' }));

  await sendPushToUser(u.userId, { title: 't', body: 'b' });
  expect(await prisma.pushSubscription.count({ where: { userId: u.userId } })).toBe(0);
});
