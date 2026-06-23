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
  it('subconta com accountId mas SEM apiKey → gera nova chave via accessTokens', async () => {
    // POST /accounts/{id}/accessTokens retorna a chave nova; o GET resolve o walletId.
    post.mockImplementation((path: string) =>
      path.includes('/accessTokens')
        ? Promise.resolve({ id: 'tok_1', apiKey: '$nova_chave' })
        : Promise.resolve({}),
    );
    get.mockResolvedValue({ data: [{ id: 'acc_1', walletId: 'wlt_1', cpfCnpj: '68193836812' }] });

    const u = await User.create({
      name: 'Fernando', email: 'f@x.com', passwordHash: 'x', role: 'motoboy',
      cpf: '681.938.368-12',
      asaas: { status: 'active', accountId: 'acc_1' }, // accountId sem apiKeyEncrypted
    } as any);

    await ensureMotoboySubaccount(String(u._id));

    const fresh = await User.findById(u._id).select('+asaas.apiKeyEncrypted');
    expect(decryptSensitiveData(fresh!.asaas!.apiKeyEncrypted!)).toBe('$nova_chave');
    expect(fresh?.asaas?.walletId).toBe('wlt_1');
    expect(fresh?.asaas?.status).toBe('active');
    // gerou a chave pelo endpoint certo
    expect(post).toHaveBeenCalledWith('/accounts/acc_1/accessTokens', expect.any(Object));
  });

  it('quando o gerenciamento de chaves está OFF (POST falha) → status error com instrução', async () => {
    post.mockImplementation((path: string) =>
      path.includes('/accessTokens')
        ? Promise.reject(new Error('forbidden'))
        : Promise.resolve({}),
    );
    get.mockResolvedValue({ data: [{ id: 'acc_1', walletId: 'wlt_1', cpfCnpj: '68193836812' }] });

    const u = await User.create({
      name: 'Fernando', email: 'f3@x.com', passwordHash: 'x', role: 'motoboy',
      cpf: '681.938.368-12',
      asaas: { status: 'active', accountId: 'acc_1' },
    } as any);

    await ensureMotoboySubaccount(String(u._id));

    const fresh = await User.findById(u._id).select('+asaas.apiKeyEncrypted');
    expect(fresh?.asaas?.apiKeyEncrypted).toBeFalsy();
    expect(fresh?.asaas?.status).toBe('error');
    expect(fresh?.asaas?.lastError).toMatch(/whitelist|chaves de API/i);
  });

  it('criação falha com "já existe" → recupera accountId e gera a chave', async () => {
    post.mockImplementation((path: string) =>
      path.includes('/accessTokens')
        ? Promise.resolve({ id: 'tok_2', apiKey: '$rec2' })
        : Promise.reject(new Error('Já existe uma conta com este CPF/CNPJ')), // createSubaccount
    );
    get.mockResolvedValue({ data: [{ id: 'acc_2', walletId: 'wlt_2', cpfCnpj: '68193836812' }] }); // list sem apiKey

    const u = await User.create({
      name: 'Fernando', email: 'f2@x.com', passwordHash: 'x', role: 'motoboy',
      cpf: '681.938.368-12', dataNascimento: '1990-01-01',
      addresses: [{ street: 'Rua A', number: '1', neighborhood: 'Centro', city: 'Cabo Frio', state: 'RJ', cep: '28900000', latitude: '0', longitude: '0', isDefault: true }],
    } as any);

    await ensureMotoboySubaccount(String(u._id));

    const fresh = await User.findById(u._id).select('+asaas.apiKeyEncrypted');
    expect(fresh?.asaas?.accountId).toBe('acc_2');
    expect(decryptSensitiveData(fresh!.asaas!.apiKeyEncrypted!)).toBe('$rec2');
    expect(fresh?.asaas?.status).toBe('active');
  });
});
