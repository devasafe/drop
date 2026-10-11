/** Fase C2 — Task 22. Prévia do cancelamento: mesma conta do cancelamento, sem mover nada. */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@c2prev.test';
afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });
afterAll(async () => { await prisma.$disconnect(); });

async function cenario(status: string, opts: { motoboy?: boolean; devolucao?: boolean } = {}) {
  const dono = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const motoboy = await createTestUser('motoboy', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja T22', isOpen: true } as any });
  const order = await prisma.order.create({
    data: { customerId: cliente.userId, storeId: store.id, totalValue: 244, subtotal: 236.6, deliveryFee: 7.4, status, paymentMethod: 'pix', paymentStatus: 'paid' } as any,
  });
  const delivery = await prisma.delivery.create({
    data: { orderId: order.id, status: opts.motoboy ? 'picked' : 'pending', fee: 7.4, distance: 2.4, ...(opts.motoboy ? { motoboyId: motoboy.userId } : {}), ...(opts.devolucao ? { statusDevolucao: 'aguardando_confirmacao' } : {}) } as any,
  });
  await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } as any });
  return { cliente, order, outro: await createTestUser('cliente', DOMAIN) };
}
const preview = (id: string, u: any) => request(app).get(`/api/orders/${id}/cancel-preview`).set('Authorization', bearer(u));

it('antes do motoboy em rota: grátis, reembolso cheio', async () => {
  const { cliente, order } = await cenario('pago');
  const r = await preview(order.id, cliente);
  expect(r.status).toBe(200);
  expect(r.body.data).toMatchObject({ cancellable: true, fee: 0, refund: 244, motoboyEnRoute: false, direct: false });
});

it('motoboy em rota (enviado): a entrega fica com ele e o resto volta', async () => {
  const { cliente, order } = await cenario('enviado', { motoboy: true });
  const r = await preview(order.id, cliente);
  expect(r.body.data).toMatchObject({ cancellable: true, fee: 7.4, refund: 236.6, motoboyEnRoute: true });
});

it('entregue: não cancela; devolução em andamento: não cancela', async () => {
  const a = await cenario('entregue');
  expect((await preview(a.order.id, a.cliente)).body.data).toMatchObject({ cancellable: false, reason: 'STATUS', status: 'entregue' });
  const b = await cenario('enviado', { motoboy: true, devolucao: true });
  expect((await preview(b.order.id, b.cliente)).body.data).toMatchObject({ cancellable: false, reason: 'RETURN_IN_PROGRESS' });
});

it('outro cliente não vê; pedido inexistente é 404; nada muda no pedido', async () => {
  const { order, outro, cliente } = await cenario('pago');
  expect((await preview(order.id, outro)).status).toBe(403);
  expect((await preview('nao-existe', cliente)).status).toBe(404);
  const depois = await prisma.order.findUnique({ where: { id: order.id } });
  expect(depois!.status).toBe('pago');
});

it('a prévia acompanha o status: o mesmo pedido muda de grátis para com taxa, sem gravar nada', async () => {
  const { cliente, order } = await cenario('aguardando_motoboy', { motoboy: true });
  expect((await preview(order.id, cliente)).body.data).toMatchObject({ fee: 0, refund: 244, motoboyEnRoute: false });
  await prisma.order.update({ where: { id: order.id }, data: { status: 'enviado' } });
  expect((await preview(order.id, cliente)).body.data).toMatchObject({ fee: 7.4, refund: 236.6, motoboyEnRoute: true });
  expect(await prisma.cancellation.count({ where: { orderId: order.id } })).toBe(0);
  expect((await prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe('enviado');
});
