/**
 * Fecha o PrismaClient ao fim de cada arquivo de teste.
 * Cada arquivo tem o próprio registro de módulos (logo, o próprio PrismaClient), e a
 * maioria dos testes nunca chama $disconnect: as conexões ficavam abertas até o fim da
 * execução e, com ~85 suítes em série, estouravam o max_connections (100) do Postgres
 * ("too many clients already"). Aqui é o mesmo registro do teste, então é o mesmo client.
 */
afterAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  // Suítes que mockam '../lib/prisma' recebem um objeto sem $disconnect: nada a fechar.
  const { prisma } = require('./src/lib/prisma');
  if (typeof prisma?.$disconnect === 'function') await prisma.$disconnect();
});
