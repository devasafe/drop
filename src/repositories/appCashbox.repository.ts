import { AppCashbox, Prisma, AppCashboxEntryType, AppCashboxSource } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * Acesso ao caixa da plataforma (AppCashbox) via Prisma — Fase 4, Fatia 5.
 *
 * `AppCashbox` é um singleton (uma linha). `AppCashbox.history[]` (array embutido
 * no Mongo) virou a tabela-ledger `AppCashboxEntry`. Cada movimento registra uma
 * entrada e, quando afeta o saldo, ajusta `balance`/`totalIncome`/`totalExpenses`.
 */

type Tx = Prisma.TransactionClient;

/** Retorna o caixa singleton, criando-o zerado na primeira vez. */
export async function ensureAppCashbox(db: Tx | typeof prisma = prisma): Promise<AppCashbox> {
  const existing = await db.appCashbox.findFirst();
  if (existing) return existing;
  return db.appCashbox.create({ data: {} });
}

export interface CashboxEntryInput {
  type: AppCashboxEntryType;
  source: AppCashboxSource;
  amount: number;
  affectsBalance?: boolean;
  orderId?: string;
  deliveryId?: string;
  withdrawalId?: string;
  reason?: string;
}

/**
 * Registra um movimento no caixa: cria a entrada no ledger e, se `affectsBalance`,
 * ajusta os totais. `income`/`deposit` somam; `expense`/`withdrawal`/`refund` subtraem.
 */
export async function recordCashboxEntry(db: Tx | typeof prisma, e: CashboxEntryInput): Promise<void> {
  const cashbox = await ensureAppCashbox(db);
  const affectsBalance = e.affectsBalance ?? true;

  if (affectsBalance) {
    const isIncome = e.type === 'income' || e.type === 'deposit';
    await db.appCashbox.update({
      where: { id: cashbox.id },
      data: isIncome
        ? { balance: { increment: e.amount }, totalIncome: { increment: e.amount } }
        : { balance: { decrement: e.amount }, totalExpenses: { increment: e.amount } },
    });
  }

  await db.appCashboxEntry.create({
    data: {
      appCashboxId: cashbox.id,
      type: e.type,
      source: e.source,
      amount: e.amount,
      orderId: e.orderId,
      deliveryId: e.deliveryId,
      withdrawalId: e.withdrawalId,
      reason: e.reason,
    },
  });
}
