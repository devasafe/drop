// src/tests/opreal.reembolsoEscalonado.test.ts
/**
 * Caso B, fase 2: pedido de reembolso sem resposta da loja no prazo (Regras e taxas, padrão 48 h)
 * vai para o admin, uma vez só, e a loja recebe um lembrete.
 */
jest.mock('../utils/socketEmitter', () => {
  const actual = jest.requireActual('../utils/socketEmitter');
  return { __esModule: true, ...actual, emitToRoom: jest.fn(), emitAdminNotification: jest.fn() };
});

import { prisma } from '../lib/prisma';
import { emitAdminNotification } from '../utils/socketEmitter';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser } from './helpers/authUser';
import { runReturnRequestEscalation } from '../jobs/returnRequestEscalation.job';

const DOMAIN = '@reembolsoescalonado.test';
const HOUR = 60 * 60 * 1000;
const adminNotify = emitAdminNotification as jest.Mock;
let restore: () => Promise<void>;

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); await prisma.$disconnect(); });
beforeEach(async () => { adminNotify.mockReset(); await updatePlatformConfig({ returnStoreResponseHours: 48 } as any, 'test'); });
afterEach(async () => {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  await prisma.returnRequest.deleteMany({ where: { storeId: { in: stores.map((s) => s.id) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function pedido(hoursAgo: number, status: 'aguardando_loja' | 'aprovado' = 'aguardando_loja') {
  const dono = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja Lenta', isOpen: true } as any });
  const order = await prisma.order.create({
    data: { customerId: cliente.userId, storeId: store.id, totalValue: 100, deliveryFee: 10, paymentMethod: 'pix', paymentStatus: 'paid', status: 'entregue' } as any,
  });
  const rr = await prisma.returnRequest.create({
    data: {
      orderId: order.id, customerId: cliente.userId, storeId: store.id, reason: 'defeito', amount: 100, includesDeliveryFee: true, status,
      createdAt: new Date(Date.now() - hoursAgo * HOUR),
    },
  });
  return { dono, order, rr };
}

const ours = (orderId: string) => adminNotify.mock.calls.filter((c) => String(c[0]?.url || '').includes(orderId));

it('sem resposta além do prazo: avisa o admin e lembra a loja, uma vez só', async () => {
  const { dono, order, rr } = await pedido(49);
  await runReturnRequestEscalation();
  expect(ours(order.id)).toHaveLength(1);
  expect(ours(order.id)[0][0]).toMatchObject({ title: 'Reembolso sem resposta da loja', url: `/admin/pedidos/${order.id}` });
  expect((await prisma.returnRequest.findUnique({ where: { id: rr.id } }))!.escalatedAt).toBeInstanceOf(Date);
  expect(await prisma.notification.findFirst({ where: { userId: dono.userId, entityId: order.id, title: 'Responda o pedido de reembolso' } })).not.toBeNull();

  await runReturnRequestEscalation();
  expect(ours(order.id)).toHaveLength(1);
});

it('dentro do prazo ou já respondido: nada', async () => {
  const a = await pedido(47);
  const b = await pedido(72, 'aprovado');
  await runReturnRequestEscalation();
  expect(ours(a.order.id)).toHaveLength(0);
  expect(ours(b.order.id)).toHaveLength(0);
});

it('usa o prazo de Regras e taxas', async () => {
  await updatePlatformConfig({ returnStoreResponseHours: 2 } as any, 'test');
  const { order } = await pedido(3);
  await runReturnRequestEscalation();
  expect(ours(order.id)).toHaveLength(1);
});
