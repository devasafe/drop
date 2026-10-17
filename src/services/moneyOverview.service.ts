/**
 * D3b-3 · Visão geral do Dinheiro (spec 7). Só leitura.
 *
 * Dia = dia civil de São Paulo, offset fixo −03:00 (mesma premissa de saoPauloDayStart em
 * asaasLoja/motoboyTransfer.ts; se o horário de verão voltar, as duas mudam juntas).
 * Dinheiro é somado em CENTAVOS inteiros e só vira reais na saída, para o invariante de
 * "Para onde foi" (lojas + motoboys + gateway + plataforma = entrada) fechar exato.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ValidationError } from '../utils/AppError';
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

// ─── Movimentos de hoje (spec 7.2) ───────────────────────────────────────

export const MONEY_MOVEMENT_TYPES = [
  'order_payment', 'payout_release', 'withdrawal_paid', 'refund', 'commission', 'wallet_adjust', 'cashbox',
] as const;
export type MoneyMovementType = (typeof MONEY_MOVEMENT_TYPES)[number];
export const MONEY_PAGE_SIZE = 50;

export interface MoneyMovement {
  id: string; // prefixo da tabela + id da linha (único entre tipos)
  at: string; // ISO
  type: MoneyMovementType;
  amount: number; // reais com sinal: + entrada, − saída
  orderId: string | null;
  personName: string | null;
  label: string;
}
export interface MoneyMovementPage {
  day: string;
  items: MoneyMovement[];
  nextCursor: string | null;
}

export interface MoneyCursor {
  at: Date;
  id: string;
}

/** Cursor opaco: base64url de {"at": ISO, "id": ...}. */
export function encodeMoneyCursor(at: Date, id: string): string {
  return Buffer.from(JSON.stringify({ at: at.toISOString(), id }), 'utf8').toString('base64url');
}

export function decodeMoneyCursor(raw: string): MoneyCursor {
  let parsed: any;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new ValidationError('Cursor inválido');
  }
  const at = typeof parsed?.at === 'string' ? new Date(parsed.at) : new Date(Number.NaN);
  if (Number.isNaN(at.getTime()) || typeof parsed?.id !== 'string' || !parsed.id || parsed.id.length > 200) {
    throw new ValidationError('Cursor inválido');
  }
  return { at, id: parsed.id };
}

type PersonRef = { kind: 'user' | 'store' | 'orderCustomer' | 'cashboxWithdrawal'; id: string };

interface RawMovement {
  id: string;
  at: Date;
  type: MoneyMovementType;
  cents: number;
  orderId: string | null;
  personName: string | null;
  personRef: PersonRef | null;
  label: string;
}

type AtFilter = { gte: Date; lt: Date } | { equals: Date };
type MovementFetcher = (at: AtFilter, take?: number) => Promise<RawMovement[]>;

const shortOrderId = (id: string) => id.slice(-6);
const COMMISSION_LABEL: Record<string, string> = {
  product_commission: 'Comissão de produto',
  delivery_commission: 'Comissão de entrega',
};

const fetchOrderPayments: MovementFetcher = async (at, take) => {
  const rows = await prisma.order.findMany({
    where: { paidAt: at, paymentStatus: { in: ['paid', 'refunded'] } },
    orderBy: { paidAt: 'desc' },
    take,
    select: { id: true, paidAt: true, totalValue: true, customer: { select: { name: true } } },
  });
  return rows.map((r): RawMovement => ({
    id: `ord:${r.id}`, at: r.paidAt as Date, type: 'order_payment', cents: toCents(r.totalValue),
    orderId: r.id, personName: r.customer?.name ?? null, personRef: null,
    label: `Pagamento do pedido #${shortOrderId(r.id)}`,
  }));
};

