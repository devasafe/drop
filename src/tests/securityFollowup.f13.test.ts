/**
 * Regressão (riscos remanescentes 2026-10-07) — f13: PINs antigos ao voltar ao pool.
 * Quando o motoboy rejeitava a entrega (ou a devolução era confirmada), a entrega voltava
 * a `pending` com os PINs do motoboy anterior ainda gravados. Na devolução confirmada, o
 * código fazia `pinDevolucao = undefined` — o Prisma ignora undefined, o PIN ficava.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@sf13.test';

afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function cenario(data: Record<string, any>) {
  const dono = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const motoboy = await createTestUser('motoboy', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja sf13', isOpen: true } });
  const order = await prisma.order.create({
    data: { customerId: cliente.userId, storeId: store.id, totalValue: 30, deliveryFee: 10, status: 'pago', paymentMethod: 'pix', paymentStatus: 'paid' },
  });
  const delivery = await prisma.delivery.create({
    data: { orderId: order.id, motoboyId: motoboy.userId, fee: 10, distance: 4, pin: '12345', pinRetirada: '54321', ...data },
  });
  await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });
  return { dono, motoboy, delivery };
}

const semPins = async (id: string) => {
  const d = await prisma.delivery.findUnique({ where: { id } });
  expect(d?.status).toBe('pending');
  expect(d?.motoboyId).toBeNull();
  expect({ pin: d?.pin, pinRetirada: d?.pinRetirada, pinDevolucao: d?.pinDevolucao }).toEqual({ pin: null, pinRetirada: null, pinDevolucao: null });
};

describe('f13 — entrega volta ao pool sem PINs', () => {
  it('motoboy rejeita antes de retirar', async () => {
    const { motoboy, delivery } = await cenario({ status: 'assigned' });
    const res = await request(app).post(`/api/deliveries/${delivery.id}/reject`).set('Authorization', bearer(motoboy)).send({ reason: 'pneu furado' });
    expect(res.status).toBe(200);
    await semPins(delivery.id);
  });

  it('loja confirma a devolução com reatribuição', async () => {
    const { dono, delivery } = await cenario({
      status: 'picked', pinDevolucao: '777777', statusDevolucao: 'aguardando_confirmacao', pendingReturnAction: 'reassign',
    });
    const res = await request(app).post(`/api/deliveries/${delivery.id}/confirm-return`).set('Authorization', bearer(dono)).send({ pinDevolucao: '777777' });
    expect(res.status).toBe(200);
    await semPins(delivery.id);
  });
});
