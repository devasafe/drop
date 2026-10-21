/**
 * Pendência A da D3b-1 — a corrida devolvida ao pool pelo admin (reassign) não avisa o motoboy
 * excluído: nem o socket `delivery:created`/`delivery:available`, nem o Web Push. Os demais
 * motoboys online recebem como antes, e a entrega sem excluídos avisa todo mundo.
 */
process.env.VAPID_PUBLIC_KEY = 'pub-teste';
process.env.VAPID_PRIVATE_KEY = 'priv-teste';
jest.mock('web-push', () => ({
  __esModule: true,
  default: { setVapidDetails: jest.fn(), sendNotification: jest.fn().mockResolvedValue({}) },
}));
jest.mock('../services/storeNotify', () => {
  const actual = jest.requireActual('../services/storeNotify');
  return { __esModule: true, ...actual, notifyStore: jest.fn().mockResolvedValue(undefined) };
});

import http from 'http';
import { AddressInfo } from 'net';
import webpush from 'web-push';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import app from '../app';
import { prisma } from '../lib/prisma';
import { initSocket } from '../services/notifier';
import { createTestUser, TestUser } from './helpers/authUser';
import { criarCorrida, limparCorridas } from './helpers/motoboyRide';
import { adminReassignDelivery } from '../services/adminOps/reassign';
import { emitDeliveryCreated, emitToRoom } from '../utils/socketEmitter';
import { runDeliveryTimeout } from '../jobs/deliveryTimeout.job';

jest.setTimeout(30000);

const DOMAIN = '@d3b1penda.test';
const sendNotification = (webpush as any).sendNotification as jest.Mock;

let server: http.Server;
let url: string;
let ioServer: ReturnType<typeof initSocket>;
let since = new Date();
let ceo: TestUser;
const clients: ClientSocket[] = [];

beforeAll(async () => {
  server = http.createServer(app);
  ioServer = initSocket(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => ioServer.close(() => resolve()));
  await prisma.$disconnect();
});
beforeEach(async () => {
  since = new Date();
  sendNotification.mockClear();
  ceo = await createTestUser('ceo', DOMAIN);
});
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  const users = await prisma.user.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } });
  await prisma.pushSubscription.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await prisma.notification.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await limparCorridas(DOMAIN, since);
});

const connect = (token: string) =>
  new Promise<ClientSocket>((resolve, reject) => {
    const c = ioClient(url, { auth: { token }, transports: ['websocket'], forceNew: true });
    clients.push(c);
    c.on('connect', () => resolve(c));
    c.on('connect_error', reject);
  });

const next = (c: ClientSocket, event: string, ms = 800) =>
  new Promise<any>((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    c.once(event, (payload: any) => { clearTimeout(t); resolve(payload); });
  });

const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));

/** Motoboy online com inscrição de push; retorna o usuário e o endpoint da inscrição. */
async function motoboyOnline(label: string) {
  const u = await createTestUser('motoboy', DOMAIN);
  await prisma.user.update({ where: { id: u.userId }, data: { isOnline: true } });
  const endpoint = `https://push.test/${label}-${u.userId}`;
  await prisma.pushSubscription.create({ data: { userId: u.userId, endpoint, p256dh: 'p', auth: 'a' } });
  return { u, endpoint };
}

/** Endpoints que receberam o push de corrida nova (o aviso "passada para outro motoboy" é outro push). */
const pushedEndpoints = () =>
  sendNotification.mock.calls
    .filter((c) => JSON.parse(c[1]).tag === 'nova-corrida')
    .map((c) => c[0].endpoint as string);
const waitPush = async (min: number) => {
  for (let i = 0; i < 30 && sendNotification.mock.calls.length < min; i++) await settle(100);
  await settle(200);
};

it('reassign: o motoboy retirado não recebe o aviso de corrida nova (socket nem push); o outro online recebe', async () => {
  const r = await criarCorrida(DOMAIN, { status: 'assigned' });
  await prisma.user.update({ where: { id: r.motoboy.userId }, data: { isOnline: true } });
  await prisma.pushSubscription.create({
    data: { userId: r.motoboy.userId, endpoint: `https://push.test/fora-${r.motoboy.userId}`, p256dh: 'p', auth: 'a' },
  });
  const outro = await motoboyOnline('outro');
  const fora = await connect(r.motoboy.token);
  const dentro = await connect(outro.u.token);
  await settle();

  // Prova de que o excluído ESTÁ na sala motoboys: sem o except, ele receberia.
  const foraSonda = next(fora, 'sonda');
  const dentroSonda = next(dentro, 'sonda');
  emitToRoom('motoboys', 'sonda', { ok: true });
  expect(await foraSonda).toEqual({ ok: true });
  expect(await dentroSonda).toEqual({ ok: true });

  const foraCreated = next(fora, 'delivery:created');
  const foraAvail = next(fora, 'delivery:available');
  const dentroCreated = next(dentro, 'delivery:created');
  const dentroAvail = next(dentro, 'delivery:available');
  await adminReassignDelivery({ orderId: r.orderId, reason: 'Motoboy parado na rua', actor: { id: ceo.userId, role: 'ceo' } });

  expect(await dentroCreated).toMatchObject({ deliveryId: r.deliveryId });
  expect(await dentroAvail).toMatchObject({ deliveryId: r.deliveryId });
  expect(await foraCreated).toBeNull();
  expect(await foraAvail).toBeNull();

  await waitPush(1);
  const eps = pushedEndpoints();
  expect(eps).toContain(outro.endpoint);
  expect(eps.some((e) => e.includes(`fora-${r.motoboy.userId}`))).toBe(false);
});

it('entrega sem excluídos: todos os motoboys online recebem socket e push, como antes', async () => {
  const a = await motoboyOnline('a');
  const b = await motoboyOnline('b');
  const ca = await connect(a.u.token);
  const cb = await connect(b.u.token);
  await settle();

  const ga = next(ca, 'delivery:created');
  const gb = next(cb, 'delivery:created');
  emitDeliveryCreated({ _id: 'entrega-x', orderId: 'pedido-x', distance: 3, fee: 8, createdAt: new Date() });
  expect(await ga).toMatchObject({ deliveryId: 'entrega-x' });
  expect(await gb).toMatchObject({ deliveryId: 'entrega-x' });

  await waitPush(2);
  expect(pushedEndpoints()).toEqual(expect.arrayContaining([a.endpoint, b.endpoint]));
});

it('fim do prazo de retirada: o aviso de corrida nova (notification) não vai a quem já estava excluído', async () => {
  const r = await criarCorrida(DOMAIN, { status: 'assigned', updatedAt: new Date(Date.now() - 60 * 60_000) });
  const excluido = await motoboyOnline('excluido');
  const outro = await motoboyOnline('outro2');
  await prisma.delivery.update({ where: { id: r.deliveryId }, data: { excludedMotoboyIds: [excluido.u.userId], updatedAt: new Date(Date.now() - 60 * 60_000) } as any });
  const cEx = await connect(excluido.u.token);
  const cOut = await connect(outro.u.token);
  await settle();

  const gotEx = next(cEx, 'notification');
  const gotOut = next(cOut, 'notification');
  await runDeliveryTimeout();

  expect(await gotOut).toMatchObject({ type: 'new_delivery', delivery: { id: r.deliveryId } });
  expect(await gotEx).toBeNull();
});
