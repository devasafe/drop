import { prisma } from '../../lib/prisma';

/**
 * D3b-2b · espera da verificação (spec 8, ruling 1 e 5). Fonte: as linhas verification_decision de
 * AdminAccountAction (uma por decisão, individual ou em lote). Por ITEM de meta.items:
 * - decisions30d conta todo item decidido na janela (now − 30 d, now];
 * - a média usa só os itens com submittedAt válido e não posterior à decisão.
 */
export const STATS_WINDOW_DAYS = 30;
const HOUR_MS = 3_600_000;

export interface VerificationStats {
  avgHoursToDecision: number | null;
  decisions30d: number;
}

function metaItems(meta: unknown): Array<Record<string, unknown>> {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return [];
  const items = (meta as Record<string, unknown>).items;
  if (!Array.isArray(items)) return [];
  return items.filter((i): i is Record<string, unknown> => !!i && typeof i === 'object' && !Array.isArray(i));
}

function timeOf(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

export async function getVerificationStats(now: Date = new Date()): Promise<VerificationStats> {
  const since = new Date(now.getTime() - STATS_WINDOW_DAYS * 24 * HOUR_MS);
  const rows = await prisma.adminAccountAction.findMany({
    where: { type: 'verification_decision', createdAt: { gt: since, lte: now } },
    select: { createdAt: true, meta: true },
  });

  let decisions = 0;
  let totalHours = 0;
  let counted = 0;
  for (const row of rows) {
    const decidedAt = row.createdAt.getTime();
    for (const item of metaItems(row.meta)) {
      decisions += 1;
      const submitted = timeOf(item.submittedAt);
      if (submitted === null || submitted > decidedAt) continue;
      totalHours += (decidedAt - submitted) / HOUR_MS;
      counted += 1;
    }
  }
  return {
    avgHoursToDecision: counted > 0 ? Math.round((totalHours / counted) * 10) / 10 : null,
    decisions30d: decisions,
  };
}
