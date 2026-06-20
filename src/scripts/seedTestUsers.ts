import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User';
import Store from '../models/Store';

/**
 * Seeds de teste:
 *  - admin@drop.test    → admin (CEO) com TUDO aprovado
 *  - motoboy@drop.test  → motoboy só com e-mail aprovado
 *  - lojista@drop.test  → lojista só com e-mail aprovado (+ loja básica não verificada)
 *
 * Idempotente: roda quantas vezes quiser (upsert por e-mail).
 * Uso: npx ts-node src/scripts/seedTestUsers.ts
 */

const PASS = 'Senha@123456';

async function upsertUser(email: string, fields: any) {
  const passwordHash = await bcrypt.hash(PASS, 10);
  const existing = await User.findOne({ email });
  if (existing) {
    Object.assign(existing, fields);
    existing.passwordHash = passwordHash;
    existing.markModified('verification');
    await existing.save();
    return existing;
  }
  return User.create({ email, passwordHash, ...fields });
}

async function run() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/drop';
  await mongoose.connect(uri);
  console.log('✅ Conectado ao Mongo');

  // 1) Admin (CEO) com tudo aprovado
  await upsertUser('admin@drop.test', {
    name: 'Admin Teste',
    role: 'ceo',
    roles: ['ceo', 'cliente'],
    activeRole: 'ceo',
    status: 'active',
    cpf: '39053344705',
    dataNascimento: '1990-01-01',
    telefone: '21999990001',
    verification: {
      email: { status: 'verified', verifiedAt: new Date() },
      phone: { status: 'verified', e164: '+5521999990001', verifiedAt: new Date() },
      document: { status: 'approved', type: 'cpf', number: '39053344705', reviewedAt: new Date() },
      facial: { status: 'approved', reviewedAt: new Date() },
    },
  });

  // 2) Motoboy só com e-mail aprovado
  await upsertUser('motoboy@drop.test', {
    name: 'Motoboy Teste',
    role: 'motoboy',
    roles: ['motoboy', 'cliente'],
    activeRole: 'motoboy',
    status: 'active',
    verification: {
      email: { status: 'verified', verifiedAt: new Date() },
      phone: { status: 'pending' },
      document: { status: 'none' },
    },
  });

  // 3) Lojista só com e-mail aprovado (+ loja básica não verificada)
  const lojista = await upsertUser('lojista@drop.test', {
    name: 'Lojista Teste',
    role: 'lojista',
    roles: ['lojista', 'cliente'],
    activeRole: 'lojista',
    status: 'active',
    verification: {
      email: { status: 'verified', verifiedAt: new Date() },
      phone: { status: 'pending' },
      document: { status: 'none' },
    },
  });

  let store = await Store.findOne({ ownerId: lojista._id });
  if (!store) {
    store = await Store.create({ ownerId: lojista._id, name: 'Loja Teste', isOpen: true });
  }
  await User.findByIdAndUpdate(lojista._id, { storeId: store._id });

  console.log('\n═══════════════════════════════════════════');
  console.log('✅ Seeds criados (senha de todos:', PASS, ')');
  console.log('   admin@drop.test    → CEO, tudo aprovado');
  console.log('   motoboy@drop.test  → motoboy, só e-mail aprovado');
  console.log('   lojista@drop.test  → lojista, só e-mail aprovado (loja: ' + store._id + ')');
  console.log('═══════════════════════════════════════════\n');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => { console.error('❌ Seed falhou:', err); process.exit(1); });
