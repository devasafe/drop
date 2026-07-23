import { Wallet, WalletEntry, Prisma, OwnerType } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * Mapeadores de Wallet para a forma de API — Fase 4, Fatia 5.
 *
 * `Wallet.history[]` (array embutido no Mongo) virou a tabela-ledger `WalletEntry`.
 * O mapper devolve o saldo como number (era Decimal) e, opcionalmente, o `history`
 * carregado do ledger — para os controllers seguirem devolvendo o mesmo JSON.
 */

function num(v: Prisma.Decimal | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'number' ? v : v.toNumber();
}

/** Converte uma linha do ledger para a forma que o `history` tinha no Mongo. */
export function entryToHistory(e: WalletEntry): any {
  return {
    date: e.createdAt,
    type: e.type,
    category: e.category,
    amount: num(e.amount),
    reason: e.reason,
    paymentMethod: e.paymentMethod,
    relatedId: e.relatedId,
    reference: e.reference,
  };
}

/** Wallet na forma de API: dinheiro em number, `_id`, e `history` do ledger. */
export function toApiWallet(wallet: Wallet | null, history: WalletEntry[] = []): any {
  if (!wallet) return null;
  return {
    _id: wallet.id,
    owner: wallet.owner,
    ownerType: wallet.ownerType,
    balance: num(wallet.balance),
    totalIncome: num(wallet.totalIncome),
    totalSpent: num(wallet.totalSpent),
    blockedBalance: num(wallet.blockedBalance),
    availableBalance: num(wallet.availableBalance),
    pendingBalance: num(wallet.pendingBalance),
    gamificationBenefits: wallet.gamificationBenefits || {},
    history: history.map(entryToHistory),
  };
}

/** Últimas `take` entradas do ledger (mais recentes primeiro). */
export function loadWalletHistory(walletId: string, take = 10): Promise<WalletEntry[]> {
  return prisma.walletEntry.findMany({
    where: { walletId },
    orderBy: { createdAt: 'desc' },
    take,
  });
}
