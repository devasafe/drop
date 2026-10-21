/**
 * D3b-2a · lista de pessoas do admin (spec 6). Busca no servidor, abas, "Com dívida" e o cursor de
 * utils/cursorPagination (createdAt desc, id desc). O CPF só serve para a busca: não sai na lista.
 *
 * Busca (decisão 5): texto com letra, ou com poucos dígitos, = nome ou e-mail contendo o texto, sem
 * diferenciar maiúsculas. Só dígitos e máscara, com 10 a 13 dígitos, = CPF ou telefone por igualdade,
 * tirando a máscara dos dois lados (o telefone é gravado como foi digitado), com ou sem o DDI 55.
 */
import { Prisma, Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { parseCursorPage, sliceCursorPage } from '../../utils/cursorPagination';
import { getSaasConfig } from '../../utils/settlement';
import { summarizeVerification } from './userVerification';
import { UserListItem, UserListResponse, UserListTab } from './types';

export const USER_LIST_TABS: readonly UserListTab[] = ['all', 'cliente', 'lojista', 'motoboy', 'equipe', 'bloqueados'];
export const USERS_PAGE_DEFAULT = 30;
export const USERS_PAGE_MAX = 100;
/** Papéis da equipe (os ADMIN_ROLES de routes/admin.ts). */
export const STAFF_ROLES: readonly Role[] = ['ceo', 'marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys'];
const NON_CLIENT_ROLES: Role[] = [...STAFF_ROLES, 'lojista', 'motoboy'];
const DAY_MS = 86_400_000;
const DOCUMENT_LIKE = /^[\d\s().+\-/]+$/;

export interface ListAdminUsersInput {
  q: string;
  tab: UserListTab;
  withDebt: boolean;
  cursor?: string;
  limit?: string;
}

/** Todos os papéis da conta: `roles` mais `role` e `activeRole` (conta antiga pode ter o papel só ali). */
export function accountRoles(u: { roles: Role[]; role: Role | null; activeRole: Role }): string[] {
  return Array.from(new Set([...u.roles, u.role, u.activeRole].filter((r): r is Role => !!r)));
}

/**
 * Tem um dos papéis em `roles`, `role` ou `activeRole`. `role` é nulo em conta nova: sem o IS NOT NULL,
 * o NOT da aba "cliente" daria NULL no Postgres e a conta sumiria da aba.
 */
function hasAnyRole(list: Role[]): Prisma.UserWhereInput {
  return {
    OR: [
      { roles: { hasSome: list } },
      { AND: [{ role: { not: null } }, { role: { in: list } }] },
      { activeRole: { in: list } },
    ],
  };
}

function tabWhere(tab: UserListTab): Prisma.UserWhereInput {
  switch (tab) {
    case 'cliente':
      return { NOT: hasAnyRole(NON_CLIENT_ROLES) };
    case 'lojista':
      return hasAnyRole(['lojista']);
    case 'motoboy':
      return hasAnyRole(['motoboy']);
    case 'equipe':
      return hasAnyRole([...STAFF_ROLES]);
    case 'bloqueados':
      return { status: 'blocked' };
    default:
      return {};
  }
}

/** Dígitos de um CPF ou telefone digitado com ou sem máscara; null quando o texto é nome ou e-mail. */
export function documentDigits(text: string): string | null {
  if (!DOCUMENT_LIKE.test(text)) return null;
  const digits = text.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 13 ? digits : null;
}

/** O telefone pode ter sido gravado com ou sem o DDI 55. */
function phoneVariants(digits: string): string[] {
  const out = new Set([digits, `55${digits}`]);
  if (digits.startsWith('55') && digits.length >= 12) out.add(digits.slice(2));
  return Array.from(out);
}

async function searchWhere(q: string): Promise<Prisma.UserWhereInput> {
  const text = q.trim().slice(0, 100);
  if (!text) return {};
  const digits = documentDigits(text);
  if (!digits) {
    return { OR: [{ name: { contains: text, mode: 'insensitive' } }, { email: { contains: text, mode: 'insensitive' } }] };
  }
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "User"
     WHERE regexp_replace(COALESCE(cpf, ''), '[^0-9]', '', 'g') = ${digits}
        OR regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g') IN (${Prisma.join(phoneVariants(digits))})`;
  return { id: { in: rows.map((r) => r.id) } };
}

async function pendingDebtorIds(): Promise<string[]> {
  const rows = await prisma.customerDebt.findMany({
    where: { status: 'pending' },
    distinct: ['customerId'],
    select: { customerId: true },
  });
  return rows.map((r) => r.customerId);
}

const USER_ROW_SELECT = Prisma.validator<Prisma.UserSelect>()({
  id: true,
  name: true,
  email: true,
  role: true,
  roles: true,
  activeRole: true,
  status: true,
  blockReason: true,
  verification: true,
  lastSeenAt: true,
  createdAt: true,
});

const money = (v: unknown): number => Math.round(Number(v ?? 0) * 100) / 100;

export async function listAdminUsers(input: ListAdminUsersInput, now: Date = new Date()): Promise<UserListResponse> {
  const page = parseCursorPage(
    { limit: input.limit, cursor: input.cursor },
    { defaultLimit: USERS_PAGE_DEFAULT, maxLimit: USERS_PAGE_MAX },
  );
  const and: Prisma.UserWhereInput[] = [tabWhere(input.tab), await searchWhere(input.q)];
  if (input.withDebt) and.push({ id: { in: await pendingDebtorIds() } });
  if (Object.keys(page.where).length > 0) and.push(page.where as Prisma.UserWhereInput);

  const rows = await prisma.user.findMany({
    where: { AND: and },
    orderBy: page.orderBy,
    take: page.take,
    select: USER_ROW_SELECT,
  });
  const { items, nextCursor } = sliceCursorPage(rows, page);
  if (items.length === 0) return { items: [], nextCursor: null };

  const ids = items.map((u) => u.id);
  const [orders, debts, cfg] = await Promise.all([
    prisma.order.groupBy({
      by: ['customerId'],
      where: { customerId: { in: ids }, createdAt: { gte: new Date(now.getTime() - 90 * DAY_MS) } },
      _count: { _all: true },
    }),
    prisma.customerDebt.groupBy({
      by: ['customerId'],
      where: { customerId: { in: ids }, status: 'pending' },
      _sum: { amount: true },
    }),
    getSaasConfig(),
  ]);
  const ordersBy = new Map(orders.map((o) => [o.customerId, o._count._all]));
  const debtBy = new Map(debts.map((d) => [d.customerId, d._sum.amount]));

  return {
    items: items.map((u): UserListItem => {
      const roles = accountRoles(u);
      const debt = debtBy.get(u.id);
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        roles,
        status: u.status,
        blockReason: u.blockReason ?? null,
        verification: summarizeVerification(u.verification, roles, cfg.settlementMode),
        lastSeenAt: u.lastSeenAt ? u.lastSeenAt.toISOString() : null,
        orders90d: ordersBy.get(u.id) ?? 0,
        pendingDebt: debt == null ? null : money(debt),
        createdAt: u.createdAt.toISOString(),
      };
    }),
    nextCursor,
  };
}
