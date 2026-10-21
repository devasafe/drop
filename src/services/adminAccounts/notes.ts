import { prisma } from '../../lib/prisma';
import { recordAccountAction, toTimelineItems, AccountActor, TimelineItem } from './actions';
import { parseNoteText, storeNotFound, userNotFound } from './errors';

/**
 * D3b-2a · nota interna (spec 3 e 6): só acréscimo, sem editar nem apagar; autor e data; só a
 * equipe vê. O texto fica em `reason` da linha `note` (a linha do tempo mostra `reason`).
 */

export async function addUserNote(userId: string, actor: AccountActor, rawText: unknown): Promise<{ item: TimelineItem }> {
  const text = parseNoteText(rawText);
  const row = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw userNotFound();
    return recordAccountAction(tx, { actor, userId, type: 'note', reason: text });
  });
  const [item] = await toTimelineItems([row]);
  return { item };
}

export async function addStoreNote(storeId: string, actor: AccountActor, rawText: unknown): Promise<{ item: TimelineItem }> {
  const text = parseNoteText(rawText);
  const row = await prisma.$transaction(async (tx) => {
    const store = await tx.store.findUnique({ where: { id: storeId }, select: { id: true } });
    if (!store) throw storeNotFound();
    return recordAccountAction(tx, { actor, storeId, type: 'note', reason: text });
  });
  const [item] = await toTimelineItems([row]);
  return { item };
}
