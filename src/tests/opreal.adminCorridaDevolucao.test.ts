// src/tests/opreal.adminCorridaDevolucao.test.ts
/**
 * Caso B: a corrida de devolução aparece em "Pedidos ao vivo" do admin enquanto está ativa (no pool,
 * a caminho do cliente ou levando à loja), mesmo com o pedido já 'entregue'. A etapa, o motoboy e o
 * motivo de atenção vêm da corrida de volta, e a linha vem marcada (returnRide).
 */
import { prisma } from '../lib/prisma';
import { createTestUser } from './helpers/authUser';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { listAdminOrders } from '../services/adminOps/orders';

const DOMAIN = '@admincorridadev.test';
let restore: () => Promise<void>;
beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); await prisma.$disconnect(); });
beforeEach(async () => { await updatePlatformConfig({ poolTimeoutMin: 15 } as any, 'test'); });
afterEach(async () => {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  await prisma.returnRequest.deleteMany({ where: { storeId: { in: stores.map((s) => s.id) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

const MIN = 60_000;

async function entregueComDevolucao(ride: { status: 'pending' | 'assigned' | 'picked' | 'delivered'; createdAgoMin?: number }) {
  const dono = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const motoboy = await createTestUser('motoboy', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja Admin Dev', isOpen: true } as any });
  const order = await prisma.order.create({
    data: { customerId: cliente.userId, storeId: store.id, totalValue: 100, deliveryFee: 10, paymentMethod: 'pix', paymentStatus: 'paid', status: 'entregue' } as any,
  });
  const forward = await prisma.delivery.create({ data: { orderId: order.id, motoboyId: motoboy.userId, fee: 10, status: 'delivered', deliveredAt: new Date() } as any });
  await prisma.order.update({ where: { id: order.id }, data: { deliveryId: forward.id } as any });
  const rr = await prisma.returnRequest.create({
    data: { orderId: order.id, customerId: cliente.userId, storeId: store.id, reason: 'defeito', amount: 100, includesDeliveryFee: true, status: 'devolvendo', mode: 'motoboy' },
  });
  const returnRide = await prisma.delivery.create({
    data: {
      orderId: order.id, kind: 'devolucao', returnRequestId: rr.id, fee: 9, status: ride.status,
      motoboyId: ride.status === 'pending' ? null : motoboy.userId,
      createdAt: new Date(Date.now() - (ride.createdAgoMin ?? 1) * MIN),
      assignedAt: ride.status === 'pending' ? null : new Date(),
      pickedAt: ride.status === 'picked' ? new Date() : null,
    } as any,
  });
  return { store, order, motoboy, returnRide };
}

it('corrida de volta no pool aparece em "Todos", marcada, com a etapa dela', async () => {
  const { store, order } = await entregueComDevolucao({ status: 'pending' });
  const r = await listAdminOrders({ filter: 'todos', storeId: store.id });
  const row: any = r.items.find((x) => x.id === order.id);
  expect(row).toBeDefined();
  expect(row).toMatchObject({ status: 'entregue', deliveryStatus: 'pending', returnRide: true });
});

it('sem motoboy além do prazo: entra em "Precisa de atenção"', async () => {
  const { store, order } = await entregueComDevolucao({ status: 'pending', createdAgoMin: 20 });
  const r = await listAdminOrders({ filter: 'atencao', storeId: store.id });
  const row: any = r.items.find((x) => x.id === order.id);
  expect(row).toMatchObject({ attention: 'sem_motoboy', returnRide: true });
});

it('levando à loja: aparece em "Em entrega" com o motoboy da corrida de volta', async () => {
  const { store, order, motoboy } = await entregueComDevolucao({ status: 'picked' });
  const r = await listAdminOrders({ filter: 'em_entrega', storeId: store.id });
  const row: any = r.items.find((x) => x.id === order.id);
  expect(row).toMatchObject({ deliveryStatus: 'picked', returnRide: true, motoboy: { id: motoboy.userId } });
});

it('corrida de volta concluída: o pedido entregue sai da lista', async () => {
  const { store, order } = await entregueComDevolucao({ status: 'delivered' });
  const r = await listAdminOrders({ filter: 'todos', storeId: store.id });
  expect(r.items.find((x) => x.id === order.id)).toBeUndefined();
});
