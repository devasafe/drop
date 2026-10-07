/**
 * Regressão (riscos remanescentes 2026-10-07) — f07: finalizar entrega.
 *  - Exige a entrega em `picked` (retirada validada pela loja). Antes, com o PIN do
 *    cliente, o motoboy fechava direto de `assigned`, sem nunca ter passado na loja.
 *  - Trava atômica (updateMany condicional): duas chamadas simultâneas não geram dois
 *    payouts nem dois créditos.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@sf07.test';

afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function entrega(status: 'assigned' | 'picked') {
  const dono = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const motoboy = await createTestUser('motoboy', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja sf07', isOpen: true } });
  const order = await prisma.order.create({
    data: { customerId: cliente.userId, storeId: store.id, totalValue: 30, deliveryFee: 10, status: 'pago', paymentMethod: 'pix', paymentStatus: 'paid' },
  });
  const delivery = await prisma.delivery.create({
    data: { orderId: order.id, status, motoboyId: motoboy.userId, fee: 10, distance: 4, pin: '12345', pinRetirada: '54321' },
  });
  await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });
  return { motoboy, order, delivery };
}

const finalizar = (id: string, u: any, pin = '12345') =>
  request(app).post(`/api/deliveries/${id}/finalizar`).set('Authorization', bearer(u)).send({ pin });

describe('f07 — finalizarEntrega', () => {
  it('não fecha sem a retirada validada (assigned), mesmo com o PIN certo', async () => {
    const { motoboy, order, delivery } = await entrega('assigned');
    const res = await finalizar(delivery.id, motoboy);
    expect(res.status).toBe(400);
    expect((await prisma.delivery.findUnique({ where: { id: delivery.id } }))?.status).toBe('assigned');
    expect((await prisma.order.findUnique({ where: { id: order.id } }))?.status).toBe('pago');
    expect(await prisma.payout.count({ where: { deliveryId: delivery.id } })).toBe(0);
  });

  it('duas finalizações simultâneas: uma passa, payout único', async () => {
    const { motoboy, order, delivery } = await entrega('picked');
    const [a, b] = await Promise.all([finalizar(delivery.id, motoboy), finalizar(delivery.id, motoboy)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await prisma.order.findUnique({ where: { id: order.id } }))?.status).toBe('entregue');
    expect(await prisma.payout.count({ where: { deliveryId: delivery.id, recipientType: 'motoboy' } })).toBe(1);
  });
});
