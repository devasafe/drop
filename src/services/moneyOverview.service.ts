/**
 * D3b-3 · Visão geral do Dinheiro (spec 7). Só leitura.
 *
 * Dia = dia civil de São Paulo, offset fixo −03:00 (mesma premissa de saoPauloDayStart em
 * asaasLoja/motoboyTransfer.ts; se o horário de verão voltar, as duas mudam juntas).
 * Dinheiro é somado em CENTAVOS inteiros e só vira reais na saída, para o invariante de
 * "Para onde foi" (lojas + motoboys + gateway + plataforma = entrada) fechar exato.
 */
import { prisma } from '../lib/prisma';
import { getSaasConfig, isDirectOrder, SettlementMode } from '../utils/settlement';
import { saoPauloToday } from './asaasLoja/charge';
import { calculateOrderDistribution } from '../utils/walletCalculations';
import { computeCommissionProfit, COMMISSION_SOURCES } from '../utils/commissionProfit';
import { resolvablePayoutWhere } from './payout.service';
import { STALE_IN_FLIGHT_MS } from '../utils/withdrawalRules';

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Dia de São Paulo e centavos ─────────────────────────────────────────

export interface SaoPauloDay {
  day: string; // YYYY-MM-DD
  start: Date; // incluso
  end: Date; // excluso
}

/** 'YYYY-MM-DD' → 00:00 desse dia em São Paulo (−03:00). Data inválida → Invalid Date. */
export function saoPauloDayStartOf(day: string): Date {
  return new Date(`${day}T00:00:00-03:00`);
}

/** Dia de São Paulo que contém `now`. */
export function saoPauloDayRange(now: Date = new Date()): SaoPauloDay {
  const day = saoPauloToday(now);
  const start = saoPauloDayStartOf(day);
  return { day, start, end: new Date(start.getTime() + DAY_MS) };
}

export const toCents = (v: unknown): number => Math.round(Number(v ?? 0) * 100);
export const fromCents = (c: number): number => c / 100;

// ─── "Para onde foi o dinheiro hoje" (spec 7.3) ──────────────────────────

export interface MoneyFlow {
  orders: number;
  inFromCustomers: number;
  toStores: number;
  toMotoboys: number;
  gatewayCost: number;
  platform: number;
}
export type MoneyFlowCents = Omit<MoneyFlow, 'orders'>;

export interface PaidOrderSplitInput {
  direct: boolean; // paymentProvider === 'asaas_loja'
  totalValue: number; // Order.totalValue (base, já com cupom e com o saldo usado)
  deliveryFee: number; // Order.deliveryFee
  walletApplied: number; // Order.walletApplied
  cardChargedTotal: number | null; // Order.cardChargedTotal (cartão grosseado)
  storeAmount: number; // custódia: walletDistribution.storeAmount (calculateOrderDistribution no checkout)
  commissionDelivery: number; // custódia: Transaction.commissionDelivery
  motoboyTransfer: number | null; // direto: soma das MotoboyTransfer 'delivery' do pedido (null = ainda não há)
  motoboyShareDirect: number; // direto: % de PlatformConfig.motoboyShareDirect
}

/** Divide um pedido pago em centavos. Sempre: toStores + toMotoboys + gatewayCost + platform = inFromCustomers. */
export function splitPaidOrder(o: PaidOrderSplitInput): MoneyFlowCents {
  const base = toCents(o.totalValue);
  if (o.direct) {
    // Modo direto: o dinheiro entra na conta Asaas da loja; a tarifa do Asaas fica lá (fora do
    // nosso banco) e a plataforma não tem comissão por pedido. A loja paga o motoboy.
    const toMotoboys = o.motoboyTransfer != null
      ? toCents(o.motoboyTransfer)
      : Math.round((toCents(o.deliveryFee) * o.motoboyShareDirect) / 100);
    return { inFromCustomers: base, toStores: base - toMotoboys, toMotoboys, gatewayCost: 0, platform: 0 };
  }
  // Custódia: no cartão o cliente paga o custo do Asaas (gross-up sobre a parte cobrada no
  // cartão = total − saldo usado). Pix não guarda tarifa por pedido: custo 0.
  const chargedInCard = base - toCents(o.walletApplied);
  const gatewayCost = o.cardChargedTotal != null ? Math.max(0, toCents(o.cardChargedTotal) - chargedInCard) : 0;
  const inFromCustomers = base + gatewayCost;
  const toStores = toCents(o.storeAmount);
  const toMotoboys = Math.max(0, toCents(o.deliveryFee) - toCents(o.commissionDelivery));
  // Plataforma = o que sobra: comissão de produto + comissão de entrega − cupom global.
  return { inFromCustomers, toStores, toMotoboys, gatewayCost, platform: inFromCustomers - toStores - toMotoboys - gatewayCost };
}

