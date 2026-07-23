// Helpers de teste respaldados por Prisma/Postgres para o domínio financeiro.
// Substituem os antigos models Mongoose Wallet/Payout/AppCashbox nos testes,
// convertendo Decimal→number para que os `expect(...).toBe(n)` funcionem.
import { prisma } from '../../lib/prisma';
import { entryToHistory } from '../../repositories/wallet.repository';

const num = (v: any) => (v == null ? v : Number(v));

function mapWallet(w: any) {
  if (!w) return w;
  return {
    ...w,
    _id: w.id,
    balance: num(w.balance),
    totalIncome: num(w.totalIncome),
    totalSpent: num(w.totalSpent),
    blockedBalance: num(w.blockedBalance),
    availableBalance: num(w.availableBalance),
    pendingBalance: num(w.pendingBalance),
    // `history`: espelha o ledger WalletEntry para os testes que liam o array embutido.
    history: (w.entries ?? []).map(entryToHistory),
  };
}

function mapPayout(p: any) {
  if (!p) return p;
  return { ...p, _id: p.id, amount: num(p.amount) };
}

function mapCashbox(c: any) {
  if (!c) return c;
  return {
    ...c,
    _id: c.id,
    balance: num(c.balance),
    totalIncome: num(c.totalIncome),
    totalExpenses: num(c.totalExpenses),
    // `history`: espelha o ledger AppCashboxEntry para os testes que liam o array embutido.
    history: (c.entries ?? []).map((e: any) => ({
      ...e,
      amount: num(e.amount),
      date: e.createdAt,
    })),
  };
}

// ─── Wallet ────────────────────────────────────────────────────────────
export async function createWallet(data: {
  owner: string;
  ownerType: 'user' | 'store' | 'motoboy' | 'platform';
  balance?: number;
  totalIncome?: number;
  totalSpent?: number;
  availableBalance?: number;
  pendingBalance?: number;
  blockedBalance?: number;
}) {
  const w = await prisma.wallet.create({
    data: {
      owner: String(data.owner),
      ownerType: data.ownerType as any,
      balance: data.balance ?? 0,
      totalIncome: data.totalIncome ?? 0,
      totalSpent: data.totalSpent ?? 0,
      availableBalance: data.availableBalance ?? 0,
      pendingBalance: data.pendingBalance ?? 0,
      blockedBalance: data.blockedBalance ?? 0,
    },
  });
  return mapWallet(w);
}

export async function findWallet(where: { owner: string; ownerType: string }) {
  const w = await prisma.wallet.findUnique({
    where: { owner_ownerType: { owner: String(where.owner), ownerType: where.ownerType as any } },
    include: { entries: { orderBy: { createdAt: 'asc' } } },
  });
  return mapWallet(w);
}

export async function setWalletBalance(
  where: { owner: string; ownerType: string },
  patch: Record<string, number>,
) {
  await prisma.wallet.update({
    where: { owner_ownerType: { owner: String(where.owner), ownerType: where.ownerType as any } },
    data: patch,
  });
}

export async function deleteWallets(where: { owner: string }) {
  await prisma.wallet.deleteMany({ where: { owner: String(where.owner) } });
}

// ─── Payout ────────────────────────────────────────────────────────────
export async function createPayout(data: {
  recipientType: 'store' | 'motoboy';
  recipientId: string;
  orderId: string;
  deliveryId?: string;
  amount: number;
  status?: string;
  gatewayProvider?: string;
}) {
  const p = await prisma.payout.create({
    data: {
      recipientType: data.recipientType as any,
      recipientId: String(data.recipientId),
      orderId: String(data.orderId),
      deliveryId: data.deliveryId ? String(data.deliveryId) : null,
      amount: data.amount,
      status: (data.status as any) ?? 'pending',
      gatewayProvider: (data.gatewayProvider as any) ?? undefined,
    },
  });
  return mapPayout(p);
}

export async function findPayout(where: any) {
  const p = await prisma.payout.findFirst({ where });
  return mapPayout(p);
}

export async function findPayoutById(id: string) {
  const p = await prisma.payout.findUnique({ where: { id: String(id) } });
  return mapPayout(p);
}

export async function findPayouts(where: any) {
  const list = await prisma.payout.findMany({ where });
  return list.map(mapPayout);
}

export async function countPayouts(where: any) {
  return prisma.payout.count({ where });
}

// ─── AppCashbox ────────────────────────────────────────────────────────
export async function createAppCashbox(data?: {
  balance?: number;
  totalIncome?: number;
  totalExpenses?: number;
}) {
  const c = await prisma.appCashbox.create({
    data: {
      balance: data?.balance ?? 0,
      totalIncome: data?.totalIncome ?? 0,
      totalExpenses: data?.totalExpenses ?? 0,
    },
  });
  return mapCashbox(c);
}

export async function findAppCashbox() {
  const c = await prisma.appCashbox.findFirst({
    orderBy: { createdAt: 'asc' },
    include: { entries: { orderBy: { createdAt: 'asc' } } },
  });
  return mapCashbox(c);
}
