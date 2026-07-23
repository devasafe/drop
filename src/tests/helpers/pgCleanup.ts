import { prisma } from '../../lib/prisma';

/**
 * Remove do PostgreSQL os usuários criados por uma suíte de testes.
 *
 * Por que por domínio de e-mail: o Mongo dos testes é em memória e morre junto com
 * a suíte, mas o Postgres é o banco de dev e persiste entre execuções — sem limpeza,
 * os `@unique` (email, cpf, rg) colidem na segunda rodada.
 *
 * Cada suíte usa um domínio próprio (`@auth.test`, `@wal.test`, ...) porque o Jest
 * roda as suítes em paralelo: um filtro genérico faria uma suíte apagar os usuários
 * que outra ainda está usando.
 *
 * A base efêmera dedicada é a Fase 5 e torna isso desnecessário.
 */
export async function cleanupUsersByEmailDomain(domain: string): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: domain } },
    select: { id: true },
  });

  const ids = users.map((u) => u.id);
  if (ids.length === 0) return;

  // A ordem importa: as FKs para User/Store são Restrict (não cascade), então os
  // dependentes saem antes. Order referencia Store e User; Store referencia User.
  //   Order (→ OrderItem cascata) → Store (→ Product/Category cascata) → User
  const stores = await prisma.store.findMany({ where: { ownerId: { in: ids } }, select: { id: true } });
  const storeIds = stores.map((s) => s.id);

  await prisma.order.deleteMany({
    where: { OR: [{ customerId: { in: ids } }, { storeId: { in: storeIds } }] },
  });
  await prisma.store.deleteMany({ where: { ownerId: { in: ids } } });
  await prisma.passwordResetToken.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}
