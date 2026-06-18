import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../app';
import User from '../models/User';
import Store from '../models/Store';
import Product from '../models/Product';
import Wallet from '../models/Wallet';
import Order from '../models/Order';
import StoreSubscription from '../models/StoreSubscription';
import Transaction from '../models/Transaction';

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_with_minimum_32_characters_length_ok';

let mongod: MongoMemoryReplSet;

// Helper: cria usuario diretamente no banco (bypassa upload de foto para lojista/motoboy)
async function createUserDirect(
  overrides: Record<string, any> = {}
): Promise<{ token: string; userId: string; user: any }> {
  const email = overrides.email || `user-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
  const password = overrides.password || 'Senha123!';
  const role = overrides.role || 'cliente';
  const roles = overrides.roles || (role !== 'cliente' ? [role, 'cliente'] : ['cliente']);

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name: overrides.name || 'Test User',
    email,
    passwordHash,
    role,
    roles,
    activeRole: role,
  });

  // Criar carteira automaticamente
  await Wallet.create({
    owner: user._id.toString(),
    ownerType: 'user',
    balance: 0,
    totalIncome: 0,
    totalSpent: 0,
    history: [],
  });

  const token = jwt.sign(
    { id: user._id.toString(), role, activeRole: role, roles },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  return { token, userId: user._id.toString(), user };
}

// Helper: cria cliente via HTTP (registro + login) — apenas para role cliente
async function createUserAndLogin(
  overrides: Record<string, any> = {}
): Promise<{ token: string; userId: string; user: any }> {
  const role = overrides.role || 'cliente';

  // Para roles que exigem foto (lojista, motoboy), usar criacao direta
  if (role !== 'cliente') {
    return createUserDirect(overrides);
  }

  const data = {
    name: 'Test User',
    email: `user-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`,
    password: 'Senha123!',
    ...overrides,
  };

  const regRes = await request(app).post('/api/auth/register').send(data);
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: data.email, password: data.password });

  return {
    token: loginRes.body.token,
    userId: regRes.body.id,
    user: loginRes.body.user,
  };
}

async function createStoreWithProduct(ownerId: string) {
  const store = await Store.create({
    ownerId: new mongoose.Types.ObjectId(ownerId),
    name: 'Loja Teste',
    address: 'Rua Teste, 123',
    plan: 1,
  });

  // Vincular storeId ao usuario
  await User.findByIdAndUpdate(ownerId, { storeId: store._id });

  const product = await Product.create({
    storeId: store._id,
    name: 'Produto Teste',
    price: 50,
    quantity: 100,
  });

  // Criar subscription da loja
  await StoreSubscription.create({
    storeId: store._id.toString(),
    storeName: 'Loja Teste',
    currentPlan: 'plan1',
    commissionRate: 10,
    planChangeStatus: 'none',
  });

  return { store, product };
}

async function fundWallet(userId: string, amount: number) {
  let wallet = await Wallet.findOne({ owner: userId, ownerType: 'user' });
  if (!wallet) {
    wallet = await Wallet.create({
      owner: userId,
      ownerType: 'user',
      balance: amount,
      totalIncome: amount,
      totalSpent: 0,
      history: [{ date: new Date(), type: 'credit', amount, reason: 'Seed' }],
    });
  } else {
    wallet.balance = amount;
    wallet.totalIncome = amount;
    await wallet.save();
  }
  return wallet;
}

beforeAll(async () => {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const uri = mongod.getUri();
  await mongoose.connect(uri);
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

describe('POST /api/orders (createOrder)', () => {
  it('deve criar pedido com sucesso e debitar carteira do cliente', async () => {
    // Setup: lojista com loja e produto
    const seller = await createUserAndLogin({ role: 'lojista', name: 'Lojista' });
    const { store, product } = await createStoreWithProduct(seller.userId);

    // Setup: cliente com saldo
    const client = await createUserAndLogin({ role: 'cliente', name: 'Cliente' });
    await fundWallet(client.userId, 500);

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        storeId: store._id.toString(),
        products: [
          { productId: product._id.toString(), quantity: 2, price: 50 },
        ],
        deliveryDistanceKm: 0,
        paymentMethod: 'pix',
        address: 'Rua Cliente, 456 - Bairro, Cidade - SP',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('_id');
    expect(res.body.status).toBe('criado');
    expect(res.body.totalValue).toBeGreaterThan(0);

    // Verificar carteira do cliente foi debitada
    const clientWallet = await Wallet.findOne({ owner: client.userId, ownerType: 'user' });
    expect(clientWallet!.balance).toBeLessThan(500);

    // Verificar carteira da loja foi creditada
    const storeWallet = await Wallet.findOne({ owner: store._id.toString(), ownerType: 'store' });
    expect(storeWallet).not.toBeNull();
    expect(storeWallet!.balance).toBeGreaterThan(0);
  });

  it('deve rejeitar pedido se saldo insuficiente', async () => {
    const seller = await createUserAndLogin({ role: 'lojista', name: 'Lojista' });
    const { store, product } = await createStoreWithProduct(seller.userId);

    const client = await createUserAndLogin({ role: 'cliente', name: 'Cliente' });
    await fundWallet(client.userId, 1); // Saldo insuficiente

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        storeId: store._id.toString(),
        products: [{ productId: product._id.toString(), quantity: 2, price: 50 }],
        deliveryDistanceKm: 0,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/saldo/i);
  });

  it('deve rejeitar pedido se role nao for cliente', async () => {
    const seller = await createUserAndLogin({ role: 'lojista', name: 'Lojista' });
    const { store, product } = await createStoreWithProduct(seller.userId);

    // Lojista tentando comprar sem switchar para cliente
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${seller.token}`)
      .send({
        storeId: store._id.toString(),
        products: [{ productId: product._id.toString(), quantity: 1, price: 50 }],
        deliveryDistanceKm: 0,
      });

    expect(res.status).toBe(403);
  });

  it('deve rejeitar pedido sem produtos', async () => {
    const seller = await createUserAndLogin({ role: 'lojista', name: 'Lojista' });
    const { store } = await createStoreWithProduct(seller.userId);

    const client = await createUserAndLogin({ role: 'cliente', name: 'Cliente' });
    await fundWallet(client.userId, 500);

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        storeId: store._id.toString(),
        products: [],
        deliveryDistanceKm: 0,
      });

    // Zod validation or controller check
    expect([400, 422]).toContain(res.status);
  });

  it('deve rejeitar pedido sem storeId', async () => {
    const client = await createUserAndLogin({ role: 'cliente', name: 'Cliente' });
    await fundWallet(client.userId, 500);

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        products: [{ productId: new mongoose.Types.ObjectId().toString(), quantity: 1, price: 50 }],
        deliveryDistanceKm: 0,
      });

    expect([400, 422]).toContain(res.status);
  });

  it('deve retornar 401 sem token de autenticacao', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({
        storeId: new mongoose.Types.ObjectId().toString(),
        products: [{ productId: new mongoose.Types.ObjectId().toString(), quantity: 1, price: 50 }],
        deliveryDistanceKm: 0,
      });

    expect(res.status).toBe(401);
  });

  it('deve impedir compra com estoque insuficiente', async () => {
    const seller = await createUserAndLogin({ role: 'lojista', name: 'Lojista' });
    const { store } = await createStoreWithProduct(seller.userId);

    // Produto com estoque limitado
    const limitedProduct = await Product.create({
      storeId: store._id,
      name: 'Produto Limitado',
      price: 10,
      quantity: 2,
    });

    const client = await createUserAndLogin({ role: 'cliente', name: 'Cliente' });
    await fundWallet(client.userId, 500);

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        storeId: store._id.toString(),
        products: [{ productId: limitedProduct._id.toString(), quantity: 5, price: 10 }],
        deliveryDistanceKm: 0,
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/estoque/i);
  });

  it('deve suportar idempotencia (mesmo pedido nao duplica)', async () => {
    const seller = await createUserAndLogin({ role: 'lojista', name: 'Lojista' });
    const { store, product } = await createStoreWithProduct(seller.userId);

    const client = await createUserAndLogin({ role: 'cliente', name: 'Cliente' });
    await fundWallet(client.userId, 5000);

    const idempotentKey = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

    const orderPayload = {
      storeId: store._id.toString(),
      products: [{ productId: product._id.toString(), quantity: 1, price: 50 }],
      deliveryDistanceKm: 0,
      paymentMethod: 'pix',
      idempotentKey,
    };

    const res1 = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${client.token}`)
      .send(orderPayload);

    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${client.token}`)
      .send(orderPayload);

    // Deve retornar o pedido existente sem criar duplicata
    expect(res2.status).toBe(200);
    expect(res2.body._id).toBe(res1.body._id);

    // Verificar que so existe 1 pedido
    const orderCount = await Order.countDocuments({ customerId: client.userId });
    expect(orderCount).toBe(1);
  });

  it('deve registrar transaction apos criar pedido', async () => {
    const seller = await createUserAndLogin({ role: 'lojista', name: 'Lojista' });
    const { store, product } = await createStoreWithProduct(seller.userId);

    const client = await createUserAndLogin({ role: 'cliente', name: 'Cliente' });
    await fundWallet(client.userId, 500);

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        storeId: store._id.toString(),
        products: [{ productId: product._id.toString(), quantity: 1, price: 50 }],
        deliveryDistanceKm: 0,
        paymentMethod: 'pix',
      });

    expect(res.status).toBe(201);

    const transaction = await Transaction.findOne({ orderId: res.body._id });
    expect(transaction).not.toBeNull();
    expect(transaction!.amount).toBe(res.body.totalValue);
    expect(transaction!.paymentMethod).toBe('pix');
  });
});

