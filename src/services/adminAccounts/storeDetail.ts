/**
 * D3b-2a · ficha da loja (spec 6). Só leitura; a mensalidade só é exibida (as ações são da 2b).
 * A chave Pix e a chave da conta Asaas nunca saem: do recebimento vão só o estado e, para o CEO, o
 * último erro (o texto cru do Asaas é exclusivo do CEO, como em /admin/stores/:id/asaas).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import env from '../../config/env';
import { getSaasConfig } from '../../utils/settlement';
import { PermissionCheck, round1, shortOrderId } from '../adminOps/common';
import { listTimeline } from './actions';
import { isAdminPaused } from './storePause';
import {
  RECEIVING_SELECT,
  STORE_SITUATION_SELECT,
  receivingLastError,
  receivingStatus,
  storeModeOf,
  storePlanNumber,
  storeSituation,
} from './storeStatus';
import { sellsUntil } from '../saasBilling/policy';
import { toSaasState } from './saas';
import { StoreAsaasHistory, StoreDetail, TimelineResponse } from './types';

const DAY_MS = 86_400_000;
const ORDERS_IN_DETAIL = 20;
const REVIEWS_IN_DETAIL = 10;
const ASAAS_AUDITS_IN_DETAIL = 20;

const money = (v: unknown): number => Math.round(Number(v ?? 0) * 100) / 100;

const STORE_DETAIL_SELECT = Prisma.validator<Prisma.StoreSelect>()({
  id: true,
  name: true,
  cnpj: true,
  city: true,
  plan: true,
  adminPausedBy: true,
  adminPauseReason: true,
  ...STORE_SITUATION_SELECT,
  ...RECEIVING_SELECT,
  owner: { select: { id: true, name: true } },
  saasBilling: { select: { status: true, trialEndsAt: true, paidUntil: true, cancelledAt: true } },
});

/** Decisão 15: cancelamentos dos últimos 30 dias que contam contra a loja (mesma culpa de faultStats). */
async function storeFaultCancellations(storeId: string, since: Date): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n
      FROM "Cancellation" c
      JOIN "Order" o ON o.id = c."orderId"
     WHERE o."storeId" = ${storeId}
       AND c."createdAt" >= ${since}
       AND (c."cancelledBy" = 'store' OR (c."cancelledBy" = 'admin' AND c."faultParty" = 'store'))`;
  return rows[0]?.n ?? 0;
}

/** D3b-2b · "Conta Asaas · histórico" (ruling 11): auditoria da chave e o último aceite do termo. Só CEO. */
async function storeAsaasHistory(storeId: string): Promise<StoreAsaasHistory> {
  const [audits, consent] = await Promise.all([
    prisma.storeAsaasAudit.findMany({
      where: { storeId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: ASAAS_AUDITS_IN_DETAIL,
      select: { action: true, apiKeyLast4: true, actorId: true, createdAt: true },
    }),
    prisma.storeAsaasConsent.findFirst({
      where: { storeId },
      orderBy: [{ acceptedAt: 'desc' }, { id: 'desc' }],
      select: { termsVersion: true, ip: true, acceptedAt: true, actorRole: true },
    }),
  ]);
  const actorIds = [...new Set(audits.map((a) => a.actorId))];
  const users = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
    : [];
  const names = new Map(users.map((u) => [u.id, u.name]));
  return {
    audits: audits.map((a) => ({
      action: a.action,
      apiKeyLast4: a.apiKeyLast4 ?? null,
      actor: { id: a.actorId, name: names.get(a.actorId) ?? null },
      createdAt: a.createdAt.toISOString(),
    })),
    consent: consent
      ? { termsVersion: consent.termsVersion, ip: consent.ip ?? null, acceptedAt: consent.acceptedAt.toISOString(), actorRole: consent.actorRole }
      : null,
  };
}

export interface StoreDetailViewer {
  isCeo: boolean;
  can: PermissionCheck;
}

export async function getAdminStoreDetail(storeId: string, viewer: StoreDetailViewer, now: Date = new Date()): Promise<StoreDetail | null> {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: STORE_DETAIL_SELECT });
  if (!store) return null;
  const since = new Date(now.getTime() - 30 * DAY_MS);

  const [cfg, subscription, stats, faultCancellations, reviews, orders, pausedBy, timeline, asaasHistory] = await Promise.all([
    getSaasConfig(),
    prisma.storeSubscription.findUnique({ where: { storeId }, select: { currentPlan: true } }),
    prisma.order.aggregate({ where: { storeId, createdAt: { gte: since } }, _count: { _all: true }, _avg: { storeRating: true } }),
    storeFaultCancellations(storeId, since),
    prisma.order.findMany({
      where: { storeId, storeRating: { not: null }, AND: [{ storeComment: { not: null } }, { storeComment: { not: '' } }] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: REVIEWS_IN_DETAIL,
      select: { id: true, storeRating: true, storeComment: true, storeReply: true, createdAt: true },
    }),
    prisma.order.findMany({
      where: { storeId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: ORDERS_IN_DETAIL,
      select: { id: true, status: true, totalValue: true, createdAt: true, customer: { select: { name: true } } },
    }),
    store.adminPausedBy && store.adminPausedBy !== 'system'
      ? prisma.user.findUnique({ where: { id: store.adminPausedBy }, select: { name: true } })
      : null,
    listTimeline({ storeId }),
    viewer.isCeo ? storeAsaasHistory(storeId) : Promise.resolve(null),
  ]);

  const paused = isAdminPaused(store);
  const canEdit = viewer.can('store:edit');
  // Estender e cancelar a mensalidade só no modo direto (a mesma regra das ações em saas.ts).
  const canSaas = viewer.can('plan:manage') && cfg.settlementMode === 'direto';
  const saasStatus = store.saasBilling?.status ?? null;
  const avg = stats._avg.storeRating;

  return {
    profile: {
      id: store.id,
      name: store.name,
      cnpj: store.cnpj ?? null,
      owner: { id: store.owner.id, name: store.owner.name },
      city: store.city ?? null,
      situation: storeSituation(store, now),
      adminPause: paused && store.adminPausedAt
        ? {
            at: store.adminPausedAt.toISOString(),
            by: { id: store.adminPausedBy ?? 'system', name: pausedBy?.name ?? null },
            // A pausa exige motivo (P1.4); '' só por defesa, para o tipo ficar texto.
            reason: store.adminPauseReason ?? '',
          }
        : null,
    },
    stats30d: {
      orders: stats._count._all,
      cancelledByStore: faultCancellations,
      rating: avg == null ? null : round1(avg),
    },
    reviews: reviews.map((r) => ({
      orderId: r.id,
      rating: r.storeRating as number,
      comment: r.storeComment ?? '',
      reply: r.storeReply ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    receiving: {
      status: receivingStatus(cfg.settlementMode, env.PAYMENT_GATEWAY, store),
      detail: viewer.isCeo ? receivingLastError(cfg.settlementMode, store) : null,
    },
    plan: {
      plan: storePlanNumber(subscription?.currentPlan, store.plan),
      mode: storeModeOf(cfg.settlementMode),
      // coveredUntil: o último instante coberto, pela MESMA conta da vitrine e do job (policy.sellsUntil).
      saas: store.saasBilling
        ? { ...toSaasState(store.saasBilling), coveredUntil: sellsUntil(store.saasBilling).toISOString() }
        : null,
    },
    orders: orders.map((o) => ({
      id: o.id,
      shortId: shortOrderId(o.id),
      status: o.status,
      total: money(o.totalValue),
      customerName: o.customer.name,
      createdAt: o.createdAt.toISOString(),
    })),
    timeline,
    can: {
      pause: canEdit && !paused,
      unpause: canEdit && paused,
      note: true,
      extendTrial: canSaas && saasStatus === 'trialing',
      cancelSaas: canSaas && saasStatus !== null && saasStatus !== 'cancelled',
    },
    // Ruling 11: só o CEO; para os outros a chave não existe.
    ...(asaasHistory ? { asaasHistory } : {}),
  };
}

/** Uma página do histórico da loja; null quando a loja não existe. */
export async function storeTimeline(storeId: string, cursor?: string): Promise<TimelineResponse | null> {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
  if (!store) return null;
  return listTimeline({ storeId, cursor });
}
