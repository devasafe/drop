import { Prisma, Store, User } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { MoneyActionError } from './adminMoneyAction.service';

/**
 * D3b-3 · spec 4.4 — decisão do admin sobre UM item de verificação, sem perder decisões
 * simultâneas de outros itens. Numa transação: trava a linha (SELECT … FOR UPDATE), relê o
 * JSON, confere que o item está `pending` e grava só aquele item (jsonb_set). Não pendente →
 * 409 VERIFICATION_NOT_PENDING {currentStatus}. Verificação não é dinheiro: sem AdminMoneyAction.
 */

export type UserVerificationItem = 'document' | 'facial' | 'courier';
export type StoreVerificationItem = 'cnpj' | 'address';

export interface VerificationDecisionInput {
  approved: boolean;
  reviewerId: string;
  /** Gravado só na recusa. */
  rejectionReason?: string;
}

export type DecidedItem = Record<string, unknown> & { status: 'approved' | 'rejected' };

const NOT_PENDING_MESSAGE: Record<UserVerificationItem | StoreVerificationItem, string> = {
  document: 'Documento não está pendente',
  facial: 'Facial não está pendente',
  courier: 'Dados não estão pendentes',
  cnpj: 'cnpj não está pendente',
  address: 'address não está pendente',
};

function itemOf(json: unknown, item: string): Record<string, unknown> {
  const root = json && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
  const value = root[item];
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : { status: 'none' };
}

function assertPending(current: Record<string, unknown>, item: UserVerificationItem | StoreVerificationItem): void {
  if (current.status !== 'pending') {
    throw new MoneyActionError(409, 'VERIFICATION_NOT_PENDING', NOT_PENDING_MESSAGE[item], {
      currentStatus: typeof current.status === 'string' ? current.status : 'none',
    });
  }
}

function decide(current: Record<string, unknown>, d: VerificationDecisionInput): DecidedItem {
  const { rejectionReason: _previous, ...rest } = current;
  void _previous;
  return {
    ...rest,
    status: d.approved ? 'approved' : 'rejected',
    reviewedBy: d.reviewerId,
    reviewedAt: new Date().toISOString(),
    ...(d.approved ? {} : { rejectionReason: d.rejectionReason }),
  } as DecidedItem;
}

export async function decideUserVerificationItem(
  userId: string,
  item: UserVerificationItem,
  d: VerificationDecisionInput,
  extra?: (user: User, decided: DecidedItem) => Prisma.UserUpdateInput,
): Promise<{ found: false } | { found: true; user: User; item: DecidedItem }> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    if (locked.length === 0) return { found: false as const };
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const current = itemOf(user.verification, item);
    assertPending(current, item);
    const decided = decide(current, d);
    await tx.$executeRaw`
      UPDATE "User"
         SET verification = jsonb_set(COALESCE(verification, '{}'::jsonb), ARRAY[${item}]::text[], ${JSON.stringify(decided)}::jsonb, true),
             "updatedAt" = NOW()
       WHERE id = ${userId}`;
    const extraData = extra?.(user, decided);
    const saved = extraData && Object.keys(extraData).length > 0
      ? await tx.user.update({ where: { id: userId }, data: extraData })
      : await tx.user.findUniqueOrThrow({ where: { id: userId } });
    return { found: true as const, user: saved, item: decided };
  });
}

export async function decideStoreVerificationItem(
  storeId: string,
  item: StoreVerificationItem,
  d: VerificationDecisionInput,
): Promise<{ found: false } | { found: true; store: Store; item: DecidedItem }> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Store" WHERE id = ${storeId} FOR UPDATE`;
    if (locked.length === 0) return { found: false as const };
    const store = await tx.store.findUniqueOrThrow({ where: { id: storeId } });
    const current = itemOf(store.verification, item);
    assertPending(current, item);
    const decided = decide(current, d);
    await tx.$executeRaw`
      UPDATE "Store"
         SET verification = jsonb_set(COALESCE(verification, '{}'::jsonb), ARRAY[${item}]::text[], ${JSON.stringify(decided)}::jsonb, true),
             "updatedAt" = NOW()
       WHERE id = ${storeId}`;
    const saved = await tx.store.findUniqueOrThrow({ where: { id: storeId } });
    return { found: true as const, store: saved, item: decided };
  });
}