const fetchPayoutReleases: MovementFetcher = async (at, take) => {
  const rows = await prisma.payout.findMany({
    where: { releasedAt: at },
    orderBy: { releasedAt: 'desc' },
    take,
    select: { id: true, releasedAt: true, amount: true, orderId: true, recipientType: true, recipientId: true },
  });
  return rows.map((r): RawMovement => ({
    id: `pay:${r.id}`, at: r.releasedAt as Date, type: 'payout_release', cents: -toCents(r.amount),
    orderId: r.orderId, personName: null,
    personRef: { kind: r.recipientType === 'store' ? 'store' : 'user', id: r.recipientId },
    label: r.recipientType === 'store' ? 'Repasse liberado à loja' : 'Repasse liberado ao motoboy',
  }));
};

const fetchWithdrawalsPaid: MovementFetcher = async (at, take) => {
  const rows = await prisma.withdrawalRequest.findMany({
    where: { status: 'processed', processedAt: at },
    orderBy: { processedAt: 'desc' },
    take,
    select: { id: true, processedAt: true, amount: true, motoboyName: true },
  });
  return rows.map((r): RawMovement => ({
    id: `wdr:${r.id}`, at: r.processedAt as Date, type: 'withdrawal_paid', cents: -toCents(r.amount),
    orderId: null, personName: r.motoboyName || null, personRef: null, label: 'Saque pago',
  }));
};

/** Data como timestamp UTC no SQL, sem depender do fuso da sessão do Postgres. */
const sqlTimestamp = (d: Date) => Prisma.sql`(CAST(${d.toISOString()} AS timestamptz) AT TIME ZONE 'UTC')`;

/** Estorno da custódia: Cancellation processado de pedido que NÃO é do modo direto. */
const fetchCustodyRefunds: MovementFetcher = async (at, take) => {
  const when = 'equals' in at
    ? Prisma.sql`c."updatedAt" = ${sqlTimestamp(at.equals)}`
    : Prisma.sql`c."updatedAt" >= ${sqlTimestamp(at.gte)} AND c."updatedAt" < ${sqlTimestamp(at.lt)}`;
  const limit = take ? Prisma.sql`LIMIT ${take}` : Prisma.empty;
  const rows = await prisma.$queryRaw<Array<{ id: string; at: Date; amount: Prisma.Decimal; orderId: string; customerName: string | null }>>`
    SELECT c.id, c."updatedAt" AS at, c."refundAmount" AS amount, c."orderId" AS "orderId", u.name AS "customerName"
    FROM "Cancellation" c
    JOIN "Order" o ON o.id = c."orderId"
    LEFT JOIN "User" u ON u.id = o."customerId"
    WHERE c."refundStatus" = 'processed'
      AND c."refundAmount" > 0
      AND o."paymentProvider" <> 'asaas_loja'
      AND ${when}
    ORDER BY c."updatedAt" DESC
    ${limit}`;
  return rows.map((r): RawMovement => ({
    id: `can:${r.id}`, at: new Date(r.at), type: 'refund', cents: -toCents(r.amount),
    orderId: r.orderId, personName: r.customerName ?? null, personRef: null, label: 'Estorno ao cliente',
  }));
};

const fetchDirectRefunds: MovementFetcher = async (at, take) => {
  const rows = await prisma.directRefund.findMany({
    where: { status: 'done', doneAt: at },
    orderBy: { doneAt: 'desc' },
    take,
    select: { id: true, doneAt: true, amount: true, orderId: true },
  });
  return rows.map((r): RawMovement => ({
    id: `drf:${r.id}`, at: r.doneAt as Date, type: 'refund', cents: -toCents(r.amount),
    orderId: r.orderId, personName: null, personRef: { kind: 'orderCustomer', id: r.orderId },
    label: 'Estorno ao cliente (conta da loja)',
  }));
};

