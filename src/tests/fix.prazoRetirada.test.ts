/**
 * Fim do prazo de retirada (deliveryTimeout.job): só devolve ao pool a corrida que continua parada
 * (entrega 'assigned' com o mesmo motoboy e pedido ainda vivo). Retirada, cancelamento ou pedido
 * encerrado entre a leitura e a escrita não podem ser desfeitos pelo job, nem gerar avisos.
 */
import { prisma } from '../lib/prisma';
import notifier from '../services/notifier';
import * as socketEmitter from '../utils/socketEmitter';
import { createTestUser, TestUser } from './helpers/authUser';
import { snapshotPlatformConfig } from './helpers/pgCleanup';
import { createOpsStore, createOpsOrder, cleanupOpsFixtures, minutesBefore } from './helpers/d3b1Ops';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { runDeliveryTimeout } from '../jobs/deliveryTimeout.job';
import { runPoolTimeout } from '../jobs/poolTimeout.job';

const DOMAIN = '@prazoretirada.test';
const MARK = 'prazoretirada';
const minutesAgo = (m: number) => minutesBefore(new Date(), m);

let restoreConfig: () => Promise<void>;
let cliente: TestUser;
let motoboy: TestUser;
let storeId: string;
let emitToRoomSpy: jest.SpyInstance;
let adminChangedSpy: jest.SpyInstance;
let notifyMotoboysSpy: jest.SpyInstance;

beforeAll(async () => {
  restoreConfig = await snapshotPlatformConfig();
});
afterAll(async () => {
  await restoreConfig();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await updatePlatformConfig({ poolTimeoutMin: 15 }, 'test');
  cliente = await createTestUser('cliente', DOMAIN);
  motoboy = await createTestUser('motoboy', DOMAIN);
  storeId = await createOpsStore(DOMAIN, { name: 'Loja Prazo' });
  emitToRoomSpy = jest.spyOn(socketEmitter, 'emitToRoom').mockImplementation(() => undefined as any);
  adminChangedSpy = jest.spyOn(socketEmitter, 'emitAdminOrderChanged').mockImplementation(() => undefined as any);
  notifyMotoboysSpy = jest.spyOn(notifier, 'notifyMotoboys').mockImplementation(() => undefined as any);
});
afterEach(async () => {
  jest.restoreAllMocks();
  await cleanupOpsFixtures(DOMAIN, MARK);
});

async function assignedOrder(orderStatus: any = 'aguardando_motoboy') {
  const o = await createOpsOrder({
    customerId: cliente.userId, storeId, status: orderStatus, acceptedAt: minutesAgo(60),
    delivery: { status: 'assigned', motoboyId: motoboy.userId, assignedAt: minutesAgo(45), pin: '1234', pinRetirada: '5678' },
  });
  await prisma.delivery.update({ where: { id: o.deliveryId! }, data: { updatedAt: minutesAgo(40) } });
  return o;
}

const expectNoNotices = () => {
  expect(emitToRoomSpy).not.toHaveBeenCalled();
  expect(adminChangedSpy).not.toHaveBeenCalled();
  expect(notifyMotoboysSpy).not.toHaveBeenCalled();
};

it('caso normal: devolve a corrida ao pool como nova e avisa', async () => {
  const o = await assignedOrder();
  const before = Date.now();
  await runDeliveryTimeout();

  const d = await prisma.delivery.findUnique({ where: { id: o.deliveryId! } });
  expect(d).toMatchObject({
    status: 'pending', motoboyId: null, assignedAt: null, pin: null, pinRetirada: null,
    pinDevolucao: null, pinFailedAttempts: 0, pinLockedUntil: null,
  });
  expect(d!.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  expect((await prisma.order.findUnique({ where: { id: o.orderId } }))!.status).toBe('aguardando_motoboy');

  expect(adminChangedSpy).toHaveBeenCalledWith(o.orderId, 'aguardando_motoboy');
  const rooms = emitToRoomSpy.mock.calls.map((c) => c[0]);
  expect(rooms).toEqual(expect.arrayContaining([`user:${cliente.userId}`, `store:${storeId}`, `user:${motoboy.userId}`]));
  expect(notifyMotoboysSpy).toHaveBeenCalledTimes(1);
});

it.each(['cancelado', 'rejeitado', 'entregue'])('pedido %s com entrega ainda assigned: nada muda e nada é avisado', async (status) => {
  const o = await assignedOrder(status);
  await runDeliveryTimeout();

  expect((await prisma.order.findUnique({ where: { id: o.orderId } }))!.status).toBe(status);
  expect(await prisma.delivery.findUnique({ where: { id: o.deliveryId! } })).toMatchObject({
    status: 'assigned', motoboyId: motoboy.userId,
  });
  expectNoNotices();
});

it('retirada entre a leitura e a escrita: a entrega continua picked e nada é avisado', async () => {
  const o = await assignedOrder();
  const original = prisma.delivery.findMany.bind(prisma.delivery);
  jest.spyOn(prisma.delivery, 'findMany').mockImplementationOnce((async (args: any) => {
    const list = await original(args);
    await prisma.delivery.update({ where: { id: o.deliveryId! }, data: { status: 'picked', pickedAt: new Date() } });
    return list;
  }) as any);

  await runDeliveryTimeout();

  expect(await prisma.delivery.findUnique({ where: { id: o.deliveryId! } })).toMatchObject({
    status: 'picked', motoboyId: motoboy.userId,
  });
  expect((await prisma.order.findUnique({ where: { id: o.orderId } }))!.status).toBe('aguardando_motoboy');
  expectNoNotices();
});

it('depois do job, o poolTimeout não marca a entrega devolvida como aguardando decisão do cliente', async () => {
  const o = await assignedOrder();
  await runDeliveryTimeout();
  await runPoolTimeout();

  expect((await prisma.order.findUnique({ where: { id: o.orderId } }))!.awaitingCustomerPoolDecision).toBe(false);
});
