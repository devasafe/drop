// Repositório de chat (Conversation + Message) em Prisma/Postgres.
//
// Detalhes de fronteira importantes:
//  - `participant1`/`participant2` são colunas JSON; filtrar por `participant.userId`
//    usa o filtro de path do Prisma ({ path: ['userId'], equals }). Os ids agora são
//    cuid (string), não ObjectId.
//  - `deletedBy` é String[]: exclusão por `NOT: { deletedBy: { has: userId } }`.
//  - arrays (`unreadCount`, `isBlocked`, `isMuted`) são gravados inteiros no update.
import { prisma } from '../lib/prisma';

export function toApiConversation(c: any): any {
  if (!c) return c;
  return { ...c, _id: c.id };
}

export function toApiMessage(m: any): any {
  if (!m) return m;
  return { ...m, _id: m.id };
}

// Filtro JSON-path: participant<field>.userId === userId
const partUserIs = (field: 'participant1' | 'participant2', userId: string) =>
  ({ [field]: { path: ['userId'], equals: String(userId) } } as any);

const eitherParticipant = (userId: string) =>
  ({ OR: [partUserIs('participant1', userId), partUserIs('participant2', userId)] } as any);

const bothDirections = (a: string, b: string) =>
  ({
    OR: [
      { AND: [partUserIs('participant1', a), partUserIs('participant2', b)] },
      { AND: [partUserIs('participant1', b), partUserIs('participant2', a)] },
    ],
  } as any);

// ─── Conversation ──────────────────────────────────────────────────────
export async function findConversationById(id: string): Promise<any | null> {
  const c = await prisma.conversation.findUnique({ where: { id: String(id) } });
  return toApiConversation(c);
}

export async function createConversation(data: Record<string, any>): Promise<any> {
  const c = await prisma.conversation.create({ data: data as any });
  return toApiConversation(c);
}

export async function updateConversation(id: string, data: Record<string, any>): Promise<any> {
  const c = await prisma.conversation.update({ where: { id: String(id) }, data });
  return toApiConversation(c);
}

export async function deleteConversationById(id: string): Promise<void> {
  await prisma.conversation.delete({ where: { id: String(id) } }).catch(() => null);
}

/** Busca conversa existente entre dois usuários (ambas as direções), por tipo. */
export async function findConversationBetween(opts: {
  type: string;
  a: string;
  b: string;
  productId?: string;
  conversationType?: string;
}): Promise<any | null> {
  const where: any = { type: opts.type as any, ...bothDirections(opts.a, opts.b) };
  if (opts.productId) where.productId = String(opts.productId);
  if (opts.conversationType) where.conversationType = opts.conversationType as any;
  const c = await prisma.conversation.findFirst({ where });
  return toApiConversation(c);
}

function forUserWhere(userId: string, extra: any = {}): any {
  return { AND: [eitherParticipant(userId), { NOT: { deletedBy: { has: String(userId) } } }, extra] };
}

export async function listConversationsForUser(
  userId: string,
  opts: { skip: number; limit: number },
): Promise<any[]> {
  const list = await prisma.conversation.findMany({
    where: forUserWhere(userId, { type: { not: 'suporte' } }),
    orderBy: { lastMessageAt: 'desc' },
    skip: opts.skip,
    take: opts.limit,
  });
  return list.map(toApiConversation);
}

export async function countConversationsForUser(userId: string): Promise<number> {
  return prisma.conversation.count({ where: forUserWhere(userId) });
}

export async function listPrePurchaseForUser(
  userId: string,
  opts: { conversationType?: string; skip: number; limit: number },
): Promise<any[]> {
  const extra: any = { type: 'loja_cliente_pre_compra' };
  if (opts.conversationType) extra.conversationType = opts.conversationType as any;
  const list = await prisma.conversation.findMany({
    where: forUserWhere(userId, extra),
    orderBy: { lastMessageAt: 'desc' },
    skip: opts.skip,
    take: opts.limit,
  });
  return list.map(toApiConversation);
}

export async function countPrePurchaseForUser(userId: string, conversationType?: string): Promise<number> {
  const extra: any = { type: 'loja_cliente_pre_compra' };
  if (conversationType) extra.conversationType = conversationType as any;
  return prisma.conversation.count({ where: forUserWhere(userId, extra) });
}

/** Listagem admin com filtros opcionais (type/status/busca por nome de participante). */
export async function listAllConversationsAdmin(opts: {
  type?: string;
  status?: string;
  search?: string;
  skip: number;
  limit: number;
}): Promise<{ conversations: any[]; total: number }> {
  const where: any = {};
  if (opts.type) where.type = opts.type as any;
  if (opts.status) where.supportStatus = opts.status as any;
  if (opts.search) {
    where.OR = [
      { participant1: { path: ['name'], string_contains: opts.search } },
      { participant2: { path: ['name'], string_contains: opts.search } },
    ];
  }
  const [rows, total] = await Promise.all([
    prisma.conversation.findMany({ where, orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }], skip: opts.skip, take: opts.limit }),
    prisma.conversation.count({ where }),
  ]);
  return { conversations: rows.map(toApiConversation), total };
}

// ─── Message ───────────────────────────────────────────────────────────
export async function createMessage(data: Record<string, any>): Promise<any> {
  const m = await prisma.message.create({ data: data as any });
  return toApiMessage(m);
}

export async function findMessages(
  conversationId: string,
  opts: { skip?: number; limit?: number; order?: 'asc' | 'desc' },
): Promise<any[]> {
  const list = await prisma.message.findMany({
    where: { conversationId: String(conversationId) },
    orderBy: { createdAt: opts.order ?? 'desc' },
    skip: opts.skip,
    take: opts.limit,
  });
  return list.map(toApiMessage);
}

export async function lastMessage(conversationId: string): Promise<any | null> {
  const m = await prisma.message.findFirst({
    where: { conversationId: String(conversationId) },
    orderBy: { createdAt: 'desc' },
  });
  return toApiMessage(m);
}

export async function countMessages(conversationId: string): Promise<number> {
  return prisma.message.count({ where: { conversationId: String(conversationId) } });
}

/** Marca como lidas as mensagens do OUTRO usuário ainda não lidas. Retorna qtde. */
export async function markIncomingMessagesRead(conversationId: string, exceptSenderId: string): Promise<number> {
  const r = await prisma.message.updateMany({
    where: {
      conversationId: String(conversationId),
      senderId: { not: String(exceptSenderId) },
      status: { in: ['sent', 'delivered'] },
    },
    data: { status: 'read', readAt: new Date() },
  });
  return r.count;
}

export async function markMessagesReadByIds(ids: string[], conversationId: string): Promise<number> {
  if (!ids?.length) return 0;
  const r = await prisma.message.updateMany({
    where: { id: { in: ids.map(String) }, conversationId: String(conversationId) },
    data: { status: 'read', readAt: new Date() },
  });
  return r.count;
}

export async function deleteMessagesByConversation(conversationId: string): Promise<number> {
  const r = await prisma.message.deleteMany({ where: { conversationId: String(conversationId) } });
  return r.count;
}
