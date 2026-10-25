/**
 * Cada etapa do pedido chama o aviso ao cliente (notifyCustomerOrder). O conteúdo do aviso é coberto
 * em opreal.avisosCliente; aqui só se confere QUE etapa dispara e com que dados.
 */
jest.mock('../services/customerNotify', () => {
  const actual = jest.requireActual('../services/customerNotify');
  return { __esModule: true, ...actual, notifyCustomerOrder: jest.fn(async () => {}) };
});
// Pix vencido: a cobrança "é excluída" no Asaas sem rede.
jest.mock('../services/asaas/payment', () => {
  const actual = jest.requireActual('../services/asaas/payment');
  return { __esModule: true, ...actual, cancelCharge: jest.fn(async () => true) };
});

import request from 'supertest';
import app from '../app';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import { notifyCustomerOrder } from '../services/customerNotify';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { emitOrderCreated, emitOrderAcceptedByStore, emitOrderCancelled, emitDeliveryCompleted } from '../utils/socketEmitter';
import { runPoolTimeout } from '../jobs/poolTimeout.job';
import { runDeliveryTimeout } from '../jobs/deliveryTimeout.job';
import { markDirectOrderRefunded } from '../services/asaasLoja/orderPaymentDirect';
import { markOrderRefunded } from '../services/asaas/orderPayment';
import { expireStalePixOrders } from '../services/asaas/expireOrders';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@opreal-etapas.test';
const notify = notifyCustomerOrder as jest.Mock;
const ORIGINAL_GATEWAY = env.PAYMENT_GATEWAY;
let restore: () => Promise<void>;

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); (env as any).PAYMENT_GATEWAY = ORIGINAL_GATEWAY; await prisma.$disconnect(); });
beforeEach(async () => {
  notify.mockClear();
  (env as any).PAYMENT_GATEWAY = 'none';
  await updatePlatformConfig({ settlementMode: 'direto', motoboyShareDirect: 80, directTransferMaxAmount: 150 } as any, 'test');
});
afterEach(async () => {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  const orders = await prisma.order.findMany({ where: { storeId: { in: stores.map((s) => s.id) } }, select: { id: true } });
  const ids = orders.map((o) => o.id);
  await prisma.motoboyTransfer.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.deliveryInvoice.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.payout.deleteMany({ where: { orderId: { in: ids } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function cenario(status: 'pending' | 'assigned' | 'picked' | null, order: Record<string, unknown> = {}, delivery: Record<string, unknown> = {}) {
  const dono = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const motoboy = await createTestUser('motoboy', DOMAIN);
  await prisma.user.update({ where: { id: motoboy.userId }, data: { asaas: { status: 'none', pixKey: '12345678909', pixKeyType: 'CPF' } } as any });
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja Etapas', isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any });
  const o = await prisma.order.create({
    data: { customerId: cliente.userId, storeId: store.id, totalValue: 30, subtotal: 20, deliveryFee: 10, status: 'pago', paymentMethod: 'pix', paymentStatus: 'paid', paymentProvider: 'asaas_loja', ...order } as any,
  });
  let d: any = null;
  if (status) {
    d = await prisma.delivery.create({
      data: {
        orderId: o.id, status, fee: 10, distance: 4,
        ...(status === 'pending' ? {} : { motoboyId: motoboy.userId, pin: '12345', pinRetirada: '54321' }),
        ...delivery,
      } as any,
    });
    await prisma.order.update({ where: { id: o.id }, data: { deliveryId: d.id } as any });
  }
  return { dono, cliente, motoboy, store, order: o, delivery: d };
}

const calledWith = (orderId: string, stage: string) =>
  notify.mock.calls.some(([id, s]) => id === orderId && s === stage);

describe('fluxo da entrega', () => {
  it('motoboy aceita a corrida → motoboy_assigned', async () => {
    const { motoboy, order, delivery } = await cenario('pending');
    const r = await request(app).post(`/api/deliveries/${delivery.id}/claim`).set('Authorization', bearer(motoboy)).send({});
    expect(r.status).toBe(200);
    expect(calledWith(order.id, 'motoboy_assigned')).toBe(true);
  });

  it('loja atribui o motoboy → motoboy_assigned', async () => {
    const { dono, motoboy, order, delivery } = await cenario('pending');
    const r = await request(app).put(`/api/deliveries/${delivery.id}/assign`).set('Authorization', bearer(dono)).send({ motoboyId: motoboy.userId });
    expect(r.status).toBe(200);
    expect(calledWith(order.id, 'motoboy_assigned')).toBe(true);
  });

  it('PIN de retirada → picked', async () => {
    const { dono, order, delivery } = await cenario('assigned');
    const r = await request(app).post(`/api/deliveries/${delivery.id}/validar-pin-retirada`).set('Authorization', bearer(dono)).send({ pinRetirada: '54321' });
    expect(r.status).toBe(200);
    expect(calledWith(order.id, 'picked')).toBe(true);
  });

  it('PIN de entrega → delivered', async () => {
    const { motoboy, order, delivery } = await cenario('picked');
    const r = await request(app).post(`/api/deliveries/${delivery.id}/finalizar`).set('Authorization', bearer(motoboy)).send({ pin: '12345' });
    expect(r.status).toBe(200);
    expect(calledWith(order.id, 'delivered')).toBe(true);
  });

  it('motoboy desiste antes de retirar → searching_motoboy', async () => {
    const { motoboy, order, delivery } = await cenario('assigned');
    const r = await request(app).post(`/api/deliveries/${delivery.id}/reject`).set('Authorization', bearer(motoboy)).send({ reason: 'pneu furado' });
    expect(r.status).toBe(200);
    expect(calledWith(order.id, 'searching_motoboy')).toBe(true);
  });

  it('motoboy desiste depois de retirar → return_decision', async () => {
    const { motoboy, order, delivery } = await cenario('picked');
    const r = await request(app).post(`/api/deliveries/${delivery.id}/reject`).set('Authorization', bearer(motoboy)).send({ reason: 'acidente' });
    expect(r.status).toBe(202);
    expect(calledWith(order.id, 'return_decision')).toBe(true);
  });

  it('motoboy não aparece (timeout) → searching_motoboy', async () => {
    const { order, delivery } = await cenario('assigned');
    await prisma.$executeRaw`UPDATE "Delivery" SET "updatedAt" = NOW() - INTERVAL '2 hours' WHERE id = ${delivery.id}`;
    await runDeliveryTimeout();
    expect(calledWith(order.id, 'searching_motoboy')).toBe(true);
  });

  it('nenhum motoboy no tempo do pool → pool_timeout, uma vez só', async () => {
    const { order, delivery } = await cenario('pending', { status: 'aguardando_motoboy' });
    await prisma.$executeRaw`UPDATE "Delivery" SET "createdAt" = NOW() - INTERVAL '3 hours' WHERE id = ${delivery.id}`;
    await runPoolTimeout();
    await runPoolTimeout();
    expect(notify.mock.calls.filter(([id, s]) => id === order.id && s === 'pool_timeout')).toHaveLength(1);
  });
});

describe('pagamento, aceite, cancelamento e estorno', () => {
  it('pedido pago chega à loja → paid; pedido ainda sem pagamento não avisa', async () => {
    emitOrderCreated({ _id: 'ord-pago', id: 'ord-pago', customerId: 'c1', storeId: 's1', status: 'criado', paymentStatus: 'paid' });
    emitOrderCreated({ _id: 'ord-pend', id: 'ord-pend', customerId: 'c1', storeId: 's1', status: 'criado', paymentStatus: 'pending' });
    expect(calledWith('ord-pago', 'paid')).toBe(true);
    expect(notify.mock.calls.some(([id]) => id === 'ord-pend')).toBe(false);
  });

  it('loja aceita → accepted', () => {
    emitOrderAcceptedByStore({ _id: 'ord-ac', id: 'ord-ac', customerId: 'c1', storeId: 's1', status: 'pago' });
    expect(calledWith('ord-ac', 'accepted')).toBe(true);
  });

  it('entrega concluída pelo emissor → delivered', () => {
    emitDeliveryCompleted({ _id: 'd1', motoboyId: 'm1' }, { _id: 'ord-ent', id: 'ord-ent', customerId: 'c1', storeId: 's1' });
    expect(calledWith('ord-ent', 'delivered')).toBe(true);
  });

  it('cancelamento → cancelled com o código do motivo (nunca o texto livre) e o valor devolvido', () => {
    emitOrderCancelled({ _id: 'ord-c', id: 'ord-c', customerId: 'c1', storeId: 's1' }, { reason: 'Loja fechou', reasonCode: 'store_closed', refundAmount: 30, cancelledBy: 'store' });
    expect(notify).toHaveBeenCalledWith('ord-c', 'cancelled', { reasonCode: 'store_closed', refundAmount: 30 });
  });

  it('cancelamento do suporte não avisa por aqui (o adminCancel manda o aviso próprio)', () => {
    emitOrderCancelled({ _id: 'ord-adm', id: 'ord-adm', customerId: 'c1', storeId: 's1' }, { reason: 'x', refundAmount: 30, cancelledBy: 'admin' });
    expect(notify.mock.calls.some(([id]) => id === 'ord-adm')).toBe(false);
  });

  it('estorno confirmado na conta da loja → refunded', async () => {
    const { store, order } = await cenario(null, { asaasPaymentId: 'pay_etapas_dir', status: 'cancelado' });
    expect(await markDirectOrderRefunded(store.id, 'pay_etapas_dir')).toBe(true);
    expect(calledWith(order.id, 'refunded')).toBe(true);
  });

  it('estorno confirmado na custódia → refunded', async () => {
    const { order } = await cenario(null, { asaasPaymentId: 'pay_etapas_cus', status: 'cancelado', paymentProvider: 'asaas' });
    await markOrderRefunded('pay_etapas_cus');
    expect(calledWith(order.id, 'refunded')).toBe(true);
  });

  it('Pix vencido sem pagamento → pix_expired', async () => {
    const { order } = await cenario(null, {
      status: 'criado', paymentStatus: 'pending', asaasChargeStatus: 'pending', paymentProvider: 'asaas', asaasPaymentId: 'pay_etapas_exp',
      createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    });
    await expireStalePixOrders();
    expect((await prisma.order.findUnique({ where: { id: order.id } }))?.status).toBe('cancelado');
    expect(calledWith(order.id, 'pix_expired')).toBe(true);
  });
});