/** Soma de "Para onde foi" para os pedidos com `paidAt` no dia (pagos ou estornados depois). */
export async function computeMoneyFlow(day: SaoPauloDay, motoboyShareDirect: number): Promise<MoneyFlow> {
  const orders = await prisma.order.findMany({
    where: { paidAt: { gte: day.start, lt: day.end }, paymentStatus: { in: ['paid', 'refunded'] } },
    select: {
      id: true, storeId: true, paymentProvider: true, totalValue: true, subtotal: true, deliveryFee: true,
      walletApplied: true, cardChargedTotal: true, walletDistribution: true,
    },
  });
  const total: MoneyFlowCents = { inFromCustomers: 0, toStores: 0, toMotoboys: 0, gatewayCost: 0, platform: 0 };
  if (orders.length === 0) return { orders: 0, ...total };

  const ids = orders.map((o) => o.id);
  const [txs, transfers] = await Promise.all([
    prisma.transaction.findMany({
      where: { orderId: { in: ids } },
      select: { orderId: true, commissionDelivery: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.motoboyTransfer.findMany({ where: { orderId: { in: ids }, reason: 'delivery' }, select: { orderId: true, amount: true } }),
  ]);
  const deliveryCommission = new Map<string, number>();
  for (const t of txs) if (!deliveryCommission.has(t.orderId)) deliveryCommission.set(t.orderId, Number(t.commissionDelivery));
  const transferCents = new Map<string, number>();
  for (const t of transfers) transferCents.set(t.orderId, (transferCents.get(t.orderId) ?? 0) + toCents(t.amount));

  for (const o of orders) {
    const direct = isDirectOrder(o);
    const snapshot = (o.walletDistribution as { storeAmount?: unknown } | null)?.storeAmount;
    let storeAmount: number | null = snapshot == null ? null : Number(snapshot);
    let commissionDelivery: number | null = deliveryCommission.get(o.id) ?? null;
    if (!direct && (storeAmount == null || commissionDelivery == null)) {
      // Pedido sem o retrato do checkout: recalcula pela mesma função (config de agora).
      const fee = Number(o.deliveryFee);
      const products = o.subtotal != null ? Number(o.subtotal) : Number(o.totalValue) - fee;
      const dist = await calculateOrderDistribution(products, fee, o.storeId);
      if (storeAmount == null) storeAmount = dist.storeAmount;
      if (commissionDelivery == null) commissionDelivery = dist.delivery?.appCommission ?? 0;
    }
    const transfer = transferCents.get(o.id);
    const part = splitPaidOrder({
      direct,
      totalValue: Number(o.totalValue),
      deliveryFee: Number(o.deliveryFee),
      walletApplied: Number(o.walletApplied ?? 0),
      cardChargedTotal: o.cardChargedTotal == null ? null : Number(o.cardChargedTotal),
      storeAmount: storeAmount ?? 0,
      commissionDelivery: commissionDelivery ?? 0,
      motoboyTransfer: transfer == null ? null : fromCents(transfer),
      motoboyShareDirect,
    });
    total.inFromCustomers += part.inFromCustomers;
    total.toStores += part.toStores;
    total.toMotoboys += part.toMotoboys;
    total.gatewayCost += part.gatewayCost;
    total.platform += part.platform;
  }

  return {
    orders: orders.length,
    inFromCustomers: fromCents(total.inFromCustomers),
    toStores: fromCents(total.toStores),
    toMotoboys: fromCents(total.toMotoboys),
    gatewayCost: fromCents(total.gatewayCost),
    platform: fromCents(total.platform),
  };
}

// ─── Cartões (spec 7.1) ──────────────────────────────────────────────────

export interface MoneySummary {
  mode: SettlementMode;
  day: string;
  custody: { amount: number; count: number } | null;
  toRelease: { amount: number; count: number; uncertain: number } | null;
  withdrawalsToday: { amount: number; count: number; pending: number; uncertain: number };
  refunds: { amount: number; count: number } | null;
  platformRevenueToday: number;
  whereMoneyWent: MoneyFlow;
}

/** Pedidos de custódia pagos e ainda não entregues nem cancelados: o dinheiro está na conta-mãe. */
async function custodyCard(): Promise<{ amount: number; count: number }> {
  const agg = await prisma.order.aggregate({
    where: {
      paymentProvider: { not: 'asaas_loja' },
      paymentStatus: 'paid',
      status: { notIn: ['entregue', 'cancelado', 'rejeitado'] },
    },
    _sum: { totalValue: true },
    _count: { _all: true },
  });
  return { amount: fromCents(toCents(agg._sum.totalValue)), count: agg._count._all };
}

/** Repasses pendentes livres + quantos estão incertos (mesmo conjunto do filtro "Incertos"). */
async function toReleaseCard(now: Date): Promise<{ amount: number; count: number; uncertain: number }> {
  const [agg, uncertain] = await Promise.all([
    prisma.payout.aggregate({ where: { status: 'pending', blocked: false }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.payout.count({ where: resolvablePayoutWhere(now) }),
  ]);
  return { amount: fromCents(toCents(agg._sum.amount)), count: agg._count._all, uncertain };
}

/** Saques pagos no dia + pendentes agora + incertos (approved com uncertainAt ou parados há > 10 min). */
async function withdrawalsCard(day: SaoPauloDay, now: Date) {
  const staleBefore = new Date(now.getTime() - STALE_IN_FLIGHT_MS);
  const [done, pending, uncertain] = await Promise.all([
    prisma.withdrawalRequest.aggregate({
      where: { status: 'processed', processedAt: { gte: day.start, lt: day.end } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.withdrawalRequest.count({ where: { status: 'pending' } }),
    prisma.withdrawalRequest.count({
      where: { status: 'approved', OR: [{ uncertainAt: { not: null } }, { approvedAt: { lt: staleBefore } }] },
    }),
  ]);
  return { amount: fromCents(toCents(done._sum.amount)), count: done._count._all, pending, uncertain };
}

/** Modo direto: estornos pela conta da loja ainda não concluídos. */
async function refundsCard(): Promise<{ amount: number; count: number }> {
  const agg = await prisma.directRefund.aggregate({ where: { status: { not: 'done' } }, _sum: { amount: true }, _count: { _all: true } });
  return { amount: fromCents(toCents(agg._sum.amount)), count: agg._count._all };
}

/** Comissões lançadas no caixa no dia, pela mesma regra do caixa (computeCommissionProfit). */
async function platformRevenue(day: SaoPauloDay): Promise<number> {
  const rows = await prisma.appCashboxEntry.findMany({
    where: { source: { in: [...COMMISSION_SOURCES] }, createdAt: { gte: day.start, lt: day.end } },
    select: { type: true, source: true, amount: true },
  });
  const profit = computeCommissionProfit(rows.map((r) => ({ type: r.type, source: r.source, amount: Number(r.amount) })));
  return fromCents(toCents(profit));
}

export async function getMoneySummary(now: Date = new Date()): Promise<MoneySummary> {
  const cfg = await getSaasConfig();
  const custodyMode = cfg.settlementMode === 'custodia';
  const day = saoPauloDayRange(now);

  const [custody, toRelease, withdrawalsToday, refunds, platformRevenueToday, whereMoneyWent] = await Promise.all([
    custodyMode ? custodyCard() : Promise.resolve(null),
    custodyMode ? toReleaseCard(now) : Promise.resolve(null),
    withdrawalsCard(day, now),
    custodyMode ? Promise.resolve(null) : refundsCard(),
    platformRevenue(day),
    computeMoneyFlow(day, cfg.motoboyShareDirect),
  ]);

  return { mode: cfg.settlementMode, day: day.day, custody, toRelease, withdrawalsToday, refunds, platformRevenueToday, whereMoneyWent };
}
