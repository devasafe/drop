import { AppError } from './AppError';

/**
 * Paginação por cursor para listas ordenadas por `createdAt desc, id desc`.
 * O cursor é opaco (base64url de `<createdAt ISO>|<id>`) e aponta para o último item
 * da página anterior; o desempate por id garante que linhas com o mesmo createdAt
 * não se repitam nem se percam entre páginas.
 */
export interface CursorPage {
  limit: number;
  /** Filtro Prisma a combinar (AND) com o where da lista; vazio na primeira página. */
  where: Record<string, unknown>;
  orderBy: Array<Record<string, 'desc'>>;
  /** take = limit + 1: o item extra só indica que existe próxima página. */
  take: number;
}

export function encodeCursor(row: { id: string; createdAt: Date }): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`, 'utf8').toString('base64url');
}

function decodeCursor(raw: string): { createdAt: Date; id: string } {
  const invalid = () => new AppError('Cursor inválido', 400, true, 'INVALID_CURSOR');
  let text: string;
  try {
    text = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    throw invalid();
  }
  const sep = text.indexOf('|');
  if (sep <= 0) throw invalid();
  const createdAt = new Date(text.slice(0, sep));
  const id = text.slice(sep + 1);
  if (Number.isNaN(createdAt.getTime()) || !id || id.length > 64) throw invalid();
  return { createdAt, id };
}

/**
 * Lê `limit` e `cursor` da query. Sem `limit`, usa `defaultLimit` (o tamanho que a lista
 * já devolvia antes da paginação); `limit` é limitado a [1, maxLimit].
 */
export function parseCursorPage(query: any, opts: { defaultLimit: number; maxLimit: number }): CursorPage {
  const n = Number.parseInt(String(query?.limit ?? ''), 10);
  const limit = Number.isFinite(n) && n > 0 ? Math.min(n, opts.maxLimit) : opts.defaultLimit;
  const raw = typeof query?.cursor === 'string' && query.cursor ? query.cursor : null;
  let where: Record<string, unknown> = {};
  if (raw) {
    const c = decodeCursor(raw);
    where = { OR: [{ createdAt: { lt: c.createdAt } }, { createdAt: c.createdAt, id: { lt: c.id } }] };
  }
  return { limit, where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1 };
}

/** Corta o item extra e devolve a página + o cursor da próxima (null = acabou). */
export function sliceCursorPage<T extends { id: string; createdAt: Date }>(rows: T[], page: CursorPage) {
  const hasMore = rows.length > page.limit;
  const items = hasMore ? rows.slice(0, page.limit) : rows;
  return { items, nextCursor: hasMore ? encodeCursor(items[items.length - 1]) : null };
}
