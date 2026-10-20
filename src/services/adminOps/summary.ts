/**
 * D3b-1 · KPIs de hoje, pedidos por hora e "Saúde agora" (spec 3.1, lateral).
 * Hoje = dia civil de São Paulo (saoPauloDayRange, decisão R3). Reais somados em centavos.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { saoPauloDayRange, toCents, fromCents } from '../moneyOverview.service';
import { OpsSummary } from './types';
import { ACTIVE_ORDER_STATUSES, CANCELLED_ORDER_STATUSES, MIN_MS, avgMinutes, round1 } from './common';

const HOUR_MS = 60 * MIN_MS;
const WEEK_MS = 7 * 24 * HOUR_MS;
/** Janela da "Saúde agora". */
export const HEALTH_WINDOW_MS = 2 * HOUR_MS;

const paidBetween = (start: Date, end: Date): Prisma.OrderWhereInput => ({
  paidAt: { gte: start, lt: end },
  paymentStatus: { in: ['paid', 'refunded'] },
});

const isCancelled = (status: string) => (CANCELLED_ORDER_STATUSES as string[]).includes(status);

export async function getOpsSummary(now: Date = new Date()): Promise<OpsSummary> {
  const day = saoPauloDayRange(now);
  const healthStart = new Date(now.getTime() - HEALTH_WINDOW_MS);
  const [paidToday, lastWeek, cancelLate, ordersActive, online, busy, accepted, assigned, delivered] = await Promise.all([
    prisma.order.findMany({ where: paidBetween(day.start, now), select: { totalValue: true, status: true, paidAt: true } }),
    prisma.order.findMany({
      where: {
        ...paidBetween(new Date(day.start.getTime() - WEEK_MS), new Date(now.getTime() - WEEK_MS)),
        status: { notIn: CANCELLED_ORDER_STATUSES },
      },
      select: { totalValue: true },
    }),
    prisma.cancellation.count({ where: { createdAt: { gte: day.start, lt: now }, isLateCancellation: true } }),
    prisma.order.count({ where: { status: { in: ACTIVE_ORDER_STATUSES }, paymentStatus: 'paid' } }),
    prisma.user.findMany({ where: { isOnline: true, roles: { has: 'motoboy' } }, select: { id: true } }),
    prisma.delivery.findMany({
      where: { status: { in: ['assigned', 'picked'] }, motoboyId: { not: null } },
      select: { motoboyId: true },
      distinct: ['motoboyId'],
    }),
    prisma.order.findMany({
      where: { acceptedAt: { gte: healthStart, lte: now }, paidAt: { not: null } },
      select: { paidAt: true, acceptedAt: true },
    }),
    prisma.delivery.findMany({ where: { assignedAt: { gte: healthStart, lte: now } }, select: { createdAt: true, assignedAt: true } }),
    prisma.delivery.findMany({
      where: { deliveredAt: { gte: healthStart, lte: now }, pickedAt: { not: null } },
      select: { pickedAt: true, deliveredAt: true },
    }),
  ]);

  const gmvCents = paidToday.filter((o) => !isCancelled(o.status)).reduce((sum, o) => sum + toCents(o.totalValue), 0);
  const lastWeekCents = lastWeek.reduce((sum, o) => sum + toCents(o.totalValue), 0);
  const cancelled = paidToday.filter((o) => isCancelled(o.status)).length;

  const busyIds = new Set(busy.map((d) => d.motoboyId));
  const motoboysDelivering = online.filter((u) => busyIds.has(u.id)).length;

  const currentHour = Math.min(23, Math.floor((now.getTime() - day.start.getTime()) / HOUR_MS));
  const perHour = Array.from({ length: currentHour + 1 }, (_, hour) => ({ hour, count: 0 }));
  for (const o of paidToday) {
    if (!o.paidAt) continue;
    const hour = Math.floor((o.paidAt.getTime() - day.start.getTime()) / HOUR_MS);
    if (hour >= 0 && hour <= currentHour) perHour[hour].count += 1;
  }

  return {
    today: {
      gmv: fromCents(gmvCents),
      gmvLastWeekSameTime: fromCents(lastWeekCents),
      orders: paidToday.length,
      ordersActive,
      cancelPct: paidToday.length ? round1((cancelled / paidToday.length) * 100) : 0,
      cancelLate,
      motoboysOnline: online.length,
      motoboysDelivering,
      motoboysFree: online.length - motoboysDelivering,
    },
    perHour,
    health: {
      storeAcceptAvgMin: avgMinutes(accepted.map((o): [Date | null, Date | null] => [o.paidAt, o.acceptedAt])),
      findMotoboyAvgMin: avgMinutes(assigned.map((d): [Date | null, Date | null] => [d.createdAt, d.assignedAt])),
      deliveryAvgMin: avgMinutes(delivered.map((d): [Date | null, Date | null] => [d.pickedAt, d.deliveredAt])),
    },
  };
}
