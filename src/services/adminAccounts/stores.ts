/**
 * D3b-2a · lista de lojas do admin (spec 6).
 *
 * Ordem (decisão 13): quem pede atenção primeiro, depois o nome, depois o id. A atenção depende de
 * métricas calculadas, então a lista lê as lojas do filtro, agrega as métricas com dois groupBy sobre
 * Order (sem N+1), ordena em memória e pagina por um cursor opaco [atenção, nome, id]: a página seguinte
 * começa no primeiro item maior que o cursor, sem repetir nem pular.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import env from '../../config/env';
import { AppError } from '../../utils/AppError';
import { getSaasConfig } from '../../utils/settlement';
import { CANCELLED_ORDER_STATUSES, round1 } from '../adminOps/common';
import {
  RECEIVING_SELECT,
  STORE_SITUATION_SELECT,
  receivingStatus,
  storeModeOf,
  storePlanNumber,
  storeSituation,
} from './storeStatus';
import { StoreListFilter, StoreListItem, StoreListResponse } from './types';

export const STORE_LIST_FILTERS: readonly StoreListFilter[] = ['all', 'admin_paused', 'attention', 'trial'];
export const STORES_PAGE_DEFAULT = 30;
export const STORES_PAGE_MAX = 100;
export const CANCEL_RATE_MIN_ORDERS = 5;
export const CANCEL_RATE_ATTENTION = 0.1;
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
  ...STORE_SITUATION_SELECT,
  ...RECEIVING_SELECT,
  owner: { select: { name: true } },
});

function compareKeys(a: SortKey, b: SortKey): number {
  if (a.attention !== b.attention) return a.attention ? -1 : 1;
  const byName = a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
  if (byName !== 0) return byName;
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

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

function filterWhere(filter: StoreListFilter): Prisma.StoreWhereInput {
  if (filter === 'admin_paused') return { adminPausedAt: { not: null } };
  if (filter === 'trial') return { saasBilling: { is: { status: 'trialing' } } };
  return {};
}

/** Nota de 90 dias e pedidos/cancelados de 30 dias de todas as lojas: dois groupBy, sem N+1. */
async function storeAggregates(now: Date) {
  const [ratings, counts] = await Promise.all([
    prisma.order.groupBy({
      by: ['storeId'],
      where: { storeRating: { not: null }, createdAt: { gte: new Date(now.getTime() - 90 * DAY_MS) } },
      _avg: { storeRating: true },
    }),
    prisma.order.groupBy({
      by: ['storeId', 'status'],
      where: { createdAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } },
      _count: { _all: true },
    }),
  ]);
  const rating = new Map(ratings.map((r) => [r.storeId, r._avg.storeRating]));
  const totals = new Map<string, { orders: number; cancelled: number }>();
  for (const c of counts) {
    const t = totals.get(c.storeId) ?? { orders: 0, cancelled: 0 };
    t.orders += c._count._all;
    if ((CANCELLED_ORDER_STATUSES as string[]).includes(c.status)) t.cancelled += c._count._all;
    totals.set(c.storeId, t);
  }
  return { rating, totals };
}

export async function listAdminStores(input: ListAdminStoresInput, now: Date = new Date()): Promise<StoreListResponse> {
  const limit = pageLimit(input.limit);
  const after = input.cursor ? decodeStoreCursor(input.cursor) : null;
  const where: Prisma.StoreWhereInput = { AND: [filterWhere(input.filter), await searchWhere(input.q)] };

  const [stores, aggregates, subscriptions, cfg] = await Promise.all([
    prisma.store.findMany({ where, select: STORE_LIST_SELECT }),
    storeAggregates(now),
    prisma.storeSubscription.findMany({ select: { storeId: true, currentPlan: true } }),
    getSaasConfig(),
  ]);
  const planBy = new Map(subscriptions.map((s) => [s.storeId, s.currentPlan]));
  const mode = storeModeOf(cfg.settlementMode);

  const all = stores.map((s): StoreListItem => {
    const totals = aggregates.totals.get(s.id);
    const rate = totals && totals.orders >= CANCEL_RATE_MIN_ORDERS ? totals.cancelled / totals.orders : null;
    const avg = aggregates.rating.get(s.id);
    const receiving = receivingStatus(cfg.settlementMode, env.PAYMENT_GATEWAY, s);
    const situation = storeSituation(s, now);
    return {
      id: s.id,
      name: s.name,
      ownerName: s.owner.name,
      plan: storePlanNumber(planBy.get(s.id), s.plan),
      mode,
      rating90d: avg == null ? null : round1(avg),
      cancelRate30d: rate == null ? null : Math.round(rate * 1000) / 1000,
      receiving,
      situation,
      attention: situation === 'admin_paused' || receiving === 'problem' || (rate !== null && rate > CANCEL_RATE_ATTENTION),
    };
  });

  const rows = (input.filter === 'attention' ? all.filter((s) => s.attention) : all).sort(compareKeys);
  let start = 0;
  if (after) {
    const index = rows.findIndex((r) => compareKeys(r, after) > 0);
    start = index === -1 ? rows.length : index;
  }
  const items = rows.slice(start, start + limit);
  const nextCursor = start + limit < rows.length ? encodeStoreCursor(items[items.length - 1]) : null;
  return { items, nextCursor };
}
