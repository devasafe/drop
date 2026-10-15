import { prisma } from '../lib/prisma';
import { brazilNow } from '../utils/storeHours';

const DAY_MS = 86_400_000;

export interface PeriodSummary { earnings: number; count: number }
export interface MotoboySummary { today: PeriodSummary; week: PeriodSummary }

/**
 * Início do dia e da semana (segunda 00:00) no fuso de São Paulo, como instantes UTC.
 * O container roda em UTC; `brazilNow` dá o dia da semana e o minuto do dia em SP.
 */
export function saoPauloDayAndWeekStart(now: Date = new Date()): { dayStart: Date; weekStart: Date } {
  const { dayIndex, minutes } = brazilNow(now);
  const dayStart = new Date(now.getTime() - minutes * 60_000 - now.getUTCSeconds() * 1000 - now.getUTCMilliseconds());
  const sinceMonday = (dayIndex + 6) % 7; // 0 = segunda … 6 = domingo
  return { dayStart, weekStart: new Date(dayStart.getTime() - sinceMonday * DAY_MS) };
}

/**
 * Compensações de cancelamento (cliente cancelou depois do aceite, ou cliente ausente) gravadas no
 * período, em centavos e datadas pelo primeiro registro — a mesma data que as barras da semana usam.
 * Mesma regra de services/motoboyCompensation: numa corrida não entregue, o único repasse ao
 * motoboy é a compensação (Payouts não cancelados na custódia; MotoboyTransfer
 * 'cancellation_compensation' no direto). Só lê o que foi gravado.
 */
async function compensationsSince(motoboyId: string, since: Date, now: Date): Promise<{ at: Date; cents: number }[]> {
  const [recent, transfers] = await Promise.all([
    prisma.payout.findMany({
      where: { recipientType: 'motoboy', recipientId: motoboyId, status: { not: 'cancelled' }, deliveryId: { not: null }, createdAt: { gte: since, lte: now } },
      select: { deliveryId: true },
    }),
    prisma.motoboyTransfer.findMany({
      where: { motoboyId, reason: 'cancellation_compensation', createdAt: { gte: since, lte: now } },
      select: { createdAt: true, amount: true },
    }),
  ]);
  const out = transfers.map((t) => ({ at: t.createdAt, cents: Math.round(Number(t.amount) * 100) }));
  const candidates = Array.from(new Set(recent.map((p) => String(p.deliveryId))));
  if (candidates.length === 0) return out;
  const notDelivered = await prisma.delivery.findMany({
    where: { id: { in: candidates }, status: { not: 'delivered' } },
    select: { id: true },
  });
  if (notDelivered.length === 0) return out;
  // Todos os pedaços da compensação (um saque pode tê-la fracionado), datados pelo primeiro.
  const parts = await prisma.payout.findMany({
    where: { recipientType: 'motoboy', recipientId: motoboyId, status: { not: 'cancelled' }, deliveryId: { in: notDelivered.map((d) => d.id) } },
    select: { deliveryId: true, amount: true, createdAt: true },
  });
  const byRide = new Map<string, { at: Date; cents: number }>();
  for (const p of parts) {
    const key = String(p.deliveryId);
    const cur = byRide.get(key);
    const cents = Math.round(Number(p.amount) * 100);
    byRide.set(key, cur ? { at: p.createdAt < cur.at ? p.createdAt : cur.at, cents: cur.cents + cents } : { at: p.createdAt, cents });
  }
  for (const c of byRide.values()) if (c.at >= since && c.at <= now) out.push(c);
  return out;
}

/**
 * Resumo do motoboy (spec D2 5.1, item 5): corridas ENTREGUES no período (por deliveredAt) e o
 * que foi gravado para ele nelas — Payouts não cancelados (custódia, inclusive os fracionados
 * por saque) e a MotoboyTransfer de entrega (direto) —, mais as compensações de cancelamento do
 * período (decisão do produto, 15/10: o total da semana bate com as barras). `count` são só as
 * corridas entregues. Nada é recalculado a partir da taxa.
 */
export async function motoboySummary(motoboyId: string, now: Date = new Date()): Promise<MotoboySummary> {
  const { dayStart, weekStart } = saoPauloDayAndWeekStart(now);
  const rides = await prisma.delivery.findMany({
    where: { motoboyId, status: 'delivered', deliveredAt: { gte: weekStart, lte: now } },
    select: { id: true, deliveredAt: true },
  });
  const ids = rides.map((r) => r.id);
  const cents = new Map<string, number>();
  if (ids.length > 0) {
    const [payouts, transfers] = await Promise.all([
      prisma.payout.findMany({
        where: { recipientType: 'motoboy', recipientId: motoboyId, deliveryId: { in: ids }, status: { not: 'cancelled' } },
        select: { deliveryId: true, amount: true },
      }),
      prisma.motoboyTransfer.findMany({
        where: { motoboyId, deliveryId: { in: ids }, reason: 'delivery' },
        select: { deliveryId: true, amount: true },
      }),
    ]);
    for (const row of [...payouts, ...transfers]) {
      const id = String(row.deliveryId);
      cents.set(id, (cents.get(id) ?? 0) + Math.round(Number(row.amount) * 100));
    }
  }
  const comps = await compensationsSince(motoboyId, weekStart, now);
  const sum = (list: typeof rides, from: Date): PeriodSummary => ({
    count: list.length,
    earnings: (list.reduce((s, r) => s + (cents.get(r.id) ?? 0), 0)
      + comps.filter((c) => c.at >= from).reduce((s, c) => s + c.cents, 0)) / 100,
  });
  return {
    today: sum(rides.filter((r) => r.deliveredAt !== null && r.deliveredAt >= dayStart), dayStart),
    week: sum(rides, weekStart),
  };
}
