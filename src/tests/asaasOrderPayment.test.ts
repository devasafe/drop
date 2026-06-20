import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// Mock do serviço de pagamento Asaas — sem rede.
jest.mock('../services/asaas/payment', () => ({
  __esModule: true,
  ensureAsaasCustomer: jest.fn(async () => 'cus_test'),
  createPixCharge: jest.fn(async () => ({
    paymentId: 'pay_test_1',
    status: 'PENDING',
    qrCodePayload: '000201-pix-copia-e-cola',
    qrCodeImage: 'base64img',
  })),
}));

import app from '../app';
import env from '../config/env';
import User from '../models/User';
import Store from '../models/Store';
import Product from '../models/Product';
import Wallet from '../models/Wallet';
import Order from '../models/Order';
import Payout from '../models/Payout';
import { ensureAsaasCustomer, createPixCharge } from '../services/asaas/payment';

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_with_minimum_32_characters_length_ok';
let mongod: MongoMemoryReplSet;

beforeAll(async () => {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(mongod.getUri());
  const s = await mongoose.startSession();
  try {
    await s.withTransaction(async () => {
      await mongoose.connection.db.collection('_warmup').insertOne({ ok: 1 }, { session: s });
    });
  } finally {
    await s.endSession();
  }
  env.PAYMENT_GATEWAY = 'asaas'; // ativa o fluxo de gateway neste arquivo
}, 60000);

afterAll(async () => {
  env.PAYMENT_GATEWAY = 'none';
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  for (const key in mongoose.connection.collections) {
    await mongoose.connection.collections[key].deleteMany({});
  }
  (ensureAsaasCustomer as jest.Mock).mockClear();
  (createPixCharge as jest.Mock).mockClear();
});

async function verifiedBuyer() {
  const user = await User.create({
    name: 'Comprador',
    email: `buyer-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`,
    passwordHash: await bcrypt.hash('Senha123!', 10),
    role: 'cliente',
    roles: ['cliente'],
    activeRole: 'cliente',
    cpf: '39053344705',
    verification: {
      email: { status: 'verified' },
      phone: { status: 'verified' },
      document: { status: 'approved', type: 'cpf', number: '39053344705' },
    },
  });
  await Wallet.create({ owner: String(user._id), ownerType: 'user', balance: 0, totalIncome: 0, totalSpent: 0, history: [] });
  const token = jwt.sign({ id: String(user._id), role: 'cliente', activeRole: 'cliente', roles: ['cliente'] }, JWT_SECRET);
  return { user, token };
}

describe('createOrder com Asaas (Fase 2)', () => {
  it('cria cobrança PIX, devolve o copia-e-cola e NÃO debita carteira nem cria Payout', async () => {
    const { user, token } = await verifiedBuyer();
    const store = await Store.create({ ownerId: new mongoose.Types.ObjectId(), name: 'Loja PIX', isOpen: true });
    const product = await Product.create({ storeId: store._id, name: 'Item', price: 100, quantity: 10 } as any);

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        storeId: String(store._id),
        products: [{ productId: String(product._id), quantity: 1 }],
        paymentMethod: 'pix',
        deliveryDistanceKm: 0,
        address: 'Rua X, 1 - Centro',
      });

    expect(res.status).toBe(201);
    expect(res.body.pix?.paymentId).toBe('pay_test_1');
    expect(res.body.pix?.qrCodePayload).toBeTruthy();
    expect(res.body.order?.asaasPaymentId).toBe('pay_test_1');
    expect(res.body.order?.asaasChargeStatus).toBe('pending');
    expect(res.body.order?.paymentStatus).toBe('pending');
    expect(createPixCharge).toHaveBeenCalledTimes(1);

    // NÃO debitou a carteira do cliente (saldo segue 0)
    const wallet = await Wallet.findOne({ owner: String(user._id), ownerType: 'user' });
    expect(wallet!.balance).toBe(0);

    // Ainda NÃO criou Payout (só nasce na confirmação do webhook)
    const payouts = await Payout.countDocuments({ orderId: res.body.order._id });
    expect(payouts).toBe(0);
  });

  it('recusa cartão por enquanto (só PIX na Fase 2)', async () => {
    const { token } = await verifiedBuyer();
    const store = await Store.create({ ownerId: new mongoose.Types.ObjectId(), name: 'Loja', isOpen: true });
    const product = await Product.create({ storeId: store._id, name: 'Item', price: 50, quantity: 5 } as any);

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ storeId: String(store._id), products: [{ productId: String(product._id), quantity: 1 }], paymentMethod: 'credit_card', deliveryDistanceKm: 0, address: 'Rua X, 1 - Centro' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/PIX/i);
  });

  it('usa saldo parcial → cobra só o restante no PIX', async () => {
    const { user, token } = await verifiedBuyer();
    await Wallet.updateOne({ owner: String(user._id), ownerType: 'user' }, { $set: { balance: 30 } });
    const store = await Store.create({ ownerId: new mongoose.Types.ObjectId(), name: 'Loja', isOpen: true });
    const product = await Product.create({ storeId: store._id, name: 'Item', price: 100, quantity: 10 } as any);

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ storeId: String(store._id), products: [{ productId: String(product._id), quantity: 1 }], paymentMethod: 'pix', deliveryDistanceKm: 0, address: 'Rua X, 1 - Centro', useWalletBalance: true });

    expect(res.status).toBe(201);
    // cobrança PIX só do restante (100 - 30 = 70)
    expect((createPixCharge as jest.Mock).mock.calls[0][0].value).toBe(70);
    expect(res.body.order?.walletApplied).toBe(30);
    // saldo debitado
    const wallet = await Wallet.findOne({ owner: String(user._id), ownerType: 'user' });
    expect(wallet!.balance).toBe(0);
  });

  it('saldo cobre tudo → sem PIX, pedido já pago + payout da loja', async () => {
    const { user, token } = await verifiedBuyer();
    await Wallet.updateOne({ owner: String(user._id), ownerType: 'user' }, { $set: { balance: 200 } });
    const store = await Store.create({ ownerId: new mongoose.Types.ObjectId(), name: 'Loja', isOpen: true });
    const product = await Product.create({ storeId: store._id, name: 'Item', price: 100, quantity: 10 } as any);

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ storeId: String(store._id), products: [{ productId: String(product._id), quantity: 1 }], paymentMethod: 'pix', deliveryDistanceKm: 0, address: 'Rua X, 1 - Centro', useWalletBalance: true });

    expect(res.status).toBe(201);
    expect(res.body.pix).toBeNull(); // sem PIX
    expect(createPixCharge).not.toHaveBeenCalled();
    expect(res.body.order?.paymentStatus).toBe('paid');
    // saldo debitado (200 - 100)
    const wallet = await Wallet.findOne({ owner: String(user._id), ownerType: 'user' });
    expect(wallet!.balance).toBe(100);
    // payout da loja criado (pago)
    const payout = await Payout.findOne({ orderId: res.body.order._id, recipientType: 'store' });
    expect(payout).not.toBeNull();
  });
});

