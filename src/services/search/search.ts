import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/AppError';
import { publicStoreBillingWhere } from '../saasBilling/gate';
import { brazilNow, isOpenAt } from '../../utils/storeHours';
import { storePoint, straightKm, type LatLngPoint } from '../deliveryQuote/quote';
import { toApiProduct } from '../../controllers/productController';
import { toPublicStore } from '../../repositories/store.repository';
import { hasSearchExtensions } from './extensions';

/**
 * Busca no servidor (produtos e lojas) e sugestões.
 *
 * SQL cru SEMPRE pelo template tag do Prisma (`Prisma.sql`): o texto do usuário vira parâmetro
 * ($1, $2…), nunca concatenação. As únicas partes "cruas" (`Prisma.raw`) são nomes de coluna
 * fixos deste arquivo; o ORDER BY sai de uma whitelist fechada por `sort`.
 *
 * Visibilidade (KYC + mensalidade): o `where` do Prisma da vitrine (o MESMO do `listStores`)
 * gera a lista de lojas visíveis numa consulta; ela entra no SQL como array parametrizado
 * (`unnest(ids, dists)`), junto com a distância de cada loja. Assim filtro, ordenação e
 * LIMIT/OFFSET acontecem numa consulta só — a página nunca vem curta por causa de um filtro
 * aplicado depois, e loja invisível não tem como vazar. Custo: o array tem o tamanho do número
 * de lojas visíveis (marketplace local: centenas), não do número de produtos.
 *
 * Relevância: com pg_trgm + unaccent, `similarity()` DESC e depois `createdAt` DESC; no fallback,
 * ILIKE sobre `lower(translate(...))` (sem acento), prefixo primeiro e depois `createdAt` DESC.
 *
 * Cursor: base64url de `{"offset":N}` — paginação por deslocamento, simples. Um item inserido
 * entre duas páginas pode repetir/pular um resultado; aceitável para busca.
 */

export type SearchType = 'products' | 'stores';
export type SearchSort = 'relevance' | 'price_asc' | 'price_desc' | 'distance';

export interface SearchParams {
  q: string;
  type: SearchType;
  lat?: number;
  lng?: number;
  categoryName?: string;
  minPrice?: number;
  maxPrice?: number;
  openNow?: boolean;
  sort: SearchSort;
  cursor?: string;
  limit: number;
}

export interface SearchResult {
  items: any[];
  nextCursor: string | null;
}

const ACCENTS_FROM = 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ';
const ACCENTS_TO = 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC';
/** Teto do deslocamento: busca não é exportação. */
export const MAX_OFFSET = 2000;
/** Distância "sem localização" no array (a loja sem coordenada vai para o fim na ordem por distância). */
const NO_DISTANCE = -1;

// ── cursor ──────────────────────────────────────────────────────────────────────────────

export function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset })).toString('base64url');
}

export function decodeCursor(cursor?: string): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const offset = parsed?.offset;
    if (Number.isInteger(offset) && offset >= 0 && offset <= MAX_OFFSET) return offset;
  } catch {
    /* cai no erro abaixo */
  }
  throw new AppError('Cursor inválido', 400, true, 'INVALID_CURSOR');
}

// ── normalização (as duas pontas: coluna e termo) ──────────────────────────────────────

/** Coluna normalizada. `column` é SEMPRE um literal deste arquivo (nunca entrada do usuário). */
function normCol(column: string, trgm: boolean): Prisma.Sql {
  const col = Prisma.raw(column);
  // Com extensão, a expressão é idêntica à dos índices GIN (`lower(immutable_unaccent(name))`).
  return trgm
    ? Prisma.sql`lower(immutable_unaccent(${col}))`
    : Prisma.sql`lower(translate(${col}, ${ACCENTS_FROM}, ${ACCENTS_TO}))`;
}

function normTerm(value: string, trgm: boolean): Prisma.Sql {
  return trgm
    ? Prisma.sql`lower(immutable_unaccent(${value}))`
    : Prisma.sql`lower(translate(${value}, ${ACCENTS_FROM}, ${ACCENTS_TO}))`;
}

/** `%`, `_` e `\` do usuário são literais no LIKE (escape padrão do Postgres é `\`). */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

interface TermSql {
  match: Prisma.Sql;
  relevance: Prisma.Sql;
}

function termSql(column: string, q: string, trgm: boolean): TermSql {
  const n = normCol(column, trgm);
  const like = normTerm(escapeLike(q), trgm);
  if (trgm) {
    const t = normTerm(q, trgm);
    return {
      match: Prisma.sql`(${n} LIKE '%' || ${like} || '%' OR ${n} % ${t})`,
      relevance: Prisma.sql`similarity(${n}, ${t})`,
    };
  }
  return {
    match: Prisma.sql`${n} ILIKE '%' || ${like} || '%'`,
    // Sem similarity: quem começa com o termo vem primeiro.
    relevance: Prisma.sql`(CASE WHEN ${n} LIKE ${like} || '%' THEN 1 ELSE 0 END)`,
  };
}

