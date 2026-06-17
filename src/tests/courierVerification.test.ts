/**
 * Testes da Fase 3 (KYC do motoboy).
 * - Unit: validador de placa/CNH e isMotoboyVerified.
 * - Integração: gate de claim de entrega; aprovação pelo admin.
 */
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../app';
import User from '../models/User';
import { isValidPlate, isValidCNH } from '../utils/documentValidation';
import { isMotoboyVerified, missingMotoboyVerifications } from '../utils/courierVerification';

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_with_minimum_32_characters_length_ok';

const fase1OK = {
  email: { status: 'verified' },
  phone: { status: 'verified', e164: '+5511988887777' },
  document: { type: 'rg', status: 'approved' },
};

// ===================== UNIT =====================
describe('Unit: validador de placa e CNH', () => {
  it('placa antiga e Mercosul válidas', () => {
    expect(isValidPlate('ABC1234')).toBe(true);
    expect(isValidPlate('ABC-1234')).toBe(true);
    expect(isValidPlate('ABC1D23')).toBe(true);
  });
  it('placa inválida', () => {
    expect(isValidPlate('AB12345')).toBe(false);
    expect(isValidPlate('')).toBe(false);
  });
  it('CNH = 11 dígitos', () => {
    expect(isValidCNH('12345678901')).toBe(true);
    expect(isValidCNH('123')).toBe(false);
  });
});

describe('Unit: isMotoboyVerified', () => {
  const full = { verification: { ...fase1OK, facial: { status: 'approved' }, courier: { status: 'approved' } } };
  it('true com tudo aprovado', () => {
    expect(isMotoboyVerified(full)).toBe(true);
  });
  it('false sem courier', () => {
    const u = { verification: { ...fase1OK, facial: { status: 'approved' }, courier: { status: 'pending' } } };
    expect(missingMotoboyVerifications(u)).toContain('courier');
    expect(isMotoboyVerified(u)).toBe(false);
  });
  it('false sem facial', () => {
    const u = { verification: { ...fase1OK, facial: { status: 'none' }, courier: { status: 'approved' } } };
    expect(missingMotoboyVerifications(u)).toContain('facial');
  });
});

// ===================== INTEGRAÇÃO =====================
let mongod: MongoMemoryReplSet;

async function mkUser(role = 'motoboy', verification?: any): Promise<{ token: string; userId: string }> {
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
}, 60000);
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
afterEach(async () => {
  const c = mongoose.connection.collections;
  for (const k in c) await c[k].deleteMany({});
});

describe('Gate de entrega (KYC Fase 3)', () => {
  it('claim bloqueado (403) para motoboy não verificado', async () => {
    const motoboy = await mkUser('motoboy'); // sem verificação
    const fakeDeliveryId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .post(`/api/deliveries/${fakeDeliveryId}/claim`)
      .set('Authorization', `Bearer ${motoboy.token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('COURIER_NOT_VERIFIED');
    expect(res.body.missing).toEqual(expect.arrayContaining(['document', 'facial', 'courier']));
  });

  it('listAvailable retorna vazio para motoboy não verificado', async () => {
    const motoboy = await mkUser('motoboy');
    const res = await request(app)
      .get('/api/deliveries/available')
      .set('Authorization', `Bearer ${motoboy.token}`);
    expect(res.status).toBe(200);
    expect(res.body.deliveries).toEqual([]);
    expect(res.body.requiresVerification).toBe(true);
  });
});

describe('Aprovação do motoboy pelo admin', () => {
  it('aprovar courier (com Fase1+facial) deixa o motoboy verificado', async () => {
    const ceo = await mkUser('ceo');
    const motoboy = await mkUser('motoboy', {
      ...fase1OK,
      facial: { status: 'approved' },
      courier: { status: 'pending', cnhNumber: '12345678901', plate: 'ABC1D23', platePhotoUrl: 'x' },
    });

    const r = await request(app)
      .post(`/api/verification/admin/motoboy/${motoboy.userId}/approve`)
      .set('Authorization', `Bearer ${ceo.token}`);
    expect(r.status).toBe(200);

    const u = await User.findById(motoboy.userId);
    expect(u!.verification!.courier!.status).toBe('approved');
    expect(isMotoboyVerified(u)).toBe(true);
  });

  it('motoboy comum não pode aprovar outro', async () => {
    const intruso = await mkUser('motoboy');
    const alvo = await mkUser('motoboy', { courier: { status: 'pending' } });
    const r = await request(app)
      .post(`/api/verification/admin/motoboy/${alvo.userId}/approve`)
      .set('Authorization', `Bearer ${intruso.token}`);
    expect(r.status).toBe(403);
  });
});
