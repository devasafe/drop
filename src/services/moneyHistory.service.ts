/**
 * D3b-3 · aba Histórico (spec 8): leitura do registro único AdminMoneyAction.
 * Datas `from`/`to` são dias de São Paulo, inclusivos. Cursor (createdAt, id) com a mesma
 * ordenação do banco (createdAt desc, id desc).
 */
import { AdminMoneyActionType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ValidationError } from '../utils/AppError';
import { saoPauloToday } from './asaasLoja/charge';
import { decodeMoneyCursor, encodeMoneyCursor, MONEY_PAGE_SIZE, saoPauloDayStartOf } from './moneyOverview.service';

/** Dia de São Paulo: AAAA-MM-DD. */
export const SP_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface AdminMoneyActionFilters {
  actorId?: string;
  type?: AdminMoneyActionType;
  from?: string; // YYYY-MM-DD (São Paulo)
  to?: string; // YYYY-MM-DD (São Paulo), inclusivo
  cursor?: string;
}

export interface AdminMoneyActionItem {
  id: string;
  at: string;
  actorId: string;
  actorName: string | null;
  actorRole: string;
  type: AdminMoneyActionType;
  targetType: string;
  targetId: string;
  amount: number | null;
  reason: string | null;
  before: Prisma.JsonValue | null;
  after: Prisma.JsonValue | null;
}

export interface AdminMoneyActionPage {
  items: AdminMoneyActionItem[];
  nextCursor: string | null;
}

/** 'YYYY-MM-DD' válido → 00:00 em SP; data inexistente (ex.: 31/02) → 400. */
export function saoPauloDateStart(value: string, field: 'from' | 'to'): Date {
  const start = SP_DATE_RE.test(value) ? saoPauloDayStartOf(value) : new Date(Number.NaN);
  const year = Number(value.slice(0, 4));
  if (Number.isNaN(start.getTime()) || saoPauloToday(start) !== value || year < MIN_YEAR || year > MAX_YEAR) {
    throw new ValidationError(`Data inválida em "${field}" (use AAAA-MM-DD)`);
  }
  return start;
}

export async function listAdminMoneyActions(filters: AdminMoneyActionFilters): Promise<AdminMoneyActionPage> {
  const and: Prisma.AdminMoneyActionWhereInput[] = [];
  if (filters.actorId) and.push({ actorId: filters.actorId });
  if (filters.type) and.push({ type: filters.type });

  const from = filters.from ? saoPauloDateStart(filters.from, 'from') : null;
  const toEnd = filters.to ? new Date(saoPauloDateStart(filters.to, 'to').getTime() + DAY_MS) : null;
  if (from && toEnd && from.getTime() >= toEnd.getTime()) {
    throw new ValidationError('A data inicial é depois da final');
  }
  if (from) and.push({ createdAt: { gte: from } });
  if (toEnd) and.push({ createdAt: { lt: toEnd } });

  if (filters.cursor) {
    const c = decodeMoneyCursor(filters.cursor);
    and.push({ OR: [{ createdAt: { lt: c.at } }, { createdAt: c.at, id: { lt: c.id } }] });
  }

  const rows = await prisma.adminMoneyAction.findMany({
    where: { AND: and },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: MONEY_PAGE_SIZE + 1,
  });
  const page = rows.slice(0, MONEY_PAGE_SIZE);

  const actorIds = [...new Set(page.map((r) => r.actorId))];
  const users = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
    : [];
  const names = new Map(users.map((u) => [u.id, u.name]));

  const last = page[page.length - 1];
  return {
    items: page.map((r) => ({
      id: r.id,
      at: r.createdAt.toISOString(),
      actorId: r.actorId,
      actorName: names.get(r.actorId) ?? null,
      actorRole: r.actorRole,
      type: r.type,
      targetType: r.targetType,
      targetId: r.targetId,
      amount: r.amount == null ? null : Number(r.amount),
      reason: r.reason ?? null,
      before: r.before ?? null,
      after: r.after ?? null,
    })),
    nextCursor: rows.length > MONEY_PAGE_SIZE ? encodeMoneyCursor(last.createdAt, last.id) : null,
  };
}