// ── visibilidade da vitrine ─────────────────────────────────────────────────────────────

interface VisibleStore {
  id: string;
  latitude: string | null;
  longitude: string | null;
  isOpen: boolean;
  operatingHours: any;
}

/** Mesmo filtro do `listStores`: KYC (com KYC_ENFORCED) AND mensalidade (modo direto). */
async function visibleStores(): Promise<VisibleStore[]> {
  const where: Prisma.StoreWhereInput = {};
  if (process.env.KYC_ENFORCED === 'true') where.isVerified = true;
  const billingWhere = await publicStoreBillingWhere();
  if (billingWhere) where.AND = [billingWhere];
  return prisma.store.findMany({
    where,
    select: { id: true, latitude: true, longitude: true, isOpen: true, operatingHours: true },
  });
}

interface StoreScope {
  ids: string[];
  dists: number[];
  distById: Map<string, number | null>;
}

async function storeScope(origin: LatLngPoint | null, openNow: boolean, now = new Date()): Promise<StoreScope> {
  let stores = await visibleStores();
  if (openNow) {
    const { dayIndex, minutes } = brazilNow(now);
    stores = stores.filter((s) => isOpenAt(s, dayIndex, minutes));
  }
  const distById = new Map<string, number | null>();
  const ids: string[] = [];
  const dists: number[] = [];
  for (const s of stores) {
    const p = origin ? storePoint(s) : null;
    const km = origin && p ? Math.round(straightKm(origin, p) * 100) / 100 : null;
    distById.set(s.id, km);
    ids.push(s.id);
    dists.push(km ?? NO_DISTANCE);
  }
  return { ids, dists, distById };
}

/** `JOIN unnest(...)` com as lojas visíveis e a distância de cada uma (parâmetros, não texto). */
function scopeJoin(scope: StoreScope, on: string): Prisma.Sql {
  return Prisma.sql`JOIN unnest(${scope.ids}::text[], ${scope.dists}::float8[]) AS v(sid, dist) ON v.sid = ${Prisma.raw(on)}`;
}

const DIST_ORDER = Prisma.sql`NULLIF(v.dist, ${NO_DISTANCE}) ASC NULLS LAST`;

// ── busca ───────────────────────────────────────────────────────────────────────────────

export async function search(params: SearchParams): Promise<SearchResult> {
  const offset = decodeCursor(params.cursor);
  const origin = params.lat != null && params.lng != null ? { lat: params.lat, lng: params.lng } : null;
  const trgm = await hasSearchExtensions();
  const scope = await storeScope(origin, !!params.openNow);
  if (scope.ids.length === 0) return { items: [], nextCursor: null };

  const ids = params.type === 'stores'
    ? await searchStoreIds(params, scope, trgm, offset)
    : await searchProductIds(params, scope, trgm, offset);

  const hasMore = ids.length > params.limit;
  const pageIds = hasMore ? ids.slice(0, params.limit) : ids;
  const nextOffset = offset + params.limit;
  const nextCursor = hasMore && nextOffset <= MAX_OFFSET ? encodeCursor(nextOffset) : null;

  const items = params.type === 'stores'
    ? await hydrateStores(pageIds, origin ? scope.distById : null)
    : await hydrateProducts(pageIds);
  return { items, nextCursor };
}

async function searchProductIds(params: SearchParams, scope: StoreScope, trgm: boolean, offset: number): Promise<string[]> {
  const { match, relevance } = termSql('p."name"', params.q, trgm);
  const conds: Prisma.Sql[] = [match];
  if (params.minPrice != null) conds.push(Prisma.sql`p."price" >= ${params.minPrice}`);
  if (params.maxPrice != null) conds.push(Prisma.sql`p."price" <= ${params.maxPrice}`);
  let categoryJoin = Prisma.empty;
  if (params.categoryName) {
    categoryJoin = Prisma.sql`JOIN "Category" c ON c."id" = p."categoryId"`;
    conds.push(Prisma.sql`${normCol('c."name"', trgm)} = ${normTerm(params.categoryName, trgm)}`);
  }

  const tie = Prisma.sql`p."createdAt" DESC, p."id" DESC`;
  // Whitelist fechada: `sort` só escolhe entre estes fragmentos.
  const ORDER: Record<SearchSort, Prisma.Sql> = {
    relevance: Prisma.sql`${relevance} DESC, ${tie}`,
    price_asc: Prisma.sql`p."price" ASC, ${tie}`,
    price_desc: Prisma.sql`p."price" DESC, ${tie}`,
    distance: Prisma.sql`${DIST_ORDER}, ${relevance} DESC, ${tie}`,
  };
  const orderBy = ORDER[params.sort] ?? ORDER.relevance;

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p."id" FROM "Product" p
    ${scopeJoin(scope, 'p."storeId"')}
    ${categoryJoin}
    WHERE ${Prisma.join(conds, ' AND ')}
    ORDER BY ${orderBy}
    LIMIT ${params.limit + 1} OFFSET ${offset}`;
  return rows.map((r) => r.id);
}

async function searchStoreIds(params: SearchParams, scope: StoreScope, trgm: boolean, offset: number): Promise<string[]> {
  const { match, relevance } = termSql('s."name"', params.q, trgm);
  const tie = Prisma.sql`s."createdAt" DESC, s."id" DESC`;
  // Loja não tem preço: price_* cai na relevância.
  const orderBy = params.sort === 'distance'
    ? Prisma.sql`${DIST_ORDER}, ${relevance} DESC, ${tie}`
    : Prisma.sql`${relevance} DESC, ${tie}`;

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT s."id" FROM "Store" s
    ${scopeJoin(scope, 's."id"')}
    WHERE ${match}
    ORDER BY ${orderBy}
    LIMIT ${params.limit + 1} OFFSET ${offset}`;
  return rows.map((r) => r.id);
}

