/** Fase C2 — Task 25. O cliente do pedido direto vê a etapa do estorno, sem detalhes internos. */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { customerRefundStage } from '../utils/customerRefund';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@c2estorno.test';
afterEach(async () => {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  await prisma.directRefund.deleteMany({ where: { storeId: { in: stores.map((s) => s.id) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});
afterAll(async () => { await prisma.$disconnect(); });

it.each([
  ['pending', 'devolvendo'], ['requested', 'devolvendo'], ['uncertain', 'conferindo'], ['failed', 'conferindo'],
  ['failed_final', 'resolvendo'], ['done', 'devolvido'], ['qualquer', 'devolvendo'],
])('status %s → etapa %s', (s, e) => expect(customerRefundStage(s)).toBe(e));

async function cenario(provider: 'asaas_loja' | 'asaas') {
  const dono = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja T25', isOpen: true } as any });
  const order = await prisma.order.create({
    data: { customerId: cliente.userId, storeId: store.id, totalValue: 189.9, deliveryFee: 0, status: 'cancelado', paymentMethod: 'pix', paymentStatus: 'paid', paymentProvider: provider } as any,
  });
  await prisma.directRefund.create({
    data: { orderId: order.id, storeId: store.id, asaasPaymentId: 'pay_t25', amount: 189.9, status: 'uncertain', requestedBy: cliente.userId, lastError: 'ASAAS_TIMEOUT segredo', attempts: 2 } as any,
  });
  return { dono, cliente, order };
}

it('cliente do pedido direto: etapa e valor, sem erro interno nem tentativas', async () => {
  const { cliente, order } = await cenario('asaas_loja');
  const r = await request(app).get(`/api/orders/${order.id}`).set('Authorization', bearer(cliente));
  expect(r.status).toBe(200);
  expect(r.body.customerRefund).toMatchObject({ stage: 'conferindo', amount: 189.9, acceptedAt: null, doneAt: null });
  expect(typeof r.body.customerRefund.requestedAt).toBe('string');
  expect(r.body.directRefund).toBeUndefined();
  expect(JSON.stringify(r.body)).not.toContain('ASAAS_TIMEOUT');
  expect(JSON.stringify(r.body.customerRefund)).not.toContain('attempts');
});

it('dono da loja continua vendo o directRefund de hoje, sem customerRefund', async () => {
  const { dono, order } = await cenario('asaas_loja');
  const r = await request(app).get(`/api/orders/${order.id}`).set('Authorization', bearer(dono));
  expect(r.body.directRefund).toMatchObject({ status: 'uncertain', attempts: 2 });
  expect(r.body.customerRefund).toBeUndefined();
});

it('pedido da custódia: sem customerRefund', async () => {
  const { cliente, order } = await cenario('asaas');
  const r = await request(app).get(`/api/orders/${order.id}`).set('Authorization', bearer(cliente));
  expect(r.body.customerRefund ?? null).toBeNull();
});
