/**
 * D3b-1 · Pedidos ao vivo (spec 3.2): lista com o "Por que importa" calculado aqui e os KPIs da tela.
 *
 * Paginação: cursor de utils/cursorPagination (createdAt desc, id desc), 50 por página; dentro da
 * página, quem precisa de atenção vem primeiro (ordem R1) e depois o mais antigo. O filtro
 * "atencao" não pagina: varre até ATTENTION_SCAN_MAX pedidos (em andamento + cancelados hoje), do
 * mais antigo para o mais novo (os parados há mais tempo não ficam de fora; teto batido → meta.attentionTruncated),
 * devolve todos os que precisam de atenção já ordenados e `nextCursor: null`.
 * A etapa da entrega vem de Delivery.status (o pedido não vai a 'enviado' na retirada).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { parseCursorPage, sliceCursorPage } from '../../utils/cursorPagination';
import { saoPauloDayRange } from '../moneyOverview.service';
import { AdminOrderRow, AdminOrdersResponse, OrdersFilter } from './types';
import { ACTIVE_ORDER_STATUSES, CANCELLED_ORDER_STATUSES, OpsLimits, avgMinutes, readOpsLimits, shortOrderId } from './common';
import { ATTENTION_ORDER, attentionFor } from './attention';

export const ORDERS_FILTERS: readonly OrdersFilter[] = ['atencao', 'todos', 'aguardando_pix', 'na_loja', 'em_entrega', 'cancelados_hoje'];
export const ORDERS_PAGE_SIZE = 50;
export const ATTENTION_SCAN_MAX = 500;

export interface ListAdminOrdersInput {
  filter: OrdersFilter;
  storeId?: string;
  cursor?: string;
}

const ORDER_ROW_SELECT = Prisma.validator<Prisma.OrderSelect>()({
  id: true,
  status: true,
  paymentStatus: true,
  totalValue: true,
  createdAt: true,
  updatedAt: true,
  paidAt: true,
  acceptedAt: true,
  cancelledAt: true,
  awaitingCustomerPoolDecision: true,
  deliveryDuration: true,
  deliveryId: true,
  store: { select: { id: true, name: true } },
});
type OrderRowRecord = Prisma.OrderGetPayload<{ select: typeof ORDER_ROW_SELECT }>;
type DeliveryStage = { status: string; createdAt: Date; assignedAt: Date | null; pickedAt: Date | null } | null;

const AWAITING_PIX_WHERE: Prisma.OrderWhereInput = { status: 'criado', paymentStatus: 'pending', paymentMethod: 'pix' };

const cancelledTodayWhere = (dayStart: Date): Prisma.OrderWhereInput => ({
  status: { in: CANCELLED_ORDER_STATUSES },
  OR: [{ cancelledAt: { gte: dayStart } }, { cancelledAt: null, updatedAt: { gte: dayStart } }],
});

async function pickedOrderIds(): Promise<string[]> {
  const rows = await prisma.delivery.findMany({ where: { status: 'picked' }, select: { orderId: true } });
  return rows.map((r) => r.orderId);
}

async function filterWhere(filter: OrdersFilter, dayStart: Date): Promise<Prisma.OrderWhereInput> {
  switch (filter) {
    case 'todos':
      return { status: { in: ACTIVE_ORDER_STATUSES } };
    case 'aguardando_pix':
      return AWAITING_PIX_WHERE;
    case 'na_loja':
      return { status: { in: ACTIVE_ORDER_STATUSES }, paymentStatus: 'paid', id: { notIn: await pickedOrderIds() } };
    case 'em_entrega':
      return { status: { in: ACTIVE_ORDER_STATUSES }, id: { in: await pickedOrderIds() } };
    case 'cancelados_hoje':
      return cancelledTodayWhere(dayStart);
    case 'atencao':
      return { OR: [{ status: { in: ACTIVE_ORDER_STATUSES } }, cancelledTodayWhere(dayStart)] };
  }
}

function stageSinceOf(o: OrderRowRecord, d: DeliveryStage): Date {
  if ((CANCELLED_ORDER_STATUSES as string[]).includes(o.status)) return o.cancelledAt ?? o.updatedAt;
  if (d?.status === 'picked' && d.pickedAt) return d.pickedAt;
  if (d?.status === 'assigned' && d.assignedAt) return d.assignedAt;
  if (d?.status === 'pending') return d.createdAt;
  if (o.acceptedAt) return o.acceptedAt;
  return o.paidAt ?? o.createdAt;
}

/** Junta entrega, motoboy e estorno aberto e calcula o motivo de cada linha. */
async function toRows(records: OrderRowRecord[], limits: OpsLimits, now: Date): Promise<AdminOrderRow[]> {
  if (records.length === 0) return [];
  const deliveryIds = records.map((o) => o.deliveryId).filter((id): id is string => !!id);
  const cancelledIds = records.filter((o) => (CANCELLED_ORDER_STATUSES as string[]).includes(o.status)).map((o) => o.id);
  const [deliveries, openCancellations, openDirectRefunds] = await Promise.all([
    deliveryIds.length
      ? prisma.delivery.findMany({
          where: { id: { in: deliveryIds } },
          select: { id: true, status: true, motoboyId: true, createdAt: true, assignedAt: true, pickedAt: true },
        })
      : [],
    cancelledIds.length
      ? prisma.cancellation.findMany({
          where: { orderId: { in: cancelledIds }, refundStatus: { in: ['pending', 'failed'] }, refundAmount: { gt: 0 } },
          select: { orderId: true },
        })
      : [],
    cancelledIds.length
      ? prisma.directRefund.findMany({ where: { orderId: { in: cancelledIds }, status: { not: 'done' } }, select: { orderId: true } })
      : [],
  ]);
  const deliveryById = new Map(deliveries.map((d) => [d.id, d] as const));
  const motoboyIds = Array.from(new Set(deliveries.map((d) => d.motoboyId).filter((id): id is string => !!id)));
  const motoboys = motoboyIds.length
    ? await prisma.user.findMany({ where: { id: { in: motoboyIds } }, select: { id: true, name: true } })
    : [];
  const motoboyById = new Map(motoboys.map((m) => [m.id, m]));
  const refundOpen = new Set([...openCancellations.map((c) => c.orderId), ...openDirectRefunds.map((r) => r.orderId)]);

  return records.map((o): AdminOrderRow => {
    const d = o.deliveryId ? deliveryById.get(o.deliveryId) ?? null : null;
    const motoboy = d?.motoboyId ? motoboyById.get(d.motoboyId) ?? null : null;
    return {
      id: o.id,
      shortId: shortOrderId(o.id),
      status: o.status,
      deliveryStatus: d?.status ?? null,
      store: { id: o.store.id, name: o.store.name },
      motoboy: motoboy ? { id: motoboy.id, name: motoboy.name } : null,
      createdAt: o.createdAt.toISOString(),
      stageSince: stageSinceOf(o, d).toISOString(),
      total: Number(o.totalValue),
      attention: attentionFor({ ...o, delivery: d, refundPending: refundOpen.has(o.id) }, limits, now),
    };
  });
}