describe('GET /api/orders', () => {
  it('deve listar pedidos do cliente autenticado com paginacao', async () => {
    const seller = await createUserAndLogin({ role: 'lojista', name: 'Lojista' });
    const { store, product } = await createStoreWithProduct(seller.userId);

    const client = await createUserAndLogin({ role: 'cliente', name: 'Cliente' });
    await fundWallet(client.userId, 5000);

    // Criar 3 pedidos
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${client.token}`)
        .send({
          storeId: store._id.toString(),
          products: [{ productId: product._id.toString(), quantity: 1, price: 50 }],
          deliveryDistanceKm: 0,
          paymentMethod: 'pix',
        });
    }

    const res = await request(app)
      .get('/api/orders?page=1&limit=2')
      .set('Authorization', `Bearer ${client.token}`);

    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(2);
    expect(res.body.pagination.total).toBe(3);
    expect(res.body.pagination.pages).toBe(2);
  });
});

describe('GET /api/orders/:id', () => {
  it('deve retornar detalhes do pedido para o cliente dono', async () => {
    const seller = await createUserAndLogin({ role: 'lojista', name: 'Lojista' });
    const { store, product } = await createStoreWithProduct(seller.userId);

    const client = await createUserAndLogin({ role: 'cliente', name: 'Cliente' });
    await fundWallet(client.userId, 500);

    const createRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        storeId: store._id.toString(),
        products: [{ productId: product._id.toString(), quantity: 1, price: 50 }],
        deliveryDistanceKm: 0,
        paymentMethod: 'pix',
      });

    const res = await request(app)
      .get(`/api/orders/${createRes.body._id}`)
      .set('Authorization', `Bearer ${client.token}`);

    expect(res.status).toBe(200);
    expect(res.body._id).toBe(createRes.body._id);
    expect(res.body).toHaveProperty('storeName');
  });

  it('deve rejeitar acesso ao pedido de outro usuario', async () => {
    const seller = await createUserAndLogin({ role: 'lojista', name: 'Lojista' });
    const { store, product } = await createStoreWithProduct(seller.userId);

    const client = await createUserAndLogin({ role: 'cliente', name: 'Cliente' });
    await fundWallet(client.userId, 500);

    const createRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        storeId: store._id.toString(),
        products: [{ productId: product._id.toString(), quantity: 1, price: 50 }],
        deliveryDistanceKm: 0,
        paymentMethod: 'pix',
      });

    // Outro usuario tenta acessar
    const otherUser = await createUserAndLogin({ name: 'Outro' });

    const res = await request(app)
      .get(`/api/orders/${createRes.body._id}`)
      .set('Authorization', `Bearer ${otherUser.token}`);

    expect(res.status).toBe(403);
  });
});
