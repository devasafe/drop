/**
 * D3b-1 · P1.7 — admin:order_changed (spec 4.4, estendida pelo controlador): chega à sala admin só com
 * { orderId, status, at } e não chega a um cliente, nem pedindo join. Cada emissor de mudança de pedido ou
 * de corrida, e os jobs de timeout que não passam por eles, avisam a sala admin.
 */
jest.mock('../services/storeNotify', () => {
  const actual = jest.requireActual('../services/storeNotify');
  return { __esModule: true, ...actual, notifyStore: jest.fn().mockResolvedValue(undefined) };
});

import http from 'http';
import { AddressInfo } from 'net';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import app from '../app';
import { prisma } from '../lib/prisma';
import { initSocket } from '../services/notifier';
import { createTestUser, TestUser } from './helpers/authUser';
import { snapshotPlatformConfig } from './helpers/pgCleanup';
import { createOpsStore, createOpsOrder, cleanupOpsFixtures } from './helpers/d3b1Ops';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { runPoolTimeout } from '../jobs/poolTimeout.job';
import { runDeliveryTimeout } from '../jobs/deliveryTimeout.job';
import {
  emitAdminOrderChanged, emitOrderCreated, emitOrderStatusChanged, emitOrderCancelled, emitOrderRejectedByStore,
  emitOrderAcceptedByStore, emitDeliveryStatusChanged, emitDeliveryPicked, emitDeliveryAssigned,
} from '../utils/socketEmitter';

const DOMAIN = '@d3b1p17.test';
const MARK = 'd3b1p17';
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

let server: http.Server;
let url: string;
let ioServer: ReturnType<typeof initSocket>;
let restoreConfig: () => Promise<void>;
const clients: ClientSocket[] = [];
let ceo: TestUser;
let cliente: TestUser;
let motoboy: TestUser;
let storeId: string;

beforeAll(async () => {
  restoreConfig = await snapshotPlatformConfig();
  server = http.createServer(app);
  ioServer = initSocket(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await restoreConfig();
  await new Promise<void>((resolve) => ioServer.close(() => resolve()));
  await prisma.$disconnect();
});
beforeEach(async () => {
  await updatePlatformConfig({ poolTimeoutMin: 15 }, 'test');
  ceo = await createTestUser('ceo', DOMAIN);
  cliente = await createTestUser('cliente', DOMAIN);
  motoboy = await createTestUser('motoboy', DOMAIN);
  storeId = await createOpsStore(DOMAIN, { name: 'Loja Socket' });
});
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await cleanupOpsFixtures(DOMAIN, MARK);
});

const connect = (token: string) =>
  new Promise<ClientSocket>((resolve, reject) => {
    const c = ioClient(url, { auth: { token }, transports: ['websocket'], forceNew: true });
    clients.push(c);
    c.on('connect', () => resolve(c));
    c.on('connect_error', reject);
  });

/** Primeiro payload do evento em até `ms`, ou null se não chegou. */
const next = (c: ClientSocket, event: string, ms = 600) =>
  new Promise<any>((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    c.once(event, (payload: any) => {
      clearTimeout(t);
      resolve(payload);
    });
  });

/** Primeiro admin:order_changed deste pedido em até `ms` (outros pedidos podem passar antes), ou null. */
const nextFor = (c: ClientSocket, orderId: string, ms = 1500) =>
  new Promise<any>((resolve) => {
    const handler = (payload: any) => {
      if (payload?.orderId !== orderId) return;
      clearTimeout(t);
      c.off('admin:order_changed', handler);
      resolve(payload);
    };
    const t = setTimeout(() => {
      c.off('admin:order_changed', handler);
      resolve(null);
    }, ms);
    c.on('admin:order_changed', handler);
  });

const settle = () => new Promise((r) => setTimeout(r, 300));
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

async function adminSocket() {
  const s = await connect(ceo.token);
  await settle();
  return s;
}

/** O evento chegou com o pedido e o status certos e só com as três chaves. */
function expectMinimal(payload: any, orderId: string, status: string) {
  expect(payload).not.toBeNull();
  expect(Object.keys(payload).sort()).toEqual(['at', 'orderId', 'status']);
  expect(payload.orderId).toBe(orderId);
  expect(payload.status).toBe(status);
  expect(payload.at).toMatch(ISO);
}

it('emitAdminOrderChanged chega à sala admin só com { orderId, status, at } e não chega a um cliente', async () => {
  const admin = await connect(ceo.token);
  const outsider = await connect(cliente.token);
  outsider.emit('join', { room: 'admin' }); // pedir para entrar não adianta
  await settle();

  const got = next(admin, 'admin:order_changed');
  const leaked = next(outsider, 'admin:order_changed');
  const before = Date.now();
  emitAdminOrderChanged('pedido-1', 'pago');

  const payload = await got;
  expectMinimal(payload, 'pedido-1', 'pago');
  expect(Date.parse(payload.at)).toBeGreaterThanOrEqual(before - 1000);
  expect(await leaked).toBeNull();
});

it('emitOrderStatusChanged avisa a sala admin; o cliente do pedido recebe só o evento dele', async () => {
  const admin = await connect(ceo.token);
  const dono = await connect(cliente.token);
  await settle();

  const adminGot = nextFor(admin, 'pedido-2');
  const clienteStatus = next(dono, 'order:status_changed');
  const clienteAdmin = next(dono, 'admin:order_changed');
  emitOrderStatusChanged({
    _id: 'pedido-2', status: 'entregue', storeId: 'loja-de-teste', customerId: cliente.userId,
    totalValue: 30, paymentStatus: 'paid', createdAt: new Date(),
  });

  expectMinimal(await adminGot, 'pedido-2', 'entregue');
  expect(await clienteStatus).not.toBeNull();
  expect(await clienteAdmin).toBeNull();
});

