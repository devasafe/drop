import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import logger from '../../config/logger';
import { MoneyActionError } from '../adminMoneyAction.service';
import { AccountActor } from '../adminAccounts/actions';
import type { PermissionCheck } from '../adminOps/common';
import { syncMotoboysRoom } from '../notifier';
import { notifyUser, STORE_LINKS } from '../storeNotify';
import {
  DecisionMetaItem, VerificationDecisionInput, VerificationKind,
  decide, isUserItem, itemOf, lockStore, lockUser, metaItemOf, recordVerificationDecision,
  writeStoreItem, writeUserItem,
} from '../verificationDecision.service';
import {
  ensureCourierSubaccountSafe, facialAvatarData, recomputeOwnerStoresSafe, recomputeStoreVerificationSafe,
} from './sideEffects';

/**
 * D3b-2b · aprovar tudo (spec 8, ruling 4). O admin manda a lista que viu; o servidor trava a loja
 * (se houver) e a pessoa, e só aprova se os pendentes AGORA forem exatamente essa lista. Senão,
 * 409 VERIFICATION_CHANGED {currentPending} e nada muda. Uma linha verification_decision e um
 * aviso só. Efeitos colaterais depois do commit, best-effort, só para o que foi aprovado.
 */

export type SubjectKind = 'client' | 'store' | 'motoboy';

/** Itens de cada tipo, na ordem canônica (a da resposta, do meta e do aviso). */
export const SUBJECT_ITEMS: Record<SubjectKind, readonly VerificationKind[]> = {
  // Cliente sem CNH: a CNH é do motoboy. Assim, o lojista sem item de loja (P3 manda `client`) que também
  // tenha CNH pendente não cai em 409 para sempre por um item que a tela dele não mostra (nota 13).
  client: ['document', 'facial'],
  motoboy: ['document', 'facial', 'courier'],
  store: ['cnpj', 'address', 'facial', 'document'],
};

export const SUBJECT_PERMISSION: Record<SubjectKind, string> = {
  client: 'verification:review_clients',
  store: 'verification:review_stores',
  motoboy: 'verification:review_motoboys',
};

/** A mesma permissão das rotas individuais de cada item. */
export const ITEM_PERMISSION: Record<VerificationKind, string> = {
  document: 'verification:review_clients',
  facial: 'verification:review_stores',
  courier: 'verification:review_motoboys',
  cnpj: 'verification:review_stores',
  address: 'verification:review_stores',
};

export const ITEM_NOTICE_LABEL: Record<VerificationKind, string> = {
  document: 'documento',
  facial: 'selfie',
  courier: 'dados de motoboy',
  cnpj: 'CNPJ',
  address: 'comprovante de endereço',
};

export const APPROVE_ALL_TITLE = 'Verificação aprovada';

const SUBJECT_LINK: Record<SubjectKind, string> = {
  client: '/verificacao',
  motoboy: '/motoboy/cadastro',
  store: STORE_LINKS.verification,
};

export interface Reviewer extends AccountActor {
  can: PermissionCheck;
}

