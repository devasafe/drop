/**
 * D3b-3 · revisão final I1 — produto devolvido (confirm-return, ramo CANCEL) com repasse em
 * voo ou já liquidado (releasing / requested / paid). O reembolso automático do cliente
 * pagaria duas vezes (loja + cliente): aborta a transação e escala para revisão manual,
 * no mesmo padrão do cancelamento pelo cliente (PAYOUT_ALREADY_SETTLED / needsManualReview).
 */
jest.mock('../utils/socketEmitter', () => {
  const actual = jest.requireActual('../utils/socketEmitter');
  return { __esModule: true, ...actual, emitToRoom: jest.fn(), emitAdminNotification: jest.fn() };
});

import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { emitToRoom, emitAdminNotification } from '../utils/socketEmitter';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { createWallet, findWallet, createPayout, findPayoutById } from './helpers/financePg';

const DOMAIN = '@d3b3final1.test';
const emit = emitToRoom as jest.Mock;
const notifyAdmin = emitAdminNotification as jest.Mock;
let orderIds: string[] = [];

beforeEach(() => { jest.clearAllMocks(); orderIds = []; });
afterEach(async () => {
  await prisma.appCashboxEntry.deleteMany({ where: { orderId: { in: orderIds } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function scenario(payoutStatus: string) {
  const cliente = await createTestUser('cliente', DOMAIN);
  const lojista = await createTestUser('lojista', DOMAIN);
  const motoboy = await createTestUser('motoboy', DOMAIN);
  await createWallet({ owner: cliente.userId, ownerType: 'user', balance: 100, totalIncome: 100 });
  const store = await prisma.store.create({ data: { ownerId: lojista.userId, name: 'Loja I1' } as any });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Item', price: 50, quantity: 5 } } as any);
  const order = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId: store.id,
      items: { create: [{ productId: product.id, quantity: 1, price: 50 }] },
      totalValue: 60, deliveryFee: 10, status: 'enviado', paymentMethod: 'pix', paymentStatus: 'paid', acceptedAt: new Date(),
    } as any,
  });
  orderIds.push(order.id);
  const delivery = await prisma.delivery.create({
    data: { orderId: order.id, motoboyId: motoboy.userId, fee: 10, status: 'picked', statusDevolucao: 'aguardando_confirmacao', pinDevolucao: '424242' } as any,
  });
  await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });
  await createWallet({ owner: store.id, ownerType: 'store', pendingBalance: payoutStatus === 'pending' ? 50 : 0 });
  const payout = await createPayout({ recipientType: 'store', recipientId: store.id, orderId: order.id, amount: 50, status: payoutStatus });
  return { cliente, lojista: lojista as TestUser, order, delivery, payoutId: String(payout!._id) };
}

const confirmReturn = (s: { lojista: TestUser; delivery: { id: string } }) =>
  request(app).post(`/api/deliveries/${s.delivery.id}/confirm-return`).set('Authorization', bearer(s.lojista)).send({ pinDevolucao: '424242' });

const customerCancelEvent = (customerId: string) =>
  emit.mock.calls.find(([room, event]) => room === `user:${customerId}` && event === 'order:cancelled')?.[2];

describe('confirm-return (CANCEL) com repasse em voo ou liquidado', () => {
  for (const status of ['releasing', 'requested', 'paid']) {
    it(`repasse ${status}: cliente NÃO é reembolsado, repasse intacto, admin avisado, refundStatus pending`, async () => {
      const s = await scenario(status);

      const res = await confirmReturn(s);

      expect(res.status).toBe(200);
      const o = await prisma.order.findUnique({ where: { id: s.order.id } });
      expect(o!.status).toBe('cancelado');
      const w = await findWallet({ owner: s.cliente.userId, ownerType: 'user' });
      expect(w!.balance).toBeCloseTo(100, 2);
      expect(w!.history.filter((h: any) => h.category === 'refund')).toHaveLength(0);
      expect((await findPayoutById(s.payoutId))!.status).toBe(status);
      expect(await prisma.appCashboxEntry.count({ where: { orderId: s.order.id } })).toBe(0);
      expect(notifyAdmin).toHaveBeenCalledTimes(1);
      expect(customerCancelEvent(s.cliente.userId)).toEqual(expect.objectContaining({ refundStatus: 'pending' }));
    });
  }

  it('repasse pending (controle): cancela o repasse e reembolsa o cliente', async () => {
    const s = await scenario('pending');

    const res = await confirmReturn(s);

    expect(res.status).toBe(200);
    const w = await findWallet({ owner: s.cliente.userId, ownerType: 'user' });
    expect(w!.balance).toBeCloseTo(160, 2);
    expect((await findPayoutById(s.payoutId))!.status).toBe('cancelled');
    expect(notifyAdmin).not.toHaveBeenCalled();
    expect(customerCancelEvent(s.cliente.userId)).toEqual(expect.objectContaining({ refundStatus: 'processed' }));
  });
});
