import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

jest.mock('../services/asaas/client', () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn(), postAs: jest.fn(), getAs: jest.fn() },
}));

import asaasClient from '../services/asaas/client';
import { ensureMotoboySubaccount } from '../services/asaas/subaccount';
import User from '../models/User';
import { decryptSensitiveData } from '../utils/encryption';

const post = (asaasClient as any).post as jest.Mock;
const get = (asaasClient as any).get as jest.Mock;
let mongod: MongoMemoryServer;

beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
afterEach(async () => {
  for (const key in mongoose.connection.collections) await mongoose.connection.collections[key].deleteMany({});
  post.mockReset(); get.mockReset();
});

describe('recuperação de subconta Asaas (apiKey perdida)', () => {
  it('subconta com accountId mas SEM apiKey → recupera a apiKey listando no Asaas', async () => {
    // Asaas lista a subconta existente já com a apiKey
    get.mockResolvedValue({ data: [{ id: 'acc_1', walletId: 'wlt_1', apiKey: '$recovered', cpfCnpj: '68193836812' }] });

    const u = await User.create({
      name: 'Fernando', email: 'f@x.com', passwordHash: 'x', role: 'motoboy',
      cpf: '681.938.368-12',
      asaas: { status: 'active', accountId: 'acc_1' }, // tem accountId mas SEM apiKeyEncrypted
    } as any);

    await ensureMotoboySubaccount(String(u._id));

    const fresh = await User.findById(u._id).select('+asaas.apiKeyEncrypted');
    expect(fresh?.asaas?.apiKeyEncrypted).toBeTruthy();
    expect(decryptSensitiveData(fresh!.asaas!.apiKeyEncrypted!)).toBe('$recovered');
    expect(fresh?.asaas?.walletId).toBe('wlt_1');
    expect(fresh?.asaas?.status).toBe('active');
    expect(post).not.toHaveBeenCalled(); // não tentou recriar
  });

  it('criação que falha com "já existe" → recupera credenciais da subconta existente', async () => {
    post.mockRejectedValue(new Error('Já existe uma conta com este CPF/CNPJ'));
    get.mockResolvedValue({ data: [{ id: 'acc_2', walletId: 'wlt_2', apiKey: '$rec2', cpfCnpj: '68193836812' }] });

    const u = await User.create({
      name: 'Fernando', email: 'f2@x.com', passwordHash: 'x', role: 'motoboy',
      cpf: '681.938.368-12', dataNascimento: '1990-01-01',
      addresses: [{ street: 'Rua A', number: '1', neighborhood: 'Centro', city: 'Cabo Frio', state: 'RJ', cep: '28900000', latitude: '0', longitude: '0', isDefault: true }],
    } as any);

    await ensureMotoboySubaccount(String(u._id));

    const fresh = await User.findById(u._id).select('+asaas.apiKeyEncrypted');
    expect(fresh?.asaas?.accountId).toBe('acc_2');
    expect(fresh?.asaas?.apiKeyEncrypted).toBeTruthy();
    expect(fresh?.asaas?.status).toBe('active');
  });
});
