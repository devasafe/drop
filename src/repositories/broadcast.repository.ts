// Repositório de Broadcast em Prisma/Postgres. Reexpõe `_id`.
import { prisma } from '../lib/prisma';

export function toApiBroadcast(b: any): any {
  if (!b) return b;
  return { ...b, _id: b.id };
}

export async function insertBroadcast(data: Record<string, any>): Promise<any> {
  const b = await prisma.broadcast.create({ data: data as any });
  return toApiBroadcast(b);
}

export async function updateBroadcastById(id: string, data: Record<string, any>): Promise<any> {
  const b = await prisma.broadcast.update({ where: { id: String(id) }, data });
  return toApiBroadcast(b);
}

export async function findBroadcastById(id: string): Promise<any | null> {
  const b = await prisma.broadcast.findUnique({ where: { id: String(id) } });
  return toApiBroadcast(b);
}

export async function removeBroadcast(id: string): Promise<void> {
  await prisma.broadcast.delete({ where: { id: String(id) } });
}

export async function countBroadcasts(): Promise<number> {
  return prisma.broadcast.count();
}

/**
 * Lista broadcasts paginados, já anexando o nome do criador (`createdBy` era
 * `.populate('createdBy','name')` no Mongoose).
 */
export async function listBroadcastsWithCreator(skip: number, limit: number): Promise<any[]> {
  const list = await prisma.broadcast.findMany({ orderBy: { sentAt: 'desc' }, skip, take: limit });
  const ids = [...new Set(list.map((b) => b.createdBy).filter(Boolean))];
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids.map(String) } }, select: { id: true, name: true } })
    : [];
  const byId = new Map(users.map((u) => [String(u.id), u]));
  return list.map((b) => ({
    ...toApiBroadcast(b),
    createdBy: b.createdBy ? { _id: b.createdBy, name: byId.get(String(b.createdBy))?.name } : null,
  }));
}
