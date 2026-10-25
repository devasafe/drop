/**
 * D3b-2a · lista de lojas do admin (spec 6); D3b-4b · paginada no banco (spec 8 e 7.2).
 *
 * Ordem (decisão 13): quem pede atenção primeiro, depois o nome, depois o id. A atenção é o campo gravado
 * Store.needsAttention (storeAttention.ts), então a ordem, o cursor keyset [atenção, nome, id] e os filtros
 * attention/admin_paused/trial saem do banco. O nome segue a collation do banco. Os números da linha (nota de
 * 90 dias, cancelamento de 30 dias, plano e motoboys por perto) são calculados só para as lojas da página.
 * O filtro no_courier usa as mesmas lojas do alerta do mapa (openStoresWithCoords, R5 do mestre): calcula sobre
 * elas e pagina no banco com `id in`.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import env from '../../config/env';
import { AppError } from '../../utils/AppError';
import { getSaasConfig } from '../../utils/settlement';
import { round1 } from '../adminOps/common';
import { storeCoord } from '../adminOps/map';
import * as couriersNear from '../adminOps/couriersNear';
import type { NearbyCouriers } from '../adminOps/couriersNear';
import { DISPATCH_MAX_KM } from '../dispatch';
import { CancelTotals, cancelRateOf, cancelTotals30d } from './storeAttention';
import {
  RECEIVING_SELECT,
  STORE_SITUATION_SELECT,
  receivingStatus,
  storeModeOf,
  storePlanNumber,
  storeSituation,
} from './storeStatus';
import { StoreListFilter, StoreListItem, StoreListResponse } from './types';

export const STORE_LIST_FILTERS: readonly StoreListFilter[] = ['all', 'admin_paused', 'attention', 'trial', 'no_courier'];
export const STORES_PAGE_DEFAULT = 30;
export const STORES_PAGE_MAX = 100;
const DAY_MS = 86_400_000;
const CNPJ_LIKE = /^[\d\s./-]+$/;

export interface ListAdminStoresInput {
  q: string;
  filter: StoreListFilter;
  cursor?: string;
  limit?: string;
}

interface SortKey {
  attention: boolean;
  name: string;
  id: string;
}

const STORE_LIST_SELECT = Prisma.validator<Prisma.StoreSelect>()({
  id: true,
  name: true,
  plan: true,
  needsAttention: true,
  latitude: true,
  longitude: true,
  ...STORE_SITUATION_SELECT,
  ...RECEIVING_SELECT,
  owner: { select: { name: true } },
});

type StoreRow = Prisma.StoreGetPayload<{ select: typeof STORE_LIST_SELECT }>;

/** A ordem da lista; o índice Store(needsAttention DESC, name, id) a cobre. */
const STORE_ORDER: Prisma.StoreOrderByWithRelationInput[] = [{ needsAttention: 'desc' }, { name: 'asc' }, { id: 'asc' }];

const keyOf = (s: StoreRow): SortKey => ({ attention: s.needsAttention, name: s.name, id: s.id });

function encodeStoreCursor(k: SortKey): string {
  return Buffer.from(JSON.stringify([k.attention ? 1 : 0, k.name, k.id]), 'utf8').toString('base64url');
}

function decodeStoreCursor(raw: string): SortKey {
  const invalid = () => new AppError('Cursor inválido', 400, true, 'INVALID_CURSOR');
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw invalid();
  }
  if (!Array.isArray(parsed) || parsed.length !== 3) throw invalid();
  const [attention, name, id] = parsed;
  if ((attention !== 0 && attention !== 1) || typeof name !== 'string' || name.length > 300) throw invalid();
  if (typeof id !== 'string' || !id || id.length > 64) throw invalid();
  return { attention: attention === 1, name, id };
}

function pageLimit(raw?: string): number {
  const n = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, STORES_PAGE_MAX) : STORES_PAGE_DEFAULT;
}

/** Os 14 dígitos de um CNPJ digitado com ou sem máscara; null quando o texto é nome. */
export function cnpjDigits(text: string): string | null {
  if (!CNPJ_LIKE.test(text)) return null;
  const digits = text.replace(/\D/g, '');
  return digits.length === 14 ? digits : null;
}

async function searchWhere(q: string): Promise<Prisma.StoreWhereInput> {
  const text = q.trim().slice(0, 100);
  if (!text) return {};
  const cnpj = cnpjDigits(text);
  if (!cnpj) return { name: { contains: text, mode: 'insensitive' } };
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Store" WHERE regexp_replace(COALESCE(cnpj, ''), '[^0-9]', '', 'g') = ${cnpj}`;
  return { id: { in: rows.map((r) => r.id) } };
}

/** no_courier não tem `where` próprio: a página filtra pelos ids de pageWithoutCourier. */
function filterWhere(filter: StoreListFilter): Prisma.StoreWhereInput {
  if (filter === 'admin_paused') return { adminPausedAt: { not: null } };
  if (filter === 'trial') return { saasBilling: { is: { status: 'trialing' } } };
  if (filter === 'attention') return { needsAttention: true };
  return {};
}

