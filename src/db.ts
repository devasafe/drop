import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer | null = null;

export async function connectDB(): Promise<typeof mongoose> {
  // ✅ TESTES: sempre usar um MongoMemoryServer dedicado, ignorando MONGO_URI.
  // Evita dependência de um Mongo externo e o "vazamento" de URI entre arquivos.
  if (process.env.NODE_ENV === 'test') {
    if (mongoose.connection.readyState === 1) return mongoose; // já conectado
    mongod = await MongoMemoryServer.create();
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

  // Start in-memory MongoDB for local development/testing
  mongod = await MongoMemoryServer.create();
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