it('emitOrderCreated avisa a sala admin com o pedido novo', async () => {
  const admin = await adminSocket();
  const got = nextFor(admin, 'pedido-3');
  emitOrderCreated({
    _id: 'pedido-3', status: 'pago', storeId: 'loja-de-teste', customerId: cliente.userId,
    totalValue: 30, deliveryFee: 10, paymentStatus: 'paid', createdAt: new Date(), products: [],
  });
  expectMinimal(await got, 'pedido-3', 'pago');
});

it('emitOrderCancelled avisa a sala admin', async () => {
  const admin = await adminSocket();
  const got = nextFor(admin, 'pedido-4');
  emitOrderCancelled(
    { _id: 'pedido-4', status: 'cancelado', storeId: 'loja-de-teste', customerId: cliente.userId },
    { reason: 'Desisti', reasonCode: 'customer_request', refundAmount: 30, cancelledBy: 'customer' },
  );
  expectMinimal(await got, 'pedido-4', 'cancelado');
});

it('emitOrderRejectedByStore avisa a sala admin', async () => {
  const admin = await adminSocket();
  const got = nextFor(admin, 'pedido-5');
  emitOrderRejectedByStore({ _id: 'pedido-5', status: 'rejeitado', storeId: 'loja-de-teste', customerId: cliente.userId }, 'Sem estoque');
  expectMinimal(await got, 'pedido-5', 'rejeitado');
});

it('emitOrderAcceptedByStore avisa a sala admin', async () => {
  const admin = await adminSocket();
  const got = nextFor(admin, 'pedido-6');
  emitOrderAcceptedByStore({ _id: 'pedido-6', status: 'aguardando_motoboy', storeId: 'loja-de-teste', customerId: cliente.userId });
  expectMinimal(await got, 'pedido-6', 'aguardando_motoboy');
});

it('emitDeliveryStatusChanged avisa a sala admin com o status do pedido', async () => {
  const o = await createOpsOrder({
    customerId: cliente.userId, storeId, status: 'aguardando_motoboy', acceptedAt: minutesAgo(5),
    delivery: { status: 'assigned', motoboyId: motoboy.userId, assignedAt: minutesAgo(1) },
  });
  const admin = await adminSocket();
  const got = nextFor(admin, o.orderId);
  emitDeliveryStatusChanged({ _id: o.deliveryId, orderId: o.orderId, status: 'assigned' });
  expectMinimal(await got, o.orderId, 'aguardando_motoboy');
});

it('emitDeliveryPicked avisa a sala admin', async () => {
  const admin = await adminSocket();
  const got = nextFor(admin, 'pedido-8');
  emitDeliveryPicked(
    { _id: 'entrega-8', motoboyId: null, updatedAt: new Date() },
    { _id: 'pedido-8', status: 'aguardando_motoboy', storeId: 'loja-de-teste', customerId: cliente.userId },
  );
  expectMinimal(await got, 'pedido-8', 'aguardando_motoboy');
});

it('emitDeliveryAssigned avisa a sala admin com o status do pedido', async () => {
  const o = await createOpsOrder({
    customerId: cliente.userId, storeId, status: 'aguardando_motoboy', acceptedAt: minutesAgo(5),
    delivery: { status: 'assigned', motoboyId: motoboy.userId, assignedAt: minutesAgo(1) },
  });
  const admin = await adminSocket();
  const got = nextFor(admin, o.orderId);
  emitDeliveryAssigned({ _id: o.deliveryId, orderId: o.orderId, fee: 10, distance: 3 }, { _id: motoboy.userId, name: 'Bruno' });
  expectMinimal(await got, o.orderId, 'aguardando_motoboy');
});

it('timeout do pool (runPoolTimeout) avisa a sala admin ao marcar o cliente decidindo', async () => {
  const o = await createOpsOrder({
    customerId: cliente.userId, storeId, status: 'aguardando_motoboy', acceptedAt: minutesAgo(40),
    delivery: { status: 'pending', createdAt: minutesAgo(30) },
  });
  const admin = await adminSocket();
  const got = nextFor(admin, o.orderId, 3000);
  await runPoolTimeout();
  expect((await prisma.order.findUnique({ where: { id: o.orderId } }))!.awaitingCustomerPoolDecision).toBe(true);
  expectMinimal(await got, o.orderId, 'aguardando_motoboy');
});

it('timeout da retirada (runDeliveryTimeout) devolve a corrida ao pool e avisa a sala admin', async () => {
  const o = await createOpsOrder({
    customerId: cliente.userId, storeId, status: 'aguardando_motoboy', acceptedAt: minutesAgo(60),
    delivery: { status: 'assigned', motoboyId: motoboy.userId, assignedAt: minutesAgo(45) },
  });
  await prisma.delivery.update({ where: { id: o.deliveryId! }, data: { updatedAt: minutesAgo(40) } });
  const admin = await adminSocket();
  const got = nextFor(admin, o.orderId, 3000);
  await runDeliveryTimeout();
  const d = await prisma.delivery.findUnique({ where: { id: o.deliveryId! } });
  expect(d).toMatchObject({ status: 'pending', motoboyId: null });
  expectMinimal(await got, o.orderId, 'aguardando_motoboy');
});
