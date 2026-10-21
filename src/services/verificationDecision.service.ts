import { AdminAccountAction, Prisma, Store, User } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { MoneyActionError } from './adminMoneyAction.service';
import { AccountActor, recordAccountAction } from './adminAccounts/actions';
import type { ParsedReject, VerificationRejectReason } from './verification/rejectReasons';

/**
 * D3b-3 · spec 4.4 — decisão do admin sobre UM item de verificação, sem perder decisões
 * simultâneas de outros itens. Numa transação: trava a linha (SELECT … FOR UPDATE), relê o
 * JSON, confere que o item está `pending` e grava só aquele item (jsonb_set). Não pendente →
 * 409 VERIFICATION_NOT_PENDING {currentStatus}.
 *
 * D3b-2b (ruling 1): toda decisão grava UMA linha `verification_decision` em AdminAccountAction,
 * na mesma transação (alvo userId para document/facial/courier, storeId para cnpj/address). A
 * linha alimenta a linha do tempo das fichas e a média de espera. As peças (itemOf, decide,
 * metaItemOf, lock*, write*, recordVerificationDecision) são reaproveitadas pelo aprovar tudo.
 */

export type UserVerificationItem = 'document' | 'facial' | 'courier';
export type StoreVerificationItem = 'cnpj' | 'address';
export type VerificationKind = UserVerificationItem | StoreVerificationItem;

const USER_ITEMS: readonly VerificationKind[] = ['document', 'facial', 'courier'];
export const isUserItem = (k: VerificationKind): k is UserVerificationItem => USER_ITEMS.includes(k);

export interface VerificationDecisionInput {
  approved: boolean;
  /** Autor: actorFromRequest(req). */
  reviewer: AccountActor;
  /** Só na recusa: o corpo já validado por parseRejectBody. */
  rejection?: ParsedReject;
}

export type DecidedItem = Record<string, unknown> & { status: 'approved' | 'rejected' };

export type DecisionSubjectKind = 'user' | 'store' | 'client' | 'motoboy';
export interface DecisionMetaItem {
  kind: VerificationKind;
  userId?: string;
  storeId?: string;
  submittedAt: string | null;
  reasonCode?: VerificationRejectReason;
  resend?: boolean;
}
export interface VerificationDecisionMeta {
  decision: 'approve' | 'reject';
  subject: { kind: DecisionSubjectKind; id: string };
  items: DecisionMetaItem[];
}

const NOT_PENDING_MESSAGE: Record<VerificationKind, string> = {
  document: 'Documento não está pendente',
  facial: 'Facial não está pendente',
  courier: 'Dados não estão pendentes',
  cnpj: 'cnpj não está pendente',
  address: 'address não está pendente',
};

/** Campos de uma decisão anterior: saem do item em toda decisão nova. */
const DECISION_FIELDS = ['rejectionReason', 'reasonCode', 'rejectionMessage', 'resendRequested'] as const;

export function itemOf(json: unknown, item: string): Record<string, unknown> {
  const root = json && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
  const value = root[item];
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : { status: 'none' };
}

function assertPending(current: Record<string, unknown>, item: VerificationKind): void {
  if (current.status !== 'pending') {
    throw new MoneyActionError(409, 'VERIFICATION_NOT_PENDING', NOT_PENDING_MESSAGE[item], {
      currentStatus: typeof current.status === 'string' ? current.status : 'none',
    });
  }
}