const rank = (row: AdminOrderRow) => (row.attention ? ATTENTION_ORDER.indexOf(row.attention) : ATTENTION_ORDER.length);

/** Atenção primeiro (ordem R1), depois o mais antigo. */
function sortRows(rows: AdminOrderRow[]): AdminOrderRow[] {
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt));
}

/** Varre do mais antigo para o mais novo; `truncated` quando havia mais candidatos que o teto. */
async function scanAttention(
  where: Prisma.OrderWhereInput,
  limits: OpsLimits,
  now: Date,
  max: number,
): Promise<{ rows: AdminOrderRow[]; truncated: boolean }> {
  const records = await prisma.order.findMany({
    where,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: max + 1,
    select: ORDER_ROW_SELECT,
  });
  const truncated = records.length > max;
  const scanned = truncated ? records.slice(0, max) : records;
  return { rows: sortRows((await toRows(scanned, limits, now)).filter((r) => r.attention !== null)), truncated };
}

async function ordersMeta(
  limits: OpsLimits,
  attention: number,
  attentionTruncated: boolean,
  dayStart: Date,
  now: Date,
): Promise<AdminOrdersResponse['meta']> {
  const [active, activePaid, awaitingPix, accepted, assigned, deliveredToday] = await Promise.all([
    prisma.order.count({ where: { status: { in: ACTIVE_ORDER_STATUSES } } }),
    prisma.order.count({ where: { status: { in: ACTIVE_ORDER_STATUSES }, paymentStatus: 'paid' } }),
    prisma.order.count({ where: AWAITING_PIX_WHERE }),
    prisma.order.findMany({
      where: { acceptedAt: { gte: dayStart, lte: now }, paidAt: { not: null } },
      select: { paidAt: true, acceptedAt: true },
    }),
    prisma.delivery.findMany({ where: { assignedAt: { gte: dayStart, lte: now } }, select: { createdAt: true, assignedAt: true } }),
    prisma.delivery.count({ where: { deliveredAt: { gte: dayStart, lte: now } } }),
  ]);
  return {
    active,
    activePaid,
    awaitingPix,
    attention,
    acceptAvgMin: avgMinutes(accepted.map((o): [Date | null, Date | null] => [o.paidAt, o.acceptedAt])),
    acceptLimitMin: limits.storeAcceptTimeoutMin,
    findMotoboyAvgMin: avgMinutes(assigned.map((d): [Date | null, Date | null] => [d.createdAt, d.assignedAt])),
    poolTimeoutMin: limits.poolTimeoutMin,
    deliveredToday,
    attentionTruncated,
  };
}

export async function listAdminOrders(
  input: ListAdminOrdersInput,
  now: Date = new Date(),
  opts: { attentionScanMax?: number } = {},
): Promise<AdminOrdersResponse> {
  const limits = await readOpsLimits();
  const day = saoPauloDayRange(now);
  const scan = await scanAttention(await filterWhere('atencao', day.start), limits, now, opts.attentionScanMax ?? ATTENTION_SCAN_MAX);
  const allAttention = scan.rows;
  const meta = await ordersMeta(limits, allAttention.length, scan.truncated, day.start, now);

  if (input.filter === 'atencao') {
    const items = input.storeId ? allAttention.filter((r) => r.store.id === input.storeId) : allAttention;
    return { items, nextCursor: null, meta };
  }

  const page = parseCursorPage({ cursor: input.cursor }, { defaultLimit: ORDERS_PAGE_SIZE, maxLimit: ORDERS_PAGE_SIZE });
  const records = await prisma.order.findMany({
    where: { AND: [await filterWhere(input.filter, day.start), input.storeId ? { storeId: input.storeId } : {}, page.where] },
    orderBy: page.orderBy,
    take: page.take,
    select: ORDER_ROW_SELECT,
  });
  const { items, nextCursor } = sliceCursorPage(records, page);
  return { items: sortRows(await toRows(items, limits, now)), nextCursor, meta };
}
