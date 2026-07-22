/**
 * Fase 2 da migração Postgres/Prisma — camada de conexão.
 *
 * Mongoose e Prisma COEXISTEM: `connectDB()` mantém o Mongoose (que ainda sustenta
 * os 33 controllers) e passa a abrir também a conexão do Prisma. O corte do Mongoose
 * é a Fase 6.
 *
 * Regra sutil coberta aqui: em NODE_ENV=test o Prisma NÃO é conectado no boot — a
 * suíte existente roda contra MongoMemoryServer e não pode passar a exigir um
 * PostgreSQL de pé. Quem usa Prisma em teste (prismaSmoke) conecta sob demanda.
 */

jest.mock('mongoose', () => ({
  __esModule: true,
  default: {
    connection: { readyState: 0 },
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('mongodb-memory-server', () => ({
  MongoMemoryServer: {
    create: jest.fn().mockResolvedValue({
      getUri: () => 'mongodb://in-memory-mock/test',
      stop: jest.fn().mockResolvedValue(true),
    }),
  },
}));

jest.mock('../lib/prisma', () => ({
  prisma: {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
  },
}));

import mongoose from 'mongoose';
import { prisma } from '../lib/prisma';
import { connectDB, disconnectDB, prisma as prismaFromDb } from '../db';

const ORIGINAL_ENV = process.env.NODE_ENV;
const ORIGINAL_MONGO_URI = process.env.MONGO_URI;

beforeEach(() => {
  jest.clearAllMocks();
  (mongoose as any).connection.readyState = 0;
});

afterAll(() => {
  process.env.NODE_ENV = ORIGINAL_ENV;
  process.env.MONGO_URI = ORIGINAL_MONGO_URI;
});

describe('camada de conexão (Mongoose + Prisma coexistindo)', () => {
  it('reexporta o mesmo singleton do Prisma', () => {
    expect(prismaFromDb).toBe(prisma);
  });

  it('em NODE_ENV=test, conecta o Mongoose mas NÃO o Prisma', async () => {
    process.env.NODE_ENV = 'test';

    await connectDB();

    expect(mongoose.connect).toHaveBeenCalledTimes(1);
    expect(prisma.$connect).not.toHaveBeenCalled();
  });

  it('fora de teste, conecta o Prisma junto com o Mongoose', async () => {
    process.env.NODE_ENV = 'development';
    process.env.MONGO_URI = 'mongodb://localhost:27017/drop_marketplace';

    await connectDB();

    expect(mongoose.connect).toHaveBeenCalledWith('mongodb://localhost:27017/drop_marketplace');
    expect(prisma.$connect).toHaveBeenCalledTimes(1);
  });

  it('disconnectDB fecha as duas conexões', async () => {
    await disconnectDB();

    expect(mongoose.disconnect).toHaveBeenCalledTimes(1);
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
  });
});
