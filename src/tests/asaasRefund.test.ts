import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

jest.mock('../services/asaas/refund', () => ({
  __esModule: true,
  refundOrderCharge: jest.fn(async () => {}),
}));

import app from '../app';
import env from '../config/env';
import User from '../models/User';
import Store from '../models/Store';
import Wallet from '../models/Wallet';
import Order from '../models/Order';
import Payout from '../models/Payout';
import { refundOrderCharge } from '../services/asaas/refund';

const refundMock = refundOrderCharge as jest.Mock;
const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_with_minimum_32_characters_length_ok';
let mongod: MongoMemoryReplSet;

beforeAll(async () => {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(mongod.getUri());
  const s = await mongoose.startSession();
  try { await s.withTransaction(async () => { await mongoose.connection.db.collection('_w').insertOne({ ok: 1 }, { session: s }); }); } finally { await s.endSession(); }
  env.PAYMENT_GATEWAY = 'asaas';
}, 60000);

afterAll(async () => {
  env.PAYMENT_GATEWAY = 'none';
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  for (const key in mongoose.connection.collections) await mongoose.connection.collections[key].deleteMany({});
  refundMock.mockClear();
});

describe('Cancelamento com Asaas (Fase 5 — estorno real)', () => {
  it('estorna de verdade no Asaas e NÃO credita carteira virtual', async () => {
    const customer = await User.create({
      name: 'Cliente', email: `c-${Date.now()}@t.com`, passwordHash: await bcrypt.hash('Senha123!', 10),
      role: 'cliente', roles: ['cliente'], activeRole: 'cliente',
    });
    await Wallet.create({ owner: String(customer._id), ownerType: 'user', balance: 0, totalIncome: 0, totalSpent: 0, history: [] });
    const token = jwt.sign({ id: String(customer._id), role: 'cliente', activeRole: 'cliente', roles: ['cliente'] }, JWT_SECRET);
    const store = await Store.create({ ownerId: new mongoose.Types.ObjectId(), name: 'Loja' });

    const order = await Order.create({
      customerId: customer._id, storeId: store._id,
      products: [{ productId: new mongoose.Types.ObjectId(), quantity: 1, price: 100 }],
      totalValue: 100, deliveryFee: 0, status: 'pago', paymentMethod: 'pix',
      paymentStatus: 'paid', asaasPaymentId: 'pay_refund_1', asaasChargeStatus: 'received',
      walletDistribution: { storeAmount: 90, appCommission: 10, commissionPercent: 10 },
    });
    await Payout.create({ recipientType: 'store', recipientId: store._id, orderId: order._id, amount: 90, status: 'pending' });

    const res = await request(app)
      .post(`/api/orders/${order._id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Desisti' });

    expect(res.status).toBe(200);
    expect(refundMock).toHaveBeenCalledWith('pay_refund_1');

    const updated = await Order.findById(order._id);
    expect(updated!.paymentStatus).toBe('refunded');
    expect(updated!.asaasChargeStatus).toBe('refunded');

    // carteira virtual NÃO foi creditada (estorno é real, volta pro PIX)
    const wallet = await Wallet.findOne({ owner: String(customer._id), ownerType: 'user' });
    expect(wallet!.balance).toBe(0);

    // payout da loja foi cancelado (espelho)
    const payout = await Payout.findOne({ orderId: order._id, recipientType: 'store' });
    expect(payout!.status).toBe('cancelled');
  });
});

describe('Webhook PAYMENT_REFUNDED (Fase 5)', () => {
  it('marca o pedido como estornado', async () => {
    const store = await Store.create({ ownerId: new mongoose.Types.ObjectId(), name: 'Loja' });
    const order = await Order.create({
      customerId: new mongoose.Types.ObjectId(), storeId: store._id,
      products: [{ productId: new mongoose.Types.ObjectId(), quantity: 1, price: 50 }],
      totalValue: 50, deliveryFee: 0, status: 'pago', paymentMethod: 'pix',
      paymentStatus: 'paid', asaasPaymentId: 'pay_refund_2', asaasChargeStatus: 'received',
    });

    const res = await request(app).post('/webhooks/asaas').send({
      id: 'evt_refund_1', event: 'PAYMENT_REFUNDED',
      payment: { id: 'pay_refund_2', status: 'REFUNDED', externalReference: String(order._id) },
    });
    expect(res.status).toBe(200);

    const updated = await Order.findById(order._id);
    expect(updated!.asaasChargeStatus).toBe('refunded');
    expect(updated!.paymentStatus).toBe('refunded');
  });
});