/** Keyset: o que vem depois de `after` na ordem (atenção desc, nome, id). Nome igual: o id desempata. */
function afterWhere(after: SortKey | null): Prisma.StoreWhereInput {
  if (!after) return {};
  const same = { needsAttention: after.attention };
  const next: Prisma.StoreWhereInput[] = [
    { ...same, name: { gt: after.name } },
    { ...same, name: after.name, id: { gt: after.id } },
  ];
  if (after.attention) next.push({ needsAttention: false });
  return { OR: next };
}

/** Ponto da loja para couriersNearStores (a entrada que a P2 documenta); texto vazio ou inválido = null. */
const pointOf = (s: StoreRow) => ({ id: s.id, lat: storeCoord(s.latitude), lng: storeCoord(s.longitude) });

interface PageResult {
  page: StoreRow[];
  hasMore: boolean;
  nearby: Map<string, NearbyCouriers | null>;
}

async function plainPage(where: Prisma.StoreWhereInput, limit: number, now: Date): Promise<PageResult> {
  const rows = await prisma.store.findMany({ where, orderBy: STORE_ORDER, take: limit + 1, select: STORE_LIST_SELECT });
  const page = rows.slice(0, limit);
  const nearby = page.length > 0
    ? await couriersNear.couriersNearStores(page.map(pointOf), now)
    : new Map<string, NearbyCouriers | null>();
  return { page, hasMore: rows.length > limit, nearby };
}

/**
 * Spec 7.2: as lojas do alerta do mapa (R5 do mestre). openStoresWithCoords (P2) dá as visíveis na vitrine,
 * abertas com horário e com ponto; couriersNearStores conta os motoboys; ficam as com 0 online. As abertas são
 * poucas: calcula sobre elas e pagina no banco (`id in`), com a mesma ordem e o mesmo cursor dos outros filtros.
 */
async function pageWithoutCourier(where: Prisma.StoreWhereInput, limit: number, now: Date): Promise<PageResult> {
  const open = await couriersNear.openStoresWithCoords(now);
  const nearby = open.length > 0 ? await couriersNear.couriersNearStores(open, now) : new Map<string, NearbyCouriers | null>();
  const ids = open.filter((s) => nearby.get(s.id)?.online === 0).map((s) => s.id);
  if (ids.length === 0) return { page: [], hasMore: false, nearby };
  const rows = await prisma.store.findMany({
    where: { AND: [where, { id: { in: ids } }] },
    orderBy: STORE_ORDER,
    take: limit + 1,
    select: STORE_LIST_SELECT,
  });
  return { page: rows.slice(0, limit), hasMore: rows.length > limit, nearby };
}

/** Nota de 90 dias e pedidos/cancelados de 30 dias, só das lojas da página. */
async function pageAggregates(storeIds: string[], now: Date) {
  if (storeIds.length === 0) {
    return { rating: new Map<string, number | null>(), totals: new Map<string, CancelTotals>() };
  }
  const [ratings, totals] = await Promise.all([
    prisma.order.groupBy({
      by: ['storeId'],
      where: { storeId: { in: storeIds }, storeRating: { not: null }, createdAt: { gte: new Date(now.getTime() - 90 * DAY_MS) } },
      _avg: { storeRating: true },
    }),
    cancelTotals30d(storeIds, now),
  ]);
  return { rating: new Map<string, number | null>(ratings.map((r) => [r.storeId, r._avg.storeRating])), totals };
}

export async function listAdminStores(input: ListAdminStoresInput, now: Date = new Date()): Promise<StoreListResponse> {
  const limit = pageLimit(input.limit);
  const after = input.cursor ? decodeStoreCursor(input.cursor) : null;
  const where: Prisma.StoreWhereInput = {
    AND: [filterWhere(input.filter), await searchWhere(input.q), afterWhere(after)],
  };
  const { page, hasMore, nearby } = input.filter === 'no_courier'
    ? await pageWithoutCourier(where, limit, now)
    : await plainPage(where, limit, now);

  const ids = page.map((s) => s.id);
  const [aggregates, subscriptions, cfg] = await Promise.all([
    pageAggregates(ids, now),
    prisma.storeSubscription.findMany({ where: { storeId: { in: ids } }, select: { storeId: true, currentPlan: true } }),
    getSaasConfig(),
  ]);
  const planBy = new Map(subscriptions.map((s) => [s.storeId, s.currentPlan]));
  const mode = storeModeOf(cfg.settlementMode);

  const items = page.map((s): StoreListItem => {
    const rate = cancelRateOf(aggregates.totals.get(s.id));
    const avg = aggregates.rating.get(s.id);
    return {
      id: s.id,
      name: s.name,
      ownerName: s.owner.name,
      // Modo SaaS não tem planos (todas com os direitos do Plano 3): a lista não mostra plano.
      plan: cfg.settlementMode === 'direto' ? null : storePlanNumber(planBy.get(s.id), s.plan),
      mode,
      rating90d: avg == null ? null : round1(avg),
      cancelRate30d: rate == null ? null : Math.round(rate * 1000) / 1000,
      receiving: receivingStatus(cfg.settlementMode, env.PAYMENT_GATEWAY, s),
      situation: storeSituation(s, now),
      attention: s.needsAttention,
      nearbyCouriers: nearby.get(s.id) ?? null,
    };
  });

  const last = page[page.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? encodeStoreCursor(keyOf(last)) : null,
    nearbyRadiusKm: DISPATCH_MAX_KM,
  };
}