export function discountPercent(price: number, oldPrice: number | null | undefined): number {
  if (oldPrice == null || !(oldPrice > price) || !(price >= 0)) return 0;
  return Math.round((1 - price / oldPrice) * 100);
}

function inOrder<T extends { id: string }>(ids: string[], rows: T[]): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is T => !!r);
}

async function hydrateProducts(ids: string[]): Promise<any[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.product.findMany({
    where: { id: { in: ids } },
    include: { category: { select: { name: true } }, store: { select: { name: true } } },
  });
  return inOrder(ids, rows).map((row) => {
    const { store, ...rest } = row;
    const api = toApiProduct(rest);
    return { ...api, storeName: store?.name ?? null, discountPercent: discountPercent(api.price, api.oldPrice) };
  });
}

async function hydrateStores(ids: string[], distById: Map<string, number | null> | null): Promise<any[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.store.findMany({ where: { id: { in: ids } } });
  return inOrder(ids, rows).map((s) => {
    const pub = toPublicStore(s);
    const km = distById?.get(s.id);
    return km != null ? { ...pub, distanceKm: km } : pub;
  });
}

// ── sugestões ───────────────────────────────────────────────────────────────────────────

export interface Suggestions {
  products: { id: string; name: string; image: string | null; price: number; oldPrice: number | null; storeId: string }[];
  stores: { id: string; name: string; slug: string }[];
  categories: string[];
}

/** Store não tem slug no schema: derivado do nome (sem acento, minúsculo, hífens). */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function suggest(q: string): Promise<Suggestions> {
  const trgm = await hasSearchExtensions();
  const scope = await storeScope(null, false);
  if (scope.ids.length === 0) return { products: [], stores: [], categories: [] };

  const prod = termSql('p."name"', q, trgm);
  const store = termSql('s."name"', q, trgm);
  const cat = termSql('c."name"', q, trgm);

  const [products, stores, categories] = await Promise.all([
    prisma.$queryRaw<{ id: string; name: string; image: string | null; price: any; oldPrice: any; storeId: string }[]>`
      SELECT p."id", p."name", p."image", p."price", p."oldPrice", p."storeId" FROM "Product" p
      ${scopeJoin(scope, 'p."storeId"')}
      WHERE ${prod.match}
      ORDER BY ${prod.relevance} DESC, p."createdAt" DESC, p."id" DESC
      LIMIT 5`,
    prisma.$queryRaw<{ id: string; name: string }[]>`
      SELECT s."id", s."name" FROM "Store" s
      ${scopeJoin(scope, 's."id"')}
      WHERE ${store.match}
      ORDER BY ${store.relevance} DESC, s."createdAt" DESC, s."id" DESC
      LIMIT 3`,
    // Nome distinto (sem diferenciar acento/maiúscula): a mesma categoria em várias lojas conta uma vez.
    prisma.$queryRaw<{ name: string }[]>`
      SELECT min(c."name") AS "name" FROM "Category" c
      ${scopeJoin(scope, 'c."storeId"')}
      WHERE ${cat.match}
      GROUP BY ${normCol('c."name"', trgm)}
      ORDER BY max(${cat.relevance}) DESC, min(c."name") ASC
      LIMIT 5`,
  ]);

  return {
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      image: p.image ?? null,
      price: Number(p.price),
      oldPrice: p.oldPrice != null ? Number(p.oldPrice) : null,
      storeId: p.storeId,
    })),
    stores: stores.map((s) => ({ id: s.id, name: s.name, slug: slugify(s.name) })),
    categories: categories.map((c) => c.name),
  };
}