/** submittedAt do item em ISO, ou null (ausente ou inválido). */
export function submittedAtOf(current: Record<string, unknown>): string | null {
  const raw = current.submittedAt;
  if (typeof raw !== 'string' && !(raw instanceof Date)) return null;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function decide(current: Record<string, unknown>, d: VerificationDecisionInput): DecidedItem {
  const rest: Record<string, unknown> = { ...current };
  for (const f of DECISION_FIELDS) delete rest[f];
  const base = {
    ...rest,
    status: d.approved ? 'approved' : 'rejected',
    reviewedBy: d.reviewer.id,
    reviewedAt: new Date().toISOString(),
  } as DecidedItem;
  if (d.approved) return base;
  if (!d.rejection) throw new Error('decide: recusa sem o corpo validado (parseRejectBody)');
  return {
    ...base,
    reasonCode: d.rejection.reasonCode,
    rejectionMessage: d.rejection.message,
    resendRequested: d.rejection.resend,
    rejectionReason: d.rejection.text,
  };
}

export function metaItemOf(
  kind: VerificationKind,
  targetId: string,
  current: Record<string, unknown>,
  d: VerificationDecisionInput,
): DecisionMetaItem {
  const item: DecisionMetaItem = {
    kind,
    ...(isUserItem(kind) ? { userId: targetId } : { storeId: targetId }),
    submittedAt: submittedAtOf(current),
  };
  if (!d.approved && d.rejection) {
    item.reasonCode = d.rejection.reasonCode;
    item.resend = d.rejection.resend;
  }
  return item;
}

export async function lockUser(tx: Prisma.TransactionClient, userId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
  return rows.length > 0;
}

export async function lockStore(tx: Prisma.TransactionClient, storeId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Store" WHERE id = ${storeId} FOR UPDATE`;
  return rows.length > 0;
}

export async function writeUserItem(
  tx: Prisma.TransactionClient, userId: string, item: UserVerificationItem, decided: DecidedItem,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "User"
       SET verification = jsonb_set(COALESCE(verification, '{}'::jsonb), ARRAY[${item}]::text[], ${JSON.stringify(decided)}::jsonb, true),
           "updatedAt" = NOW()
     WHERE id = ${userId}`;
}

export async function writeStoreItem(
  tx: Prisma.TransactionClient, storeId: string, item: StoreVerificationItem, decided: DecidedItem,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "Store"
       SET verification = jsonb_set(COALESCE(verification, '{}'::jsonb), ARRAY[${item}]::text[], ${JSON.stringify(decided)}::jsonb, true),
           "updatedAt" = NOW()
     WHERE id = ${storeId}`;
}

export function recordVerificationDecision(
  tx: Prisma.TransactionClient,
  actor: AccountActor,
  target: { userId: string } | { storeId: string },
  meta: VerificationDecisionMeta,
  reason: string | null,
): Promise<AdminAccountAction> {
  return recordAccountAction(tx, {
    actor,
    ...target,
    type: 'verification_decision',
    reason,
    meta: meta as unknown as Prisma.InputJsonObject,
  });
}

const rowReason = (d: VerificationDecisionInput, decided: DecidedItem): string | null =>
  d.approved ? null : String(decided.rejectionReason);

export async function decideUserVerificationItem(
  userId: string,
  item: UserVerificationItem,
  d: VerificationDecisionInput,
  extra?: (user: User, decided: DecidedItem) => Prisma.UserUpdateInput,
): Promise<{ found: false } | { found: true; user: User; item: DecidedItem }> {
  return prisma.$transaction(async (tx) => {
    if (!(await lockUser(tx, userId))) return { found: false as const };
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const current = itemOf(user.verification, item);
    assertPending(current, item);
    const decided = decide(current, d);
    await writeUserItem(tx, userId, item, decided);
    const extraData = extra?.(user, decided);
    const saved = extraData && Object.keys(extraData).length > 0
      ? await tx.user.update({ where: { id: userId }, data: extraData })
      : await tx.user.findUniqueOrThrow({ where: { id: userId } });
    await recordVerificationDecision(tx, d.reviewer, { userId }, {
      decision: d.approved ? 'approve' : 'reject',
      subject: { kind: 'user', id: userId },
      items: [metaItemOf(item, userId, current, d)],
    }, rowReason(d, decided));
    return { found: true as const, user: saved, item: decided };
  });
}

export async function decideStoreVerificationItem(
  storeId: string,
  item: StoreVerificationItem,
  d: VerificationDecisionInput,
): Promise<{ found: false } | { found: true; store: Store; item: DecidedItem }> {
  return prisma.$transaction(async (tx) => {
    if (!(await lockStore(tx, storeId))) return { found: false as const };
    const store = await tx.store.findUniqueOrThrow({ where: { id: storeId } });
    const current = itemOf(store.verification, item);
    assertPending(current, item);
    const decided = decide(current, d);
    await writeStoreItem(tx, storeId, item, decided);
    const saved = await tx.store.findUniqueOrThrow({ where: { id: storeId } });
    await recordVerificationDecision(tx, d.reviewer, { storeId }, {
      decision: d.approved ? 'approve' : 'reject',
      subject: { kind: 'store', id: storeId },
      items: [metaItemOf(item, storeId, current, d)],
    }, rowReason(d, decided));
    return { found: true as const, store: saved, item: decided };
  });
}
