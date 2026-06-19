import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../app';
import User from '../models/User';
import Wallet from '../models/Wallet';
import Store from '../models/Store';
import Order from '../models/Order';
import Delivery from '../models/Delivery';
import Payout from '../models/Payout';
import AppCashbox from '../models/AppCashbox';

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_with_minimum_32_characters_length_ok';

let mongod: MongoMemoryReplSet;

beforeAll(async () => {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(mongod.getUri());
  // warm-up do primary p/ transações (evita flaky na 1ª transação)
  const s = await mongoose.startSession();
  try {
    await s.withTransaction(async () => {
      await mongoose.connection.db.collection('_warmup').insertOne({ ok: 1 }, { session: s });
    });
  } finally {
    await s.endSession();
  }
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

async function createUser(role: string) {
  const passwordHash = await bcrypt.hash('Senha123!', 10);
  const roles = role !== 'cliente' ? [role, 'cliente'] : ['cliente'];
  const user = await User.create({
    name: `${role} test`,
    email: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`,
    passwordHash,
    role,
    roles,
    activeRole: role,
  });
  const token = jwt.sign(
    { id: user._id.toString(), role, activeRole: role, roles },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  return { user, token, id: user._id.toString() };
}

// ============================================================
// Bug #1: compensação do motoboy no cancelamento tardio
// Antes do fix: creditava motoboyWallet.balance cru, que era sobrescrito
// pela reconciliação (Payout) em getMotoboyWallet → compensação sumia.
// Depois do fix: vira um Payout 'released' (reconciliável e sacável) e a
// multa inteira entra no AppCashbox p/ dar lastro.
// ============================================================
describe('Cancelamento tardio pelo cliente — compensação do motoboy (bug #1)', () => {
  it('cria a compensação como Payout released e financia o AppCashbox com a multa inteira', async () => {
    const motoboy = await createUser('motoboy');
    const customer = await createUser('cliente');

    // Carteira do cliente com saldo (a multa sai daqui)
    await Wallet.create({ owner: customer.id, ownerType: 'user', balance: 1000, totalIncome: 1000, totalSpent: 0, history: [] });
    // Carteira do motoboy (mirror; a fonte da verdade é o Payout)
    await Wallet.create({ owner: motoboy.id, ownerType: 'motoboy', balance: 0, totalIncome: 0, totalSpent: 0, availableBalance: 0, pendingBalance: 0, history: [] });
    // Caixa do app com saldo inicial
    await AppCashbox.create({ balance: 500, totalIncome: 500, totalExpenses: 0, history: [] });

    const store = await Store.create({ ownerId: new mongoose.Types.ObjectId(), name: 'Loja Teste' });

    // Pedido já 'enviado' (em trânsito) → cancelamento será tardio (isLate)
    const order = await Order.create({
      customerId: new mongoose.Types.ObjectId(customer.id),
      storeId: store._id,
      products: [{ productId: new mongoose.Types.ObjectId(), quantity: 1, price: 200 }],
      totalValue: 200,
      deliveryFee: 0,
      status: 'enviado',
      paymentMethod: 'pix',
      paymentStatus: 'paid',
    });

    const delivery = await Delivery.create({
      orderId: order._id,
      motoboyId: new mongoose.Types.ObjectId(motoboy.id),
      fee: 0,
      status: 'picked',
    });
    order.deliveryId = delivery._id;
    await order.save();

    const res = await request(app)
      .post(`/api/orders/${order._id}/cancel`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ reason: 'Mudei de ideia' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelado');
    expect(res.body.isLateCancellation).toBe(true);

    // Config padrão: 10% do total = R$20 de multa; 50% (R$10) p/ o motoboy, 50% (R$10) app.
    // PROVA #1: existe um Payout 'released' do motoboy com a compensação.
    const compPayout = await Payout.findOne({
      recipientType: 'motoboy',
      recipientId: new mongoose.Types.ObjectId(motoboy.id),
      status: 'released',
    });
    expect(compPayout).not.toBeNull();
    expect(compPayout!.amount).toBeCloseTo(10, 2);

    // PROVA #1 (lastro): o AppCashbox recebeu a multa INTEIRA (R$20), não só o appShare (R$10).
    const cashbox = await AppCashbox.findOne();
    const feeEntry = cashbox!.history.find((h: any) => h.source === 'cancelled_order');
    expect(feeEntry).toBeTruthy();
    expect(feeEntry!.amount).toBeCloseTo(20, 2);

    // PROVA #1 (sacável): a reconciliação por Payout enxerga a compensação como saldo disponível.
    const walletRes = await request(app)
      .get(`/api/wallets/motoboy/${motoboy.id}`)
      .set('Authorization', `Bearer ${motoboy.token}`);
    expect(walletRes.status).toBe(200);
    expect(walletRes.body.availableBalance).toBeCloseTo(10, 2);
  });
});
