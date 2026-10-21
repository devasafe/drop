/**
 * D3b-2a · P2 · dados das suítes de leitura de Pessoas e Lojas e a limpeza do que o
 * cleanupOpsFixtures não alcança: CustomerDebt e AdminAccountAction não têm FK para User/Store.
 */
import bcrypt from 'bcryptjs';
import { Prisma, Role, UserStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { cleanupOpsFixtures } from './d3b1Ops';

export const DAY_MS = 86_400_000;
export const daysBefore = (now: Date, days: number) => new Date(now.getTime() - days * DAY_MS);

/** Dígitos aleatórios: CPF, telefone e CNPJ das suítes não colidem com outros dados do banco. */
export const randomDigits = (n: number): string =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

export interface PersonInput {
  name: string;
  /** Precisa terminar no domínio da suíte (a limpeza é por domínio). */
  email?: string;
  roles?: Role[];
  role?: Role | null;
  activeRole?: Role;
  status?: UserStatus;
  blockReason?: string | null;
  blockedBy?: string | null;
  blockedAt?: Date | null;
  cpf?: string | null;
  telefone?: string | null;
  verification?: Prisma.InputJsonValue;
  asaas?: Prisma.InputJsonValue;
  createdAt?: Date;
  lastSeenAt?: Date | null;
}

let passwordHash: string | null = null;

/** Pessoa do domínio da suíte. Padrão: só cliente, `role` nulo (conta nova), ativa, sem verificação. */
export async function createPerson(domain: string, p: PersonInput): Promise<string> {
  if (!passwordHash) passwordHash = await bcrypt.hash('Senha123!', 4);
  const user = await prisma.user.create({
    data: {
      name: p.name,
      email: p.email ?? `pessoa-${Date.now()}-${Math.random().toString(36).slice(2)}${domain}`,
      passwordHash,
      roles: p.roles ?? ['cliente'],
      role: p.role ?? null,
      activeRole: p.activeRole ?? 'cliente',
      status: p.status ?? 'active',
      blockReason: p.blockReason ?? null,
      blockedBy: p.blockedBy ?? null,
      blockedAt: p.blockedAt ?? null,
      cpf: p.cpf ?? null,
      telefone: p.telefone ?? null,
      verification: p.verification ?? {},
      ...(p.asaas !== undefined ? { asaas: p.asaas } : {}),
      ...(p.createdAt ? { createdAt: p.createdAt } : {}),
      lastSeenAt: p.lastSeenAt ?? null,
    },
  });
  return user.id;
}

export async function createDebt(customerId: string, amount: number, status: 'pending' | 'collected' = 'pending'): Promise<string> {
  const debt = await prisma.customerDebt.create({
    data: {
      customerId,
      amount,
      status,
      sourceOrderId: `d3b2a-${Math.random().toString(36).slice(2)}`,
      reason: 'Taxa de cancelamento (teste)',
      ...(status === 'collected' ? { collectedAt: new Date() } : {}),
    },
  });
  return debt.id;
}

/**
 * `count` registros de histórico (tipo `block`, motivo "motivo i") para uma pessoa ou loja, um por
 * segundo, terminando 1 s antes de `base`. Devolve os ids do mais antigo para o mais novo.
 */
export async function addAccountActions(
  target: { userId?: string; storeId?: string },
  actorId: string,
  count: number,
  base: Date = new Date(),
): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const row = await prisma.adminAccountAction.create({
      data: {
        actorId,
        actorRole: 'ceo',
        ...target,
        type: 'block',
        reason: `motivo ${i}`,
        createdAt: new Date(base.getTime() - (count - i) * 1000),
      },
    });
    ids.push(row.id);
  }
  return ids;
}

/**
 * Dívidas e histórico da suíte e, por último, o cleanupOpsFixtures (pedidos, repasses, lojas, pessoas).
 * Desde a P1.1, o cleanupUsersByEmailDomain também apaga essas linhas; a repetição aqui é inofensiva e
 * deixa a suíte independente da ordem das limpezas.
 */
export async function cleanupAccountsFixtures(domain: string, mark: string): Promise<void> {
  const users = await prisma.user.findMany({ where: { email: { endsWith: domain } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const stores = await prisma.store.findMany({ where: { ownerId: { in: userIds } }, select: { id: true } });
  const storeIds = stores.map((s) => s.id);
  await prisma.customerDebt.deleteMany({ where: { customerId: { in: userIds } } });
  await prisma.adminAccountAction.deleteMany({
    where: { OR: [{ userId: { in: userIds } }, { storeId: { in: storeIds } }, { actorId: { in: userIds } }] },
  });
  await cleanupOpsFixtures(domain, mark);
}
