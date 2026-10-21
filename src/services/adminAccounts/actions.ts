import { Prisma, AdminAccountAction, AdminAccountActionType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/AppError';
import { parseCursorPage, sliceCursorPage } from '../../utils/cursorPagination';
import { AccountActionError, NOTE_MAX } from './errors';

/**
 * D3b-2a · histórico das contas (spec 5.1): ações do admin e notas internas sobre UMA pessoa ou
 * UMA loja. Este é o ÚNICO lugar que cria AdminAccountAction. A linha vai na MESMA transação da
 * ação (o `tx` de quem chama): se a ação falha, nada fica gravado.
 */

export { AdminAccountActionType };

/** Autor: o `actorFromRequest` da D3b-3, ou `{ id: 'system', role: 'system' }` para job. */
export interface AccountActor {
  id: string;
  role: string;
}

export interface RecordAccountActionInput {
  actor: AccountActor;
  userId?: string | null;
  storeId?: string | null;
  type: AdminAccountActionType;
  reason?: string | null;
  meta?: Prisma.InputJsonValue | null;
}

export async function recordAccountAction(
  tx: Prisma.TransactionClient,
  input: RecordAccountActionInput,
): Promise<AdminAccountAction> {
  const actorId = String(input.actor?.id ?? '').trim();
  if (!actorId) throw new Error('recordAccountAction: ação sem autor (actor.id vazio)');
  const userId = input.userId ? String(input.userId) : null;
  const storeId = input.storeId ? String(input.storeId) : null;
  if ((userId === null) === (storeId === null)) {
    throw new Error('recordAccountAction: informe exatamente um alvo (userId ou storeId)');
  }
  // Motivo e nota já chegam validados (errors.ts); aqui só o trim e o teto da nota, por defesa.
  const reason = input.reason == null ? null : String(input.reason).trim().slice(0, NOTE_MAX) || null;

  return tx.adminAccountAction.create({
    data: {
      actorId,
      actorRole: String(input.actor.role ?? '').trim() || 'desconhecido',
      userId,
      storeId,
      type: input.type,
      reason,
      meta: input.meta ?? undefined,
    },
  });
}

export interface TimelineItem {
  id: string;
  type: AdminAccountActionType;
  reason: string | null;
  meta: Prisma.JsonValue | null;
  createdAt: string;
  actor: { id: string; name: string | null; role: string };
}

export const TIMELINE_PAGE_SIZE = 50;
export const TIMELINE_MAX_LIMIT = 100;

/** Linhas → itens da linha do tempo, com o nome do autor (null para 'system' ou conta apagada). */
export async function toTimelineItems(rows: AdminAccountAction[]): Promise<TimelineItem[]> {
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((id) => id !== 'system'))];
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(actors.map((a) => [a.id, a.name]));
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    reason: r.reason,
    meta: r.meta ?? null,
    createdAt: r.createdAt.toISOString(),
    actor: { id: r.actorId, name: nameById.get(r.actorId) ?? null, role: r.actorRole },
  }));
}

export interface ListTimelineInput {
  userId?: string;
  storeId?: string;
  cursor?: string;
  limit?: number;
}

/** Linha do tempo de UMA pessoa ou UMA loja: a mais nova primeiro, cursor estável no empate de data. */
export async function listTimeline(input: ListTimelineInput): Promise<{ items: TimelineItem[]; nextCursor: string | null }> {
  const userId = input.userId ? String(input.userId) : null;
  const storeId = input.storeId ? String(input.storeId) : null;
  if ((userId === null) === (storeId === null)) {
    throw new Error('listTimeline: informe exatamente um alvo (userId ou storeId)');
  }

  let page: ReturnType<typeof parseCursorPage>;
  try {
    page = parseCursorPage(
      { cursor: input.cursor, limit: input.limit },
      { defaultLimit: TIMELINE_PAGE_SIZE, maxLimit: TIMELINE_MAX_LIMIT },
    );
  } catch (err) {
    if (err instanceof AppError && err.code === 'INVALID_CURSOR') {
      throw new AccountActionError(400, 'INVALID_CURSOR', 'Cursor inválido');
    }
    throw err;
  }

  const target: Prisma.AdminAccountActionWhereInput = userId ? { userId } : { storeId: storeId as string };
  const rows = await prisma.adminAccountAction.findMany({
    where: { AND: [target, page.where as Prisma.AdminAccountActionWhereInput] },
    orderBy: page.orderBy as Prisma.AdminAccountActionOrderByWithRelationInput[],
    take: page.take,
  });
  const { items, nextCursor } = sliceCursorPage(rows, page);
  return { items: await toTimelineItems(items), nextCursor };
}
