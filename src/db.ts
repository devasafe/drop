import mongoose from 'mongoose';
import { prisma } from './lib/prisma';

// 🔀 Migração Postgres/Prisma (Fase 2): Mongoose e Prisma COEXISTEM.
// O Mongoose ainda sustenta os controllers (reescritos fatia a fatia na Fase 4);
// o Prisma entra em paralelo. A remoção do Mongoose é a Fase 6.
export { prisma };

// O mongodb-memory-server é uma devDependency (só usado em teste/dev).
// Carregado via require dinâmico para NUNCA ser exigido em produção.
type InMemoryMongo = { getUri(): string; stop(): Promise<boolean> };

let mongod: InMemoryMongo | null = null;

async function createInMemoryMongo(): Promise<InMemoryMongo> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { MongoMemoryServer } = require('mongodb-memory-server');
  return MongoMemoryServer.create();
}

/**
 * Abre a conexão do Prisma (PostgreSQL).
 *
 * ⚠️ Pulada em NODE_ENV=test de propósito: a suíte roda contra MongoMemoryServer e
 * não pode passar a exigir um PostgreSQL de pé para rodar. Os testes que usam Prisma
 * conectam sob demanda (o Client conecta lazy na primeira query).
 *
 * Fora de teste é chamado no boot para falhar cedo, com mensagem clara, em vez de
 * estourar só na primeira query já com o servidor no ar.
 */
async function connectPrisma(): Promise<void> {
  if (process.env.NODE_ENV === 'test') return;

  try {
    await prisma.$connect();
    // eslint-disable-next-line no-console
    console.log('✅ PostgreSQL (Prisma) conectado');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      '❌ Falha ao conectar no PostgreSQL via Prisma. Confira DATABASE_URL e se o container está de pé (docker compose up -d postgres).',
    );
    throw err;
  }
}

export async function connectDB(): Promise<typeof mongoose> {
  // ✅ TESTES: sempre usar um MongoMemoryServer dedicado, ignorando MONGO_URI.
  // Evita dependência de um Mongo externo e o "vazamento" de URI entre arquivos.
  if (process.env.NODE_ENV === 'test') {
    if (mongoose.connection.readyState === 1) return mongoose; // já conectado
    mongod = await createInMemoryMongo();
    return mongoose.connect(mongod.getUri());
  }

  await connectPrisma();

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (mongoUri) {
    // Log a masked version of the URI to help debugging (don't print password)
    try {
      const masked = mongoUri.replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)([^@]+)(@)/, (_, a) => `${a}****@`);
      // eslint-disable-next-line no-console
      console.log('Connecting to MongoDB (masked):', masked);
    } catch (e) {
      // ignore masking errors
    }
    return mongoose.connect(mongoUri);
  }

  // Dev local sem URI: sobe um MongoDB em memória
  mongod = await createInMemoryMongo();
  const uri = mongod.getUri();
  process.env.MONGO_URI = uri;
  // eslint-disable-next-line no-console
  console.log('Using in-memory MongoDB:', uri);
  return mongoose.connect(uri);
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
  await prisma.$disconnect();
}