describe('Webhook confirma pagamento (Fase 2)', () => {
  it('PAYMENT_RECEIVED → pedido vira pago e cria Payout pending da loja', async () => {
    const { user } = await verifiedBuyer();
    const store = await Store.create({ ownerId: new mongoose.Types.ObjectId(), name: 'Loja', isOpen: true });

    const order = await Order.create({
      customerId: user._id,
      storeId: store._id,
      products: [{ productId: new mongoose.Types.ObjectId(), quantity: 1, price: 100 }],
      totalValue: 100,
      deliveryFee: 0,
      status: 'criado',
      paymentMethod: 'pix',
      paymentStatus: 'pending',
      asaasPaymentId: 'pay_hook_1',
      asaasChargeStatus: 'pending',
      walletDistribution: { storeAmount: 90, appCommission: 10, commissionPercent: 10 },
    });

    const res = await request(app)
      .post('/webhooks/asaas')
      .send({
        id: 'evt_pay_1',
        event: 'PAYMENT_RECEIVED',
        payment: { id: 'pay_hook_1', status: 'RECEIVED', externalReference: String(order._id) },
      });

    expect(res.status).toBe(200);

    const updated = await Order.findById(order._id);
    expect(updated!.paymentStatus).toBe('paid');
    expect(updated!.asaasChargeStatus).toBe('received');

    const payout = await Payout.findOne({ orderId: order._id, recipientType: 'store' });
    expect(payout).not.toBeNull();
    expect(payout!.amount).toBe(90);
    expect(payout!.status).toBe('pending');
  });

  it('é idempotente: webhook repetido não cria Payout duplicado', async () => {
    const { user } = await verifiedBuyer();
    const store = await Store.create({ ownerId: new mongoose.Types.ObjectId(), name: 'Loja', isOpen: true });
    const order = await Order.create({
      customerId: user._id, storeId: store._id,
      products: [{ productId: new mongoose.Types.ObjectId(), quantity: 1, price: 100 }],
      totalValue: 100, deliveryFee: 0, status: 'criado', paymentMethod: 'pix', paymentStatus: 'pending',
      asaasPaymentId: 'pay_hook_2', asaasChargeStatus: 'pending',
      walletDistribution: { storeAmount: 90, appCommission: 10, commissionPercent: 10 },
    });

    const body = { id: 'evt_pay_2', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_hook_2', status: 'RECEIVED', externalReference: String(order._id) } };
    await request(app).post('/webhooks/asaas').send(body);
    await request(app).post('/webhooks/asaas').send(body); // duplicado

    const payouts = await Payout.countDocuments({ orderId: order._id, recipientType: 'store' });
    expect(payouts).toBe(1);
  });
});
