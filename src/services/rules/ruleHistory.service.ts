/**
 * D3b-4a (spec 5.5): leitura do histórico de regras. Mesmo molde de listAdminMoneyActions:
 * dias de São Paulo inclusivos, cursor (createdAt, id), 50 por página, nome do ator resolvido aqui.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ValidationError } from '../../utils/AppError';
import { decodeMoneyCursor, encodeMoneyCursor, MONEY_PAGE_SIZE } from '../moneyOverview.service';
import { saoPauloDateStart } from '../moneyHistory.service';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RuleChangeFilters { field?: string; actorId?: string; from?: string; to?: string; cursor?: string }
export interface RuleChangeItem {
  id: string; batchId: string; source: 'rules' | 'switches'; field: string;
  before: Prisma.JsonValue | null; after: Prisma.JsonValue | null;
  actorId: string; actorName: string | null; actorRole: string; reason: string | null; at: string;
}

export async function listRuleChanges(f: RuleChangeFilters): Promise<{ items: RuleChangeItem[]; nextCursor: string | null }> {
  const and: Prisma.PlatformRuleChangeWhereInput[] = [];
  if (f.field) and.push({ field: f.field });
  if (f.actorId) and.push({ actorId: f.actorId });
  const from = f.from ? saoPauloDateStart(f.from, 'from') : null;
  const toEnd = f.to ? new Date(saoPauloDateStart(f.to, 'to').getTime() + DAY_MS) : null;
  if (from && toEnd && from.getTime() >= toEnd.getTime()) throw new ValidationError('A data inicial é depois da final');
  if (from) and.push({ createdAt: { gte: from } });
  if (toEnd) and.push({ createdAt: { lt: toEnd } });
  if (f.cursor) {
    const c = decodeMoneyCursor(f.cursor);
    and.push({ OR: [{ createdAt: { lt: c.at } }, { createdAt: c.at, id: { lt: c.id } }] });
  }
  const rows = await prisma.platformRuleChange.findMany({
    where: { AND: and }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: MONEY_PAGE_SIZE + 1,
  });
  const page = rows.slice(0, MONEY_PAGE_SIZE);
  const ids = [...new Set(page.map((r) => r.actorId))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const names = new Map(users.map((u) => [u.id, u.name]));
  const last = page[page.length - 1];
  return {
    items: page.map((r) => ({
      id: r.id, batchId: r.batchId, source: r.source, field: r.field,
      before: r.before ?? null, after: r.after ?? null,
      actorId: r.actorId, actorName: names.get(r.actorId) ?? null, actorRole: r.actorRole,
      reason: r.reason ?? null, at: r.createdAt.toISOString(),
    })),
    nextCursor: rows.length > MONEY_PAGE_SIZE ? encodeMoneyCursor(last.createdAt, last.id) : null,
  };
}
