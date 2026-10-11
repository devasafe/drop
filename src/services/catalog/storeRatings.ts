// src/services/catalog/storeRatings.ts
import { prisma } from '../../lib/prisma';

/** Abaixo disso a média engana (uma nota 5 vira "5,0"): a vitrine não mostra. */
export const MIN_RATINGS_TO_SHOW = 3;

export interface StoreRatingSummary { ratingAverage: number | null; ratingCount: number }

/** Média (uma casa) e contagem de `Order.storeRating` por loja, numa consulta só. */
export async function storeRatingSummaries(storeIds: string[]): Promise<Map<string, StoreRatingSummary>> {
  const ids = [...new Set(storeIds.filter(Boolean).map(String))];
  const out = new Map<string, StoreRatingSummary>();
  if (ids.length === 0) return out;
  const rows = await prisma.order.groupBy({
    by: ['storeId'],
    where: { storeId: { in: ids }, storeRating: { not: null } },
    _avg: { storeRating: true },
    _count: { storeRating: true },
  });
  for (const r of rows) {
    const count = r._count.storeRating;
    const avg = r._avg.storeRating;
    out.set(String(r.storeId), {
      ratingCount: count,
      ratingAverage: count >= MIN_RATINGS_TO_SHOW && avg != null ? Math.round(Number(avg) * 10) / 10 : null,
    });
  }
  return out;
}

/** Acrescenta `ratingAverage`/`ratingCount` a lojas já serializadas (toPublicStore). */
export async function withStoreRatings<T extends { id?: string; _id?: string }>(stores: T[]): Promise<Array<T & StoreRatingSummary>> {
  const map = await storeRatingSummaries(stores.map((s) => String(s.id ?? s._id ?? '')));
  return stores.map((s) => ({ ...s, ...(map.get(String(s.id ?? s._id ?? '')) ?? { ratingAverage: null, ratingCount: 0 }) }));
}
