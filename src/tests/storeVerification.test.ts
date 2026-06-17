/**
 * Testes da Fase 2 (KYC da loja).
 * - Unit: validador de CNPJ e computeStoreVerified.
 * - Integração: aprovação (facial/cnpj/endereço) marca isVerified; gate de listagem.
 */
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../app';
import User from '../models/User';
import Store from '../models/Store';
import Product from '../models/Product';
import { isValidCNPJ } from '../utils/documentValidation';
import { computeStoreVerified } from '../utils/storeVerification';

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_with_minimum_32_characters_length_ok';

const fase1OK = {
  email: { status: 'verified' },
  phone: { status: 'verified', e164: '+5511988887777' },
  document: { type: 'cpf', status: 'approved' },
};

// ===================== UNIT =====================
describe('Unit: validação de CNPJ', () => {
  it('aceita CNPJ válido', () => {
    expect(isValidCNPJ('11.444.777/0001-61')).toBe(true);
  });
  it('rejeita CNPJ inválido', () => {
    expect(isValidCNPJ('11.444.777/0001-60')).toBe(false);
    expect(isValidCNPJ('11111111111111')).toBe(false);
    expect(isValidCNPJ('123')).toBe(false);
  });
});

describe('Unit: computeStoreVerified', () => {
  const ownerOK = { verification: { ...fase1OK, facial: { status: 'approved' } } };
  it('true quando dono (Fase1+facial), cnpj e endereço aprovados', () => {
    const store = { verification: { cnpj: { status: 'approved' }, address: { status: 'approved' } } };
    expect(computeStoreVerified(store, ownerOK)).toBe(true);
  });
  it('false se falta facial do dono', () => {
    const owner = { verification: { ...fase1OK, facial: { status: 'pending' } } };
    const store = { verification: { cnpj: { status: 'approved' }, address: { status: 'approved' } } };
    expect(computeStoreVerified(store, owner)).toBe(false);
  });
  it('false se falta endereço', () => {
    const store = { verification: { cnpj: { status: 'approved' }, address: { status: 'pending' } } };
    expect(computeStoreVerified(store, ownerOK)).toBe(false);
  });
});

// ===================== INTEGRAÇÃO =====================
let mongod: MongoMemoryReplSet;

async function mkUser(role = 'cliente', verification?: any): Promise<{ token: string; userId: string }> {
  const passwordHash = await bcrypt.hash('Senha123!', 10);
  const roles = role !== 'cliente' ? [role, 'cliente'] : ['cliente'];
  const user = await User.create({
    name: `User ${role}`, email: `u-${Date.now()}-${Math.random().toString(36).slice(2)}@t.com`,
    passwordHash, role, roles, activeRole: role, verification,
  });
  const token = jwt.sign({ id: user._id.toString(), role, activeRole: role, roles }, JWT_SECRET, { expiresIn: '7d' });
  return { token, userId: user._id.toString() };
}

beforeAll(async () => {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(mongod.getUri());
  const s = await mongoose.startSession();
  try { await s.withTransaction(async () => { await mongoose.connection.db.collection('_warmup').insertOne({ ok: 1 }, { session: s }); }); }
  finally { await s.endSession(); }
}, 60000);

afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
afterEach(async () => {
  const c = mongoose.connection.collections;
  for (const k in c) await c[k].deleteMany({});
});

describe('Gate de listagem de lojas (KYC Fase 2)', () => {
  it('listStores esconde loja não verificada e mostra a verificada', async () => {
    const dono = await mkUser('lojista', { ...fase1OK, facial: { status: 'approved' } });
    await Store.create({ ownerId: dono.userId, name: 'Verificada', isOpen: true, isVerified: true });
    await Store.create({ ownerId: dono.userId, name: 'NaoVerificada', isOpen: true, isVerified: false });

    const res = await request(app).get('/api/stores');
    expect(res.status).toBe(200);
    const names = res.body.map((s: any) => s.name);
    expect(names).toContain('Verificada');
    expect(names).not.toContain('NaoVerificada');
  });

  it('getStore retorna 404 para loja não verificada', async () => {
    const dono = await mkUser('lojista');
    const store = await Store.create({ ownerId: dono.userId, name: 'Oculta', isOpen: true, isVerified: false });
    const res = await request(app).get(`/api/stores/${store._id.toString()}`);
    expect(res.status).toBe(404);
  });

  it('listProducts não retorna produtos de loja não verificada', async () => {
    const dono = await mkUser('lojista');
    const verificada = await Store.create({ ownerId: dono.userId, name: 'V', isOpen: true, isVerified: true });
    const naoVerificada = await Store.create({ ownerId: dono.userId, name: 'NV', isOpen: true, isVerified: false });
    await Product.create({ storeId: verificada._id, name: 'ProdOk', price: 10, quantity: 5 });
    await Product.create({ storeId: naoVerificada._id, name: 'ProdOculto', price: 10, quantity: 5 });

    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    const names = res.body.products.map((p: any) => p.name);
    expect(names).toContain('ProdOk');
    expect(names).not.toContain('ProdOculto');
  });
});

describe('Aprovação da loja pelo admin marca isVerified', () => {
  it('aprovar CNPJ e endereço (dono já Fase1+facial) deixa a loja verificada', async () => {
    const ceo = await mkUser('ceo');
    const dono = await mkUser('lojista', { ...fase1OK, facial: { status: 'approved' } });
    const store = await Store.create({
      ownerId: dono.userId, name: 'Loja', isOpen: true, isVerified: false,
      verification: { cnpj: { status: 'pending', number: '11444777000161' }, address: { status: 'pending', comprovanteUrl: 'x' } },
    });

    const r1 = await request(app).post(`/api/verification/admin/store/${store._id}/cnpj/approve`).set('Authorization', `Bearer ${ceo.token}`);
    expect(r1.status).toBe(200);
    const r2 = await request(app).post(`/api/verification/admin/store/${store._id}/address/approve`).set('Authorization', `Bearer ${ceo.token}`);
    expect(r2.status).toBe(200);

    const updated = await Store.findById(store._id);
    expect(updated!.isVerified).toBe(true);
  });

  it('não verifica se faltar a facial do dono', async () => {
    const ceo = await mkUser('ceo');
    const dono = await mkUser('lojista', { ...fase1OK, facial: { status: 'pending' } });
    const store = await Store.create({
      ownerId: dono.userId, name: 'Loja2', isOpen: true, isVerified: false,
      verification: { cnpj: { status: 'pending', number: '11444777000161' }, address: { status: 'pending', comprovanteUrl: 'x' } },
    });
    await request(app).post(`/api/verification/admin/store/${store._id}/cnpj/approve`).set('Authorization', `Bearer ${ceo.token}`);
    await request(app).post(`/api/verification/admin/store/${store._id}/address/approve`).set('Authorization', `Bearer ${ceo.token}`);

    const updated = await Store.findById(store._id);
    expect(updated!.isVerified).toBe(false); // facial pendente
  });
});
