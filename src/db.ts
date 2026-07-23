import { prisma } from './lib/prisma';

// Migração concluída: o backend usa exclusivamente PostgreSQL via Prisma.
// (O Mongoose foi removido na Fase 6 — nenhum dado de domínio vive mais no Mongo.)
export { prisma };

/**
 * Abre a conexão do Prisma (PostgreSQL).
 *
 * ⚠️ Pulada em NODE_ENV=test de propósito: as suítes conectam sob demanda (o Client
 * conecta lazy na primeira query) contra o Postgres de teste.
 *
 * Fora de teste é chamado no boot para falhar cedo, com mensagem clara, em vez de
 * estourar só na primeira query já com o servidor no ar.
 */
export async function connectDB(): Promise<void> {
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

export async function disconnectDB(): Promise<void> {
  await prisma.$disconnect();
}
