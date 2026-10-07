/**
 * Regressão (riscos remanescentes 2026-10-07) — f01: GET /deliveries/:id é só leitura.
 * Antes, a consulta gerava e gravava um `pinRetirada` quando a entrega não tinha um —
 * e fazia isso ANTES de checar quem estava pedindo (qualquer usuário logado escrevia).
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@sf01.test';

afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function entregaSemPin() {
  const dono = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const estranho = await createTestUser('cliente', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja sf01', isOpen: true } });
  const order = await prisma.order.create({
    data: { customerId: cliente.userId, storeId: store.id, totalValue: 30, deliveryFee: 9, status: 'pago', paymentMethod: 'pix', paymentStatus: 'paid' },
  });
  const delivery = await prisma.delivery.create({ data: { orderId: order.id, status: 'pending', fee: 9, distance: 4 } });
  return { dono, cliente, estranho, delivery };
}

describe('f01 — GET /deliveries/:id não grava nada', () => {
  it('participante lê a entrega e nenhum PIN é criado', async () => {
    const { dono, cliente, delivery } = await entregaSemPin();
    for (const u of [dono, cliente]) {
      const res = await request(app).get(`/api/deliveries/${delivery.id}`).set('Authorization', bearer(u));
      expect(res.status).toBe(200);
    }
    const d = await prisma.delivery.findUnique({ where: { id: delivery.id } });
    expect(d?.pinRetirada).toBeNull();
    expect(d?.pin).toBeNull();
  });

  it('quem não participa recebe 403 e também não gera PIN', async () => {
    const { estranho, delivery } = await entregaSemPin();
    const res = await request(app).get(`/api/deliveries/${delivery.id}`).set('Authorization', bearer(estranho));
    expect(res.status).toBe(403);
    const d = await prisma.delivery.findUnique({ where: { id: delivery.id } });
    expect(d?.pinRetirada).toBeNull();
  });
});
