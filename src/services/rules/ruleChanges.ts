/**
 * D3b-4a (spec 5.1): histórico de regras. diffRules compara o valor gravado com o novo, campo a
 * campo (número por valor: Decimal 1.20 == 1.2); recordRuleChanges grava um lote (mesmo batchId)
 * dentro da transação do salvamento — se falhar, o salvamento inteiro volta.
 */
import { randomUUID } from 'crypto';
import { PlatformRuleSource, Prisma } from '@prisma/client';
import type { AdminMoneyActor } from '../adminMoneyAction.service';

export type RuleValue = number | boolean | string | null;
export interface RuleChange { field: string; before: RuleValue; after: RuleValue }

export const RULE_REASON_MAX = 500;

function norm(v: unknown): RuleValue {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean' || typeof v === 'string') return v;
  const n = Number(v); // number ou Prisma.Decimal
  return Number.isFinite(n) ? n : String(v);
}

const same = (a: RuleValue, b: RuleValue) =>
  typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : a === b;

export function diffRules(current: Record<string, unknown>, patch: Record<string, unknown>): RuleChange[] {
  return Object.keys(patch)
    .map((field) => ({ field, before: norm(current[field]), after: norm(patch[field]) }))
    .filter((c) => !same(c.before, c.after));
}

const json = (v: RuleValue) => (v === null ? Prisma.JsonNull : v);

export async function recordRuleChanges(
  tx: Prisma.TransactionClient,
  input: {
    actor: AdminMoneyActor;
    source: PlatformRuleSource;
    reason?: string | null;
    changes: RuleChange[];
    meta?: Record<string, Prisma.InputJsonValue>;
  },
): Promise<{ batchId: string | null; count: number }> {
  if (input.changes.length === 0) return { batchId: null, count: 0 };
  const batchId = randomUUID();
  const reason = input.reason?.trim() ? input.reason.trim().slice(0, RULE_REASON_MAX) : null;
  await tx.platformRuleChange.createMany({
    data: input.changes.map((c) => ({
      batchId,
      source: input.source,
      field: c.field,
      before: json(c.before),
      after: json(c.after),
      actorId: input.actor.id,
      actorRole: input.actor.role,
      reason,
      meta: input.meta?.[c.field] ?? Prisma.JsonNull,
    })),
  });
  return { batchId, count: input.changes.length };
}