const fetchCommissions: MovementFetcher = async (at, take) => {
  const rows = await prisma.appCashboxEntry.findMany({
    where: { source: { in: [...COMMISSION_SOURCES] }, createdAt: at },
    orderBy: { createdAt: 'desc' },
    take,
    select: { id: true, createdAt: true, type: true, source: true, amount: true, orderId: true },
  });
  return rows.map((r): RawMovement => {
    const income = r.type === 'income';
    const name = COMMISSION_LABEL[r.source];
    return {
      id: `ace:${r.id}`, at: r.createdAt, type: 'commission', cents: income ? toCents(r.amount) : -toCents(r.amount),
      orderId: r.orderId, personName: null, personRef: null,
      label: income ? name : `Estorno da ${name.charAt(0).toLowerCase()}${name.slice(1)}`,
    };
  });
};

const fetchCashbox: MovementFetcher = async (at, take) => {
  const rows = await prisma.appCashboxEntry.findMany({
    where: { source: { in: ['manual_deposit', 'manual_withdrawal'] }, createdAt: at },
    orderBy: { createdAt: 'desc' },
    take,
    select: { id: true, createdAt: true, source: true, amount: true, withdrawalId: true },
  });
  return rows.map((r): RawMovement => {
    const deposit = r.source === 'manual_deposit';
    return {
      id: `ace:${r.id}`, at: r.createdAt, type: 'cashbox', cents: deposit ? toCents(r.amount) : -toCents(r.amount),
      orderId: null, personName: null,
      personRef: !deposit && r.withdrawalId ? { kind: 'cashboxWithdrawal', id: r.withdrawalId } : null,
      label: deposit ? 'Depósito no caixa' : 'Retirada do caixa',
    };
  });
};

const fetchWalletAdjusts: MovementFetcher = async (at, take) => {
  const rows = await prisma.walletEntry.findMany({
    where: { category: 'adjustment', createdAt: at },
    orderBy: { createdAt: 'desc' },
    take,
    select: { id: true, createdAt: true, type: true, amount: true, wallet: { select: { owner: true, ownerType: true } } },
  });
  return rows.map((r): RawMovement => {
    const credit = r.type === 'credit';
    const ownerType = r.wallet.ownerType;
    const personRef: PersonRef | null = ownerType === 'store'
      ? { kind: 'store', id: r.wallet.owner }
      : ownerType === 'platform' ? null : { kind: 'user', id: r.wallet.owner };
    return {
      id: `wle:${r.id}`, at: r.createdAt, type: 'wallet_adjust', cents: credit ? toCents(r.amount) : -toCents(r.amount),
      orderId: null, personName: null, personRef,
      label: credit ? 'Ajuste da plataforma (crédito)' : 'Ajuste da plataforma (débito)',
    };
  });
};

const MOVEMENT_FETCHERS: Record<MoneyMovementType, MovementFetcher[]> = {
  order_payment: [fetchOrderPayments],
  payout_release: [fetchPayoutReleases],
  withdrawal_paid: [fetchWithdrawalsPaid],
  refund: [fetchCustodyRefunds, fetchDirectRefunds],
  commission: [fetchCommissions],
  wallet_adjust: [fetchWalletAdjusts],
  cashbox: [fetchCashbox],
};

