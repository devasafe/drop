/**
 * Camada de conexão (pós-Fase 6): o backend usa exclusivamente PostgreSQL via Prisma.
 * O Mongoose foi removido — `connectDB()` só abre a conexão do Prisma.
 *
 * Regra sutil coberta aqui: em NODE_ENV=test o Prisma NÃO é conectado no boot — as
 * suítes conectam sob demanda (o Client conecta lazy na primeira query).
 */

jest.mock('../lib/prisma', () => ({
  prisma: {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
  },
}));

import { prisma } from '../lib/prisma';
import { connectDB, disconnectDB, prisma as prismaFromDb } from '../db';

const ORIGINAL_ENV = process.env.NODE_ENV;

beforeEach(() => {
  jest.clearAllMocks();
});

afterAll(() => {
  process.env.NODE_ENV = ORIGINAL_ENV;
});

describe('camada de conexão (Prisma-only)', () => {
  it('reexporta o mesmo singleton do Prisma', () => {
    expect(prismaFromDb).toBe(prisma);
  });

  it('em NODE_ENV=test, NÃO conecta o Prisma no boot', async () => {
    process.env.NODE_ENV = 'test';

    await connectDB();

    expect(prisma.$connect).not.toHaveBeenCalled();
  });

  it('fora de teste, conecta o Prisma', async () => {
    process.env.NODE_ENV = 'development';

    await connectDB();

    expect(prisma.$connect).toHaveBeenCalledTimes(1);
    process.env.NODE_ENV = 'test';
  });

  it('disconnectDB fecha a conexão do Prisma', async () => {
    await disconnectDB();

    expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
  });
});
