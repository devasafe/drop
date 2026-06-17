import mongoose from 'mongoose';

// O mongodb-memory-server é uma devDependency (só usado em teste/dev).
// Carregado via require dinâmico para NUNCA ser exigido em produção.
type InMemoryMongo = { getUri(): string; stop(): Promise<boolean> };

let mongod: InMemoryMongo | null = null;

async function createInMemoryMongo(): Promise<InMemoryMongo> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { MongoMemoryServer } = require('mongodb-memory-server');
  return MongoMemoryServer.create();
}

export async function connectDB(): Promise<typeof mongoose> {
  // ✅ TESTES: sempre usar um MongoMemoryServer dedicado, ignorando MONGO_URI.
  // Evita dependência de um Mongo externo e o "vazamento" de URI entre arquivos.
  if (process.env.NODE_ENV === 'test') {
    if (mongoose.connection.readyState === 1) return mongoose; // já conectado
    mongod = await createInMemoryMongo();
    return mongoose.connect(mongod.getUri());
  }

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
}
