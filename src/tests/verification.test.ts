/**
 * Testes da Fase 1 de verificação de conta (KYC) — cliente.
 * - Unit: validador de CPF e regra isClientVerified.
 * - Integração: gate de compra, verificação de email por token, aprovação pelo admin.
 */
import request from 'supertest';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../app';
import User from '../models/User';
import Wallet from '../models/Wallet';
import Store from '../models/Store';
import Product from '../models/Product';
import EmailVerificationToken from '../models/EmailVerificationToken';
import { isValidCPF, isValidRG } from '../utils/documentValidation';
import { isClientVerified, missingClientVerifications } from '../utils/clientVerification';

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_with_minimum_32_characters_length_ok';

// ===================== UNIT =====================
describe('Unit: validação de CPF', () => {
  it('aceita CPF válido', () => {
    expect(isValidCPF('529.982.247-25')).toBe(true);
    expect(isValidCPF('52998224725')).toBe(true);
  });
  it('rejeita CPF inválido', () => {
    expect(isValidCPF('52998224724')).toBe(false); // dígito errado
    expect(isValidCPF('11111111111')).toBe(false); // todos iguais
    expect(isValidCPF('123')).toBe(false);          // curto
  });
  it('RG: validação leve por tamanho', () => {
    expect(isValidRG('123456789')).toBe(true);
    expect(isValidRG('12')).toBe(false);
  });
});

describe('Unit: isClientVerified / missing', () => {
  it('lista tudo faltando quando não há verificação', () => {
    expect(missingClientVerifications({})).toEqual(['email', 'document']);
    expect(isClientVerified({})).toBe(false);
  });
  it('verificado quando email+phone verified e documento approved', () => {
    const user = {
      verification: {
        email: { status: 'verified' },
        phone: { status: 'verified' },
        document: { status: 'approved' },
      },
    };
    expect(missingClientVerifications(user)).toEqual([]);
    expect(isClientVerified(user)).toBe(true);
  });
  it('ainda falta quando documento só pendente', () => {
    const user = {
      verification: {
        email: { status: 'verified' },
        phone: { status: 'verified' },
        document: { status: 'pending' },
      },
    };
    expect(missingClientVerifications(user)).toEqual(['document']);
  });
});

// ===================== INTEGRAÇÃO =====================
let mongod: MongoMemoryReplSet;

async function createUser(role = 'cliente', verification?: any): Promise<{ token: string; userId: string }> {
  const passwordHash = await bcrypt.hash('Senha123!', 10);
  const roles = role !== 'cliente' ? [role, 'cliente'] : ['cliente'];
  const user = await User.create({
    name: `User ${role}`,
    email: `u-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`,
    passwordHash, role, roles, activeRole: role,
    verification,
  });
  const token = jwt.sign({ id: user._id.toString(), role, activeRole: role, roles }, JWT_SECRET, { expiresIn: '7d' });
  return { token, userId: user._id.toString() };
}

beforeAll(async () => {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(mongod.getUri());
  // warm-up: garante o primary pronto para transações (evita flaky na 1ª transação)
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
  for (const key in collections) await collections[key].deleteMany({});
});

describe('Gate de compra (KYC)', () => {
  it('bloqueia compra de cliente não verificado com 403 e lista o que falta', async () => {
    const customer = await createUser('cliente'); // sem verification
    const lojista = await createUser('lojista');
    await Wallet.create({ owner: customer.userId, ownerType: 'user', balance: 1000, totalIncome: 1000, totalSpent: 0 });
    const store = await Store.create({ ownerId: lojista.userId, name: 'Loja KYC', isOpen: true });
    const product = await Product.create({ storeId: store._id, name: 'P', price: 50, quantity: 10 });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        storeId: store._id.toString(),
        products: [{ productId: product._id.toString(), quantity: 1 }],
        deliveryDistanceKm: 0,
        paymentMethod: 'pix',
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_NOT_VERIFIED');
    expect(res.body.missing).toEqual(expect.arrayContaining(['email', 'document']));
  });

  it('permite compra quando o cliente está totalmente verificado', async () => {
    const customer = await createUser('cliente', {
      email: { status: 'verified' },
      phone: { status: 'verified', e164: '+5511988887777' },
      document: { type: 'cpf', status: 'approved' },
    });
    const lojista = await createUser('lojista');
    await Wallet.create({ owner: customer.userId, ownerType: 'user', balance: 1000, totalIncome: 1000, totalSpent: 0 });
    const store = await Store.create({ ownerId: lojista.userId, name: 'Loja KYC2', isOpen: true });
    const product = await Product.create({ storeId: store._id, name: 'P', price: 50, quantity: 10 });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        storeId: store._id.toString(),
        products: [{ productId: product._id.toString(), quantity: 1 }],
        deliveryDistanceKm: 0,
        paymentMethod: 'pix',
      });

    expect(res.status).toBe(201);
  });
});

