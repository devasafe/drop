import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { toApiProduct } from '../../controllers/productController';
import { toPublicStore } from '../../repositories/store.repository';
import { effectiveRadiusKm, getDeliveryConfig } from '../deliveryQuote/config';
import {
  estimateQuote,
  resolvePlan1FreeMany,
  storePoint,
  straightKm,
  type LatLngPoint,
} from '../deliveryQuote/quote';
import { discountPercent } from '../search/search';
import { publicStoreVisibilityWhere } from './visibility';
import { ACTIVE_PRODUCT_WHERE } from './activeProduct';

/**
 * Corte das ofertas: são lidas as 500 ofertas MAIS RECENTES (createdAt desc) e a ordem por % de
 * desconto é feita em JS sobre elas. Acima disso, ofertas antigas com desconto maior ficam de fora.
 */
const OFFER_CANDIDATES = 500;
const KM_PER_DEG_LAT = 111.19;

/**
 * Produtos com desconto real (`oldPrice > price`, comparado no banco pelo field reference do
 * Prisma), do maior para o menor desconto %. Com ponto, só lojas cujo raio efetivo cobre o
 * ponto em linha reta (a loja sem coordenadas fica de fora). KYC e mensalidade sempre aplicados.
 */
export async function listOffers(params: { point: LatLngPoint | null; limit: number }) {
  const visibility = await publicStoreVisibilityWhere();
  let storeFilter: Prisma.ProductWhereInput = { store: visibility };

  if (params.point) {
    const cfg = await getDeliveryConfig();
    const boxIds = await storeIdsInBox(params.point, cfg.defaultRadiusKm);
    if (boxIds.length === 0) return [];
    const stores = await prisma.store.findMany({
      where: { AND: [visibility, { id: { in: boxIds } }] },
      select: { id: true, latitude: true, longitude: true, deliveryRadiusKm: true },
    });
    const covered = stores
      .filter((s) => {
        const p = storePoint(s);
        return !!p && straightKm(p, params.point!) <= effectiveRadiusKm(s, cfg);
      })
      .map((s) => s.id);
    if (covered.length === 0) return [];
    storeFilter = { storeId: { in: covered } };
  }

  const rows = await prisma.product.findMany({
    where: { ...storeFilter, ...ACTIVE_PRODUCT_WHERE, oldPrice: { gt: prisma.product.fields.price } },
    include: { category: { select: { name: true } }, store: { select: { name: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: OFFER_CANDIDATES,
  });

  return rows
    .map((row) => {
      const { store, ...rest } = row;
      const api = toApiProduct(rest);
      return { ...api, storeName: store?.name ?? null, discountPercent: discountPercent(api.price, api.oldPrice) };
    })
    .filter((p) => p.discountPercent > 0)
    .sort((a, b) => b.discountPercent - a.discountPercent)
    .slice(0, params.limit);
}

/** Ids das lojas dentro de uma caixa lat/lng em torno do ponto (pré-filtro barato; coluna é texto). */
async function storeIdsInBox(point: LatLngPoint, radiusKm: number): Promise<string[]> {
  const dLat = radiusKm / KM_PER_DEG_LAT;
  const cos = Math.max(0.01, Math.cos((point.lat * Math.PI) / 180));
  const dLng = radiusKm / (KM_PER_DEG_LAT * cos);
  // [.] e não \. : a barra se perde no literal e o ponto casaria qualquer caractere (ex.: vírgula).
  const NUM = '^-?[0-9]+([.][0-9]+)?$';
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT s."id" FROM "Store" s
    WHERE s."latitude" ~ ${NUM} AND s."longitude" ~ ${NUM}
      AND (CASE WHEN s."latitude" ~ ${NUM} THEN s."latitude"::float8 END) BETWEEN ${point.lat - dLat} AND ${point.lat + dLat}
      AND (CASE WHEN s."longitude" ~ ${NUM} THEN s."longitude"::float8 END) BETWEEN ${point.lng - dLng} AND ${point.lng + dLng}`;
  return rows.map((r) => r.id);
}

/**
 * Lojas (todos os planos) cujo raio efetivo cobre o ponto, da mais próxima para a mais distante.
 * Cada item: `toPublicStore` + `quote` (estimativa, sem custo de rota). KYC e mensalidade aplicados.
 */
export async function listNearbyStores(params: { point: LatLngPoint; limit: number }) {
  const cfg = await getDeliveryConfig();
  const boxIds = await storeIdsInBox(params.point, cfg.defaultRadiusKm);
  if (boxIds.length === 0) return [];

  const visibility = await publicStoreVisibilityWhere();
  const stores = await prisma.store.findMany({ where: { AND: [visibility, { id: { in: boxIds } }] } });

  const covered = stores
    .map((s) => {
      const p = storePoint(s);
      return p ? { store: s, km: straightKm(p, params.point) } : null;
    })
    .filter((x): x is { store: (typeof stores)[number]; km: number } => !!x && x.km <= effectiveRadiusKm(x.store, cfg))
    .sort((a, b) => a.km - b.km || (a.store.id < b.store.id ? -1 : 1))
    .slice(0, params.limit);

  const plan1Free = await resolvePlan1FreeMany(covered.map((c) => c.store.id));
  const now = new Date();
  return covered.map(({ store }) => ({
    ...toPublicStore(store),
    quote: estimateQuote(store, params.point, { ...cfg, plan1Free: plan1Free.get(store.id) ?? false }, now),
  }));
}