function joinPt(list: string[]): string {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`;
}

export function approveAllMessage(items: VerificationKind[]): string {
  return `O DROP aprovou: ${joinPt(items.map((k) => ITEM_NOTICE_LABEL[k]))}.`;
}

const invalidItems = () => new MoneyActionError(400, 'INVALID_ITEMS', 'Lista de itens inválida.');

function parseItems(kind: SubjectKind, raw: unknown): VerificationKind[] {
  const allowed = SUBJECT_ITEMS[kind];
  if (!Array.isArray(raw) || raw.length === 0) throw invalidItems();
  if (raw.some((k) => typeof k !== 'string' || !(allowed as readonly string[]).includes(k))) throw invalidItems();
  if (new Set(raw).size !== raw.length) throw invalidItems();
  return allowed.filter((k) => raw.includes(k));
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((k) => b.includes(k));

export async function approveAllForSubject(
  kind: SubjectKind,
  id: string,
  items: unknown,
  reviewer: Reviewer,
): Promise<{ approved: VerificationKind[] }> {
  if (!SUBJECT_ITEMS[kind]) throw invalidItems();
  const wanted = parseItems(kind, items);

  const missing = [...new Set(wanted.map((k) => ITEM_PERMISSION[k]))].filter((p) => !reviewer.can(p));
  if (missing.length > 0) {
    throw new MoneyActionError(403, 'PERMISSION_DENIED', `Permissão negada. Você precisa de: ${missing.join(', ')}`, { missing });
  }

  const actor: AccountActor = { id: reviewer.id, role: reviewer.role };
  const d: VerificationDecisionInput = { approved: true, reviewer: actor };

  const done = await prisma.$transaction(async (tx) => {
    let userId: string;
    let storeId: string | null = null;
    // Ordem das travas: Store e depois o User dono (nota 14).
    if (kind === 'store') {
      if (!(await lockStore(tx, id))) throw new MoneyActionError(404, 'STORE_NOT_FOUND', 'Loja não encontrada');
      const owner = await tx.store.findUniqueOrThrow({ where: { id }, select: { ownerId: true } });
      storeId = id;
      userId = owner.ownerId;
    } else {
      userId = id;
    }
    if (!(await lockUser(tx, userId))) throw new MoneyActionError(404, 'USER_NOT_FOUND', 'Usuário não encontrado');

    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const store = storeId ? await tx.store.findUniqueOrThrow({ where: { id: storeId }, select: { verification: true } }) : null;
    const currentOf = (k: VerificationKind) => itemOf(isUserItem(k) ? user.verification : store?.verification, k);

    // Só os itens que este admin decide (nota 13): o documento só aparece na fila de quem tem review_clients,
    // então o gerente de lojas não "vê" o documento do dono e não pode cair em 409 por causa dele.
    const currentPending = SUBJECT_ITEMS[kind].filter(
      (k) => currentOf(k).status === 'pending' && reviewer.can(ITEM_PERMISSION[k]),
    );
    if (!sameSet(currentPending, wanted)) {
      throw new MoneyActionError(409, 'VERIFICATION_CHANGED', 'A verificação mudou desde que você abriu. Confira de novo.', { currentPending });
    }

    const metaItems: DecisionMetaItem[] = [];
    let userData: Prisma.UserUpdateInput = {};
    for (const k of wanted) {
      const current = currentOf(k);
      const decided = decide(current, d);
      if (isUserItem(k)) {
        await writeUserItem(tx, userId, k, decided);
        if (k === 'facial') userData = { ...userData, ...facialAvatarData(user, decided) };
        metaItems.push(metaItemOf(k, userId, current, d));
      } else {
        await writeStoreItem(tx, storeId as string, k, decided);
        metaItems.push(metaItemOf(k, storeId as string, current, d));
      }
    }
    if (Object.keys(userData).length > 0) await tx.user.update({ where: { id: userId }, data: userData });

    await recordVerificationDecision(
      tx,
      actor,
      storeId ? { storeId } : { userId },
      { decision: 'approve', subject: { kind, id }, items: metaItems },
      null,
    );
    return { userId, storeId };
  });

  // Depois do commit: um efeito por item aprovado, best-effort (os *Safe não lançam).
  const userItems = wanted.filter(isUserItem);
  if (userItems.includes('document') || userItems.includes('facial')) await recomputeOwnerStoresSafe(done.userId);
  if (userItems.includes('courier')) await ensureCourierSubaccountSafe(done.userId);
  if (done.storeId && wanted.some((k) => !isUserItem(k))) await recomputeStoreVerificationSafe(done.storeId);
  if (userItems.length > 0) {
    await syncMotoboysRoom(done.userId).catch((err) =>
      logger.warn('[verification] falha ao ajustar a sala motoboys', { userId: done.userId, errName: (err as Error)?.name }));
  }
  await notifyUser(done.userId, {
    title: APPROVE_ALL_TITLE,
    message: approveAllMessage(wanted),
    link: SUBJECT_LINK[kind],
    entityId: done.storeId ?? done.userId,
    type: 'system',
    tag: kind === 'store' ? 'verificacao-loja' : 'verificacao',
  });
  logger.info('[verification][AUDIT] aprovar tudo', { kind, id, by: actor.id, items: wanted });
  return { approved: wanted };
}