describe('Verificação de email por código', () => {
  const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

  it('verifica o email com código válido', async () => {
    const { token, userId } = await createUser('cliente');
    const code = '123456';
    await EmailVerificationToken.create({ userId, tokenHash: hash(code), expiresAt: new Date(Date.now() + 60000) });

    const res = await request(app).post('/api/verification/email/verify')
      .set('Authorization', `Bearer ${token}`).send({ code });
    expect(res.status).toBe(200);

    const user = await User.findById(userId);
    expect(user!.verification!.email.status).toBe('verified');
  });

  it('rejeita código incorreto', async () => {
    const { token, userId } = await createUser('cliente');
    await EmailVerificationToken.create({ userId, tokenHash: hash('123456'), expiresAt: new Date(Date.now() + 60000) });

    const res = await request(app).post('/api/verification/email/verify')
      .set('Authorization', `Bearer ${token}`).send({ code: '000000' });
    expect(res.status).toBe(400);
  });
});

describe('Aprovação de documento pelo admin', () => {
  it('admin aprova documento pendente', async () => {
    const ceo = await createUser('ceo');
    const { userId } = await createUser('cliente', {
      email: { status: 'verified' },
      phone: { status: 'verified' },
      document: { type: 'cpf', status: 'pending', frontUrl: 'x', backUrl: 'y', submittedAt: new Date() },
    });

    const res = await request(app)
      .post(`/api/verification/admin/${userId}/approve`)
      .set('Authorization', `Bearer ${ceo.token}`);
    expect(res.status).toBe(200);

    const user = await User.findById(userId);
    expect(user!.verification!.document.status).toBe('approved');
  });

  it('cliente comum não pode aprovar', async () => {
    const intruso = await createUser('cliente');
    const alvo = await createUser('cliente', {
      email: { status: 'verified' }, phone: { status: 'verified' },
      document: { type: 'cpf', status: 'pending' },
    });
    const res = await request(app)
      .post(`/api/verification/admin/${alvo.userId}/approve`)
      .set('Authorization', `Bearer ${intruso.token}`);
    expect(res.status).toBe(403);
  });
});

describe('Editar dados pessoais reseta verificação', () => {
  it('mudar CPF com documento APROVADO é bloqueado', async () => {
    const { token } = await createUser('cliente', {
      email: { status: 'verified' },
      document: { type: 'cpf', status: 'approved', number: '52998224725' },
    });
    const res = await request(app).patch('/api/user/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ cpf: '111.444.777-35' });
    expect(res.status).toBe(409);
  });

  it('mudar CPF com documento ainda não aprovado atualiza e reseta (status none)', async () => {
    const { token, userId } = await createUser('cliente', {
      email: { status: 'verified' },
      document: { type: 'cpf', status: 'none', number: '52998224725' },
    });
    const res = await request(app).patch('/api/user/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ cpf: '111.444.777-35' });
    expect(res.status).toBe(200);
    const user = await User.findById(userId);
    expect(user!.cpf).toBe('11144477735'); // armazenado em dígitos
    expect(user!.verification!.document.status).toBe('none');
  });

  it('mudar email reseta a verificação de email', async () => {
    const { token, userId } = await createUser('cliente', { email: { status: 'verified' }, document: { status: 'approved' } });
    const res = await request(app).patch('/api/user/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: `novo-${Date.now()}@test.com` });
    expect(res.status).toBe(200);
    const user = await User.findById(userId);
    expect(user!.verification!.email.status).toBe('pending');
  });
});
