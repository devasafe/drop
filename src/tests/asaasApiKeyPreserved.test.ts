import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { encryptSensitiveData } from '../utils/encryption';

let mongod: MongoMemoryServer;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
afterEach(async () => {
  await cleanupUsersByEmailDomain('@akp.test');
  for (const key in mongoose.connection.collections) await mongoose.connection.collections[key].deleteMany({});
});

async function makeUserWithSubaccount() {
  return prisma.user.create({ data: {
    name: 'Moto', email: 'm@x.com', passwordHash: 'x', role: 'motoboy',
    asaas: { status: 'active', accountId: 'acc_1', walletId: 'w1', apiKeyEncrypted: encryptSensitiveData('$key') },
  } } as any);
}

describe('apiKeyEncrypted da subconta em markModified("asaas")+save', () => {
  it('BUG: carregar SEM a apiKey e salvar APAGA a chave', async () => {
    const u = await makeUserWithSubaccount();
    const reloaded = await prisma.user.findUnique({ where: { id: u.id } }) as any; // sem select('+asaas.apiKeyEncrypted')
    reloaded!.asaas!.pixKey = '99991111140';
    reloaded!.markModified('asaas');
    await reloaded!.save();

    const after = await prisma.user.findUnique({ where: { id: u.id } }) as any;
    expect(after?.asaas?.apiKeyEncrypted).toBeFalsy(); // chave foi perdida
  });

  it('FIX: carregar COM a apiKey preserva a chave ao trocar o pix', async () => {
    const u = await makeUserWithSubaccount();
    const reloaded = await prisma.user.findUnique({ where: { id: u.id } }) as any; // fix
    reloaded!.asaas!.pixKey = '99991111140';
    reloaded!.markModified('asaas');
    await reloaded!.save();

    const after = await prisma.user.findUnique({ where: { id: u.id } }) as any;
    expect(after?.asaas?.apiKeyEncrypted).toBeTruthy();
    expect(after?.asaas?.pixKey).toBe('99991111140');
  });
});
