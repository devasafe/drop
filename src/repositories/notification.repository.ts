// Repositório de Notification em Prisma/Postgres. Reexpõe `_id`.
import { prisma } from '../lib/prisma';

export function toApiNotif(n: any): any {
  if (!n) return n;
  return { ...n, _id: n.id };
}

export async function insertNotifications(docs: Array<Record<string, any>>): Promise<number> {
  if (!docs.length) return 0;
  const r = await prisma.notification.createMany({ data: docs as any });
  return r.count;
}

export async function deleteNotificationsByBroadcast(broadcastId: string): Promise<number> {
  const r = await prisma.notification.deleteMany({ where: { broadcastId: String(broadcastId) } });
  return r.count;
}

export async function findNotificationsByUser(userId: string, limit = 100): Promise<any[]> {
  const list = await prisma.notification.findMany({
    where: { userId: String(userId) },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return list.map(toApiNotif);
}

/** Marca uma notificação como lida (só se pertencer ao usuário). Retorna true se afetou. */
export async function markNotificationReadForUser(id: string, userId: string): Promise<boolean> {
  const r = await prisma.notification.updateMany({
    where: { id: String(id), userId: String(userId) },
    data: { read: true },
  });
  return r.count > 0;
}

/** Deleta uma notificação do usuário. Retorna true se afetou. */
export async function deleteNotificationForUser(id: string, userId: string): Promise<boolean> {
  const r = await prisma.notification.deleteMany({ where: { id: String(id), userId: String(userId) } });
  return r.count > 0;
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const r = await prisma.notification.updateMany({
    where: { userId: String(userId), read: false },
    data: { read: true },
  });
  return r.count;
}
