import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

jest.mock('../services/asaas/refund', () => ({
  __esModule: true,
  refundOrderCharge: jest.fn(async () => {}),
}));

import app from '../app';
import { ownerIdForStore, customerIdForOrder, productIdForItem } from './helpers/storeOwner';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';

import { createWallet, findWallet, createPayout, findPayout } from './helpers/financePg';

import { refundOrderCharge } from '../services/asaas/refund';

const refundMock = refundOrderCharge as jest.Mock;
const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_with_minimum_32_characters_length_ok';

beforeAll(async () => {
  env.PAYMENT_GATEWAY = 'asaas';
}, 60000);

afterAll(async () => {
  env.PAYMENT_GATEWAY = 'none';
});

afterEach(async () => {
  await cleanupUsersByEmailDomain('@aref.test');
  refundMock.mockClear();
});

describe('Cancelamento com Asaas (Fase 5 — estorno real)', () => {
  it('estorna de verdade no Asaas e NÃO credita carteira virtual', async () => {
    const customer = await prisma.user.create({
      data: {
        name: 'Cliente', email: `c-${Date.now()}@aref.test`, passwordHash: await bcrypt.hash('Senha123!', 10),
        role: 'cliente', roles: ['cliente'], activeRole: 'cliente',
      },
    });
    await createWallet({ owner: customer.id, ownerType: 'user', balance: 0, totalIncome: 0, totalSpent: 0 });
    const token = jwt.sign({ id: customer.id, role: 'cliente', activeRole: 'cliente', roles: ['cliente'] }, JWT_SECRET);
    const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore('@aref.test'), name: 'Loja' } });

    const order = await prisma.order.create({ data: {
      customerId: customer.id, storeId: store.id,
      items: { create: [{ productId: await productIdForItem('@aref.test', 100), quantity: 1, price: 100 }] },
      totalValue: 100, deliveryFee: 0, status: 'pago', paymentMethod: 'pix',
      paymentStatus: 'paid', asaasPaymentId: 'pay_refund_1', asaasChargeStatus: 'received',
      walletDistribution: { storeAmount: 90, appCommission: 10, commissionPercent: 10 },
    }, include: { items: true } });
    await createPayout({ recipientType: 'store', recipientId: store.id, orderId: order.id, amount: 90, status: 'pending' });

    const res = await request(app)
      .post(`/api/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Desisti' });

    expect(res.status).toBe(200);
    // Pedido pago mas NÃO aceito pela loja (acceptedAt=null) ⇒ sem taxa ⇒ estorno CHEIO (100).
    // O estorno agora passa o VALUE explícito (Task 5: refund parcial descontado da taxa).
    expect(refundMock).toHaveBeenCalledWith('pay_refund_1', 100);

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated!.paymentStatus).toBe('refunded');
    expect(updated!.asaasChargeStatus).toBe('refunded');

    // carteira virtual NÃO foi creditada (estorno é real, volta pro PIX)
    const wallet = await findWallet({ owner: String(customer.id), ownerType: 'user' });
    expect(wallet!.balance).toBe(0);

    // payout da loja foi cancelado (espelho)
    const payout = await findPayout({ orderId: order.id, recipientType: 'store' });
    expect(payout!.status).toBe('cancelled');
  });
});

describe('Webhook PAYMENT_REFUNDED (Fase 5)', () => {
  it('marca o pedido como estornado', async () => {
    const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore('@aref.test'), name: 'Loja' } });
    const order = await prisma.order.create({ data: {
      customerId: await customerIdForOrder('@aref.test'), storeId: store.id,
      items: { create: [{ productId: await productIdForItem('@aref.test', 50), quantity: 1, price: 50 }] },
      totalValue: 50, deliveryFee: 0, status: 'pago', paymentMethod: 'pix',
      paymentStatus: 'paid', asaasPaymentId: 'pay_refund_2', asaasChargeStatus: 'received',
    }, include: { items: true } });

    const res = await request(app).post('/webhooks/asaas').send({
      id: 'evt_refund_1', event: 'PAYMENT_REFUNDED',
      payment: { id: 'pay_refund_2', status: 'REFUNDED', externalReference: String(order.id) },
    });
    expect(res.status).toBe(200);

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated!.asaasChargeStatus).toBe('refunded');
    expect(updated!.paymentStatus).toBe('refunded');
  });
});
