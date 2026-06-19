import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// Mock do client Asaas — não bate na rede.
jest.mock('../services/asaas/client', () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn(), isConfigured: () => true },
}));

import asaasClient from '../services/asaas/client';
import app from '../app';
import User from '../models/User';
import Store from '../models/Store';
import { ensureMotoboySubaccount, ensureStoreSubaccount } from '../services/asaas/subaccount';
import { decryptSensitiveData } from '../utils/encryption';

const post = (asaasClient as any).post as jest.Mock;
const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_with_minimum_32_characters_length_ok';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  for (const key in mongoose.connection.collections) {
    await mongoose.connection.collections[key].deleteMany({});
  }
  post.mockReset();
});

async function makeMotoboy(overrides: any = {}) {
  return User.create({
    name: 'Moto Boy',
    email: `moto-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`,
    passwordHash: await bcrypt.hash('Senha123!', 10),
    role: 'motoboy',
    roles: ['motoboy', 'cliente'],
    activeRole: 'motoboy',
    cpf: '39053344705',
    dataNascimento: '1990-05-10',
    telefone: '11987654321',
    addresses: [{ street: 'Rua A', number: '10', neighborhood: 'Centro', city: 'SP', state: 'SP', cep: '01001000', latitude: '0', longitude: '0', isDefault: true }],
    ...overrides,
  });
}

describe('ensureMotoboySubaccount (Fase 1)', () => {
  it('cria a subconta, persiste walletId e cifra a apiKey', async () => {
    post.mockResolvedValue({ id: 'acc_moto', walletId: 'wlt_moto', apiKey: '$aact_sub_moto' });
    const user = await makeMotoboy();

    await ensureMotoboySubaccount(String(user._id));

    const updated = await User.findById(user._id).select('+asaas.apiKeyEncrypted');
    expect(post).toHaveBeenCalledTimes(1);
    expect(updated!.asaas!.accountId).toBe('acc_moto');
    expect(updated!.asaas!.walletId).toBe('wlt_moto');
    expect(updated!.asaas!.status).toBe('active');
    // apiKey guardada cifrada e recuperável
    expect(updated!.asaas!.apiKeyEncrypted).toBeTruthy();
    expect(decryptSensitiveData(updated!.asaas!.apiKeyEncrypted!)).toBe('$aact_sub_moto');
  });

  it('é idempotente — não recria se já existe accountId', async () => {
    post.mockResolvedValue({ id: 'acc_moto', walletId: 'wlt_moto', apiKey: '$aact_sub_moto' });
    const user = await makeMotoboy();
    await ensureMotoboySubaccount(String(user._id));
    await ensureMotoboySubaccount(String(user._id));
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('marca status=error quando faltam dados (sem chamar o Asaas)', async () => {
    const user = await makeMotoboy({ dataNascimento: undefined });
    await ensureMotoboySubaccount(String(user._id));
    const updated = await User.findById(user._id);
    expect(post).not.toHaveBeenCalled();
    expect(updated!.asaas!.status).toBe('error');
    expect(updated!.asaas!.lastError).toMatch(/nascimento/i);
  });
});

describe('ensureStoreSubaccount (Fase 1)', () => {
  it('cria a subconta da loja pela CNPJ', async () => {
    post.mockResolvedValue({ id: 'acc_loja', walletId: 'wlt_loja', apiKey: '$aact_sub_loja' });
    const owner = await makeMotoboy({ role: 'lojista', roles: ['lojista', 'cliente'], activeRole: 'lojista' });
    const store = await Store.create({
      ownerId: owner._id,
      name: 'Loja X',
      cnpj: '11222333000181',
      street: 'Av B',
      number: '20',
      neighborhood: 'Centro',
      zip: '01002000',
    });

    await ensureStoreSubaccount(String(store._id));

    const updated = await Store.findById(store._id);
    expect(post).toHaveBeenCalledTimes(1);
    expect(updated!.asaas!.accountId).toBe('acc_loja');
    expect(updated!.asaas!.status).toBe('active');
    // payload enviado com CNPJ (14 dígitos) e companyType
    const payload = post.mock.calls[0][1];
    expect(payload.cpfCnpj).toBe('11222333000181');
    expect(payload.companyType).toBeTruthy();
  });
});

describe('POST /api/onboarding/pix-key (Fase 1)', () => {
  it('salva a chave PIX do motoboy e infere o tipo', async () => {
    const user = await makeMotoboy();
    const token = jwt.sign({ id: String(user._id), role: 'motoboy', activeRole: 'motoboy', roles: ['motoboy'] }, JWT_SECRET);

    const res = await request(app)
      .post('/api/onboarding/pix-key')
      .set('Authorization', `Bearer ${token}`)
      .send({ pixKey: 'moto@pix.com' });

    expect(res.status).toBe(200);
    expect(res.body.target).toBe('motoboy');
    expect(res.body.pixKeyType).toBe('EMAIL');

    const updated = await User.findById(user._id);
    expect(updated!.asaas!.pixKey).toBe('moto@pix.com');
  });
});
