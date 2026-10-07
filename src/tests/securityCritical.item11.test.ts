/**
 * Regressão (auditoria de segurança 2026-10-07) — item 11: entrega só fecha com PIN.
 * PUT /deliveries/:id/status permitia ao motoboy marcar `picked`/`delivered`/`cancelled`
 * sem PIN, sem validar a transição, sem payout nem nota. As transições passam a existir
 * só nos endpoints de PIN (validar-pin-retirada, finalizar) e de cancelamento.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@sec11.test';

afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function entregaAtribuida() {
  const dono = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const motoboy = await createTestUser('motoboy', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja sec11', isOpen: true } });
  const order = await prisma.order.create({
    data: { customerId: cliente.userId, storeId: store.id, totalValue: 30, deliveryFee: 9, status: 'pago', paymentMethod: 'pix', paymentStatus: 'paid' },
  });
  const delivery = await prisma.delivery.create({
    data: { orderId: order.id, status: 'assigned', motoboyId: motoboy.userId, fee: 9, distance: 4, pin: '12345', pinRetirada: '54321' },
  });
  await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });
  return { motoboy, order, delivery };
}

describe('Item 11 — sem atalho para fechar entrega sem PIN', () => {
  it.each(['delivered', 'picked', 'cancelled'])('PUT /deliveries/:id/status {%s} não existe', async (status) => {
    const { motoboy, order, delivery } = await entregaAtribuida();
    const res = await request(app)
      .put(`/api/deliveries/${delivery.id}/status`)
      .set('Authorization', bearer(motoboy))
      .send({ status });
    expect(res.status).toBe(404);

    const d = await prisma.delivery.findUnique({ where: { id: delivery.id } });
    const o = await prisma.order.findUnique({ where: { id: order.id } });
    expect(d?.status).toBe('assigned');
    expect(o?.status).toBe('pago');
  });

  it('finalizar continua exigindo o PIN correto', async () => {
    const { motoboy, delivery } = await entregaAtribuida();
    const res = await request(app)
      .post(`/api/deliveries/${delivery.id}/finalizar`)
      .set('Authorization', bearer(motoboy))
      .send({ pin: '00000' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const d = await prisma.delivery.findUnique({ where: { id: delivery.id } });
    expect(d?.status).toBe('assigned');
  });
});
