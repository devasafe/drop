import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../models/User';
import { encryptSensitiveData } from '../utils/encryption';

let mongod: MongoMemoryServer;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
afterEach(async () => {
  for (const key in mongoose.connection.collections) await mongoose.connection.collections[key].deleteMany({});
});

async function makeUserWithSubaccount() {
  return User.create({
    name: 'Moto', email: 'm@x.com', passwordHash: 'x', role: 'motoboy',
    asaas: { status: 'active', accountId: 'acc_1', walletId: 'w1', apiKeyEncrypted: encryptSensitiveData('$key') },
  } as any);
}

describe('apiKeyEncrypted da subconta em markModified("asaas")+save', () => {
  it('BUG: carregar SEM a apiKey e salvar APAGA a chave', async () => {
    const u = await makeUserWithSubaccount();
    const reloaded = await User.findById(u._id); // sem select('+asaas.apiKeyEncrypted')
    reloaded!.asaas!.pixKey = '99991111140';
    reloaded!.markModified('asaas');
    await reloaded!.save();

    const after = await User.findById(u._id).select('+asaas.apiKeyEncrypted');
    expect(after?.asaas?.apiKeyEncrypted).toBeFalsy(); // chave foi perdida
  });

  it('FIX: carregar COM a apiKey preserva a chave ao trocar o pix', async () => {
    const u = await makeUserWithSubaccount();
    const reloaded = await User.findById(u._id).select('+asaas.apiKeyEncrypted'); // fix
    reloaded!.asaas!.pixKey = '99991111140';
    reloaded!.markModified('asaas');
    await reloaded!.save();

    const after = await User.findById(u._id).select('+asaas.apiKeyEncrypted');
    expect(after?.asaas?.apiKeyEncrypted).toBeTruthy();
    expect(after?.asaas?.pixKey).toBe('99991111140');
  });
});
