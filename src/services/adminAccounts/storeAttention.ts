/**
 * D3b-4b · "precisa de atenção" gravado na loja (spec 8). A regra é a da lista da D3b-2a: pausa do admin,
 * recebimento com problema, ou cancelamento acima de 10% em 30 dias com ao menos 5 pedidos.
 *
 * computeStoreAttention recalcula uma loja, grava `needsAttention` e `attentionCheckedAt` e devolve o valor
 * novo. A gravação é SQL direto para não mexer em `Store.updatedAt` (recalcular não é editar a loja).
 * Quem chama: a pausa e a liberação pelo admin (na mesma transação), a mudança do recebimento
 * (refreshStoreAttention, que não derruba quem chamou) e o job storeAttention a cada 10 min.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import env from '../../config/env';
import logger from '../../config/logger';
import { getSaasConfig } from '../../utils/settlement';
import { CANCELLED_ORDER_STATUSES } from '../adminOps/common';
import { RECEIVING_SELECT, receivingStatus } from './storeStatus';
import type { ReceivingStatus } from './types';

export const CANCEL_RATE_MIN_ORDERS = 5;
export const CANCEL_RATE_ATTENTION = 0.1;
export const ATTENTION_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

type Db = Prisma.TransactionClient | typeof prisma;

export interface CancelTotals {
  orders: number;
  cancelled: number;
}

/** Pedidos e cancelados (cancelado ou rejeitado) dos últimos 30 dias, só das lojas pedidas: um groupBy. */
export async function cancelTotals30d(storeIds: string[], now: Date, db: Db = prisma): Promise<Map<string, CancelTotals>> {
  const totals = new Map<string, CancelTotals>();
  if (storeIds.length === 0) return totals;
  const counts = await db.order.groupBy({
    by: ['storeId', 'status'],
    where: { storeId: { in: storeIds }, createdAt: { gte: new Date(now.getTime() - ATTENTION_WINDOW_DAYS * DAY_MS) } },
    _count: { _all: true },
  });
  for (const c of counts) {
    const t = totals.get(c.storeId) ?? { orders: 0, cancelled: 0 };
    t.orders += c._count._all;
    if ((CANCELLED_ORDER_STATUSES as string[]).includes(c.status)) t.cancelled += c._count._all;
    totals.set(c.storeId, t);
  }
  return totals;
}

/** Cancelados ÷ pedidos; null com menos de 5 pedidos. */
export function cancelRateOf(t: CancelTotals | undefined): number | null {
  return t && t.orders >= CANCEL_RATE_MIN_ORDERS ? t.cancelled / t.orders : null;
}

export function attentionOf(input: { adminPausedAt: Date | null; receiving: ReceivingStatus; cancelRate: number | null }): boolean {
  return input.adminPausedAt != null
    || input.receiving === 'problem'
    || (input.cancelRate !== null && input.cancelRate > CANCEL_RATE_ATTENTION);
}

/** Recalcula e grava a atenção da loja. Com `tx`, lê e grava dentro da transação de quem chamou. */
export async function computeStoreAttention(
  storeId: string,
  tx?: Prisma.TransactionClient,
  now: Date = new Date(),
): Promise<boolean> {
  const db: Db = tx ?? prisma;
  const store = await db.store.findUnique({
    where: { id: storeId },
    select: { id: true, adminPausedAt: true, ...RECEIVING_SELECT },
  });
  if (!store) return false;
  const cfg = await getSaasConfig();
  const totals = await cancelTotals30d([storeId], now, db);
  const value = attentionOf({
    adminPausedAt: store.adminPausedAt,
    receiving: receivingStatus(cfg.settlementMode, env.PAYMENT_GATEWAY, store),
    cancelRate: cancelRateOf(totals.get(storeId)),
  });
  await db.$executeRaw`UPDATE "Store" SET "needsAttention" = ${value}, "attentionCheckedAt" = ${now} WHERE "id" = ${storeId}`;
  return value;
}

/**
 * Gatilho depois de gravar o recebimento: recalcula sem derrubar quem chamou. O recebimento já está
 * gravado; se o recálculo falhar, o job corrige na próxima rodada.
 */
export async function refreshStoreAttention(storeId: string): Promise<void> {
  try {
    await computeStoreAttention(storeId);
  } catch (err) {
    logger.error('[store-attention] falha ao recalcular a atenção da loja', err as Error, { storeId });
  }
}

/** Troca do modo de liquidação: o recebimento de todas muda; o job recalcula as nunca calculadas. */
export async function markAllStoresForAttentionRecheck(): Promise<number> {
  return prisma.$executeRaw`UPDATE "Store" SET "attentionCheckedAt" = NULL`;
}