/** (at desc, id desc), comparando id em JavaScript (independe da collation do banco). */
function compareMovements(a: RawMovement, b: RawMovement): number {
  const diff = b.at.getTime() - a.at.getTime();
  if (diff !== 0) return diff;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * Linhas de UMA fonte depois do cursor que, juntas, contêm com certeza as MONEY_PAGE_SIZE+1
 * primeiras dela: empates do instante do cursor com id menor, as mais recentes antes do
 * cursor e todos os empates do instante da última trazida (borda do limite).
 */
async function fetchAfterCursor(fetch: MovementFetcher, day: SaoPauloDay, cursor: MoneyCursor | null): Promise<RawMovement[]> {
  const out: RawMovement[] = [];
  if (cursor) out.push(...(await fetch({ equals: cursor.at })).filter((m) => m.id < cursor.id));
  const upper = cursor ? cursor.at : day.end;
  if (upper.getTime() <= day.start.getTime()) return out;
  const older = await fetch({ gte: day.start, lt: upper }, MONEY_PAGE_SIZE + 1);
  out.push(...older);
  if (older.length === MONEY_PAGE_SIZE + 1) out.push(...(await fetch({ equals: older[older.length - 1].at })));
  return out;
}

/** Nomes só para a página (lote por tipo de referência). */
async function resolvePersonNames(items: RawMovement[]): Promise<void> {
  const idsOf = (kind: PersonRef['kind']) => [...new Set(items.filter((i) => i.personRef?.kind === kind).map((i) => i.personRef!.id))];
  const withdrawalIds = idsOf('cashboxWithdrawal');
  const orderIds = idsOf('orderCustomer');
  const [withdrawals, orders] = await Promise.all([
    withdrawalIds.length
      ? prisma.withdrawal.findMany({ where: { id: { in: withdrawalIds } }, select: { id: true, requestedBy: true } })
      : Promise.resolve([] as Array<{ id: string; requestedBy: string | null }>),
    orderIds.length
      ? prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, customer: { select: { name: true } } } })
      : Promise.resolve([] as Array<{ id: string; customer: { name: string | null } | null }>),
  ]);
  const requester = new Map(withdrawals.map((w) => [w.id, w.requestedBy]));
  const userIds = new Set(idsOf('user'));
  for (const id of requester.values()) if (id) userIds.add(id);
  const storeIds = idsOf('store');
  const [users, stores] = await Promise.all([
    userIds.size
      ? prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true } })
      : Promise.resolve([] as Array<{ id: string; name: string | null }>),
    storeIds.length
      ? prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } })
      : Promise.resolve([] as Array<{ id: string; name: string | null }>),
  ]);
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const customerName = new Map(orders.map((o) => [o.id, o.customer?.name ?? null]));
  for (const item of items) {
    const ref = item.personRef;
    if (!ref) continue;
    if (ref.kind === 'user') item.personName = userName.get(ref.id) ?? null;
    else if (ref.kind === 'store') item.personName = storeName.get(ref.id) ?? null;
    else if (ref.kind === 'orderCustomer') item.personName = customerName.get(ref.id) ?? null;
    else {
      const requestedBy = requester.get(ref.id);
      item.personName = requestedBy ? userName.get(requestedBy) ?? null : null;
    }
  }
}

/** Movimentos do dia de São Paulo (do cursor, se houver; senão de `now`), 50 por página. */
export async function listMoneyMovements(
  opts: { type?: MoneyMovementType; cursor?: string },
  now: Date = new Date(),
): Promise<MoneyMovementPage> {
  const cursor = opts.cursor ? decodeMoneyCursor(opts.cursor) : null;
  const day = saoPauloDayRange(cursor ? cursor.at : now);
  const fetchers = (opts.type ? [opts.type] : [...MONEY_MOVEMENT_TYPES]).flatMap((t) => MOVEMENT_FETCHERS[t]);
  const perSource = await Promise.all(fetchers.map((f) => fetchAfterCursor(f, day, cursor)));

  const merged = new Map<string, RawMovement>();
  for (const list of perSource) for (const m of list) merged.set(m.id, m);
  const sorted = [...merged.values()].sort(compareMovements);
  const page = sorted.slice(0, MONEY_PAGE_SIZE);
  await resolvePersonNames(page);

  const last = page[page.length - 1];
  return {
    day: day.day,
    items: page.map((m) => ({
      id: m.id, at: m.at.toISOString(), type: m.type, amount: fromCents(m.cents),
      orderId: m.orderId, personName: m.personName, label: m.label,
    })),
    nextCursor: sorted.length > MONEY_PAGE_SIZE ? encodeMoneyCursor(last.at, last.id) : null,
  };
}
