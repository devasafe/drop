/**
 * D3b-1 · Pedido · visão do admin (spec 3.3). Só leitura.
 *
 * PIN nunca sai: a entrega é lida por um select sem os campos de PIN, e a resposta não carrega o
 * objeto da entrega. CPF e e-mail não são lidos. O dinheiro usa as mesmas contas da Visão geral
 * (splitPaidOrder) sobre o retrato gravado no checkout.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { calculateOrderDistribution } from '../../utils/walletCalculations';
import { isDirectOrder } from '../../utils/settlement';
import { getPlatformConfig } from '../../repositories/platformConfig.repository';
import { splitPaidOrder, toCents, fromCents } from '../moneyOverview.service';
import { ADMIN_CANCELLABLE_STATUSES, AdminOrderAllowedAction, AdminOrderDetail, TimelineKey, TimelineStep } from './types';
import { countCustomerCancellations30d } from '../cancellation/faultStats';
import { CANCELLED_ORDER_STATUSES, MIN_MS, PermissionCheck, round1, shortOrderId } from './common';


/** O que o admin vê da entrega: sem pin, pinRetirada nem pinDevolucao. */
const SAFE_DELIVERY_SELECT = Prisma.validator<Prisma.DeliverySelect>()({
  id: true,
  status: true,
  motoboyId: true,
  createdAt: true,
  assignedAt: true,
  pickedAt: true,
  deliveredAt: true,
  statusDevolucao: true,
});

const ORDER_DETAIL_SELECT = Prisma.validator<Prisma.OrderSelect>()({
  id: true,
  status: true,
  paymentStatus: true,
  paymentProvider: true,
  totalValue: true,
  subtotal: true,
  deliveryFee: true,
  walletApplied: true,
  cardChargedTotal: true,
  walletDistribution: true,
  createdAt: true,
  paidAt: true,
  acceptedAt: true,
  cancelledAt: true,
  deliveryId: true,
  storeId: true,
  customerId: true,
  store: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true } },
  items: { select: { quantity: true, price: true, product: { select: { name: true } } } },
});
type OrderDetailRecord = Prisma.OrderGetPayload<{ select: typeof ORDER_DETAIL_SELECT }>;

async function loadMotoboy(id: string): Promise<AdminOrderDetail['motoboy']> {
  const [user, rating] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { id: true, name: true, verification: true } }),
    prisma.delivery.aggregate({ where: { motoboyId: id, rating: { not: null } }, _avg: { rating: true } }),
  ]);
  if (!user) return null;
  const plate = (user.verification as { courier?: { plate?: unknown } } | null)?.courier?.plate;
  return {
    id: user.id,
    name: user.name,
    vehicle: null, // não há campo de veículo no cadastro (nota ao controlador 2)
    plate: typeof plate === 'string' && plate ? plate : null,
    rating: rating._avg.rating == null ? null : round1(rating._avg.rating),
  };
}

/** Pedidos do cliente e cancelamentos de 30 dias que contam contra ele (inclui culpa do cliente dada pelo admin). */
async function loadCustomerStats(customerId: string, now: Date) {
  const [ordersCount, cancellations30d] = await Promise.all([
    prisma.order.count({ where: { customerId } }),
    countCustomerCancellations30d(customerId, now),
  ]);
  return { ordersCount, cancellations30d };
}

async function namesById(ids: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

function buildTimeline(steps: Array<[TimelineKey, Date | null | undefined]>): TimelineStep[] {
  let prev: Date | null = null;
  return steps.map(([key, at]) => {
    const sincePrevMin = at && prev ? Math.round((at.getTime() - prev.getTime()) / MIN_MS) : null;
    if (at) prev = at;
    return { key, at: at ? at.toISOString() : null, sincePrevMin };
  });
}

async function orderMoney(
  order: OrderDetailRecord,
  direct: boolean,
  commissionDelivery: number | null,
  transferAmount: number | null,
  motoboyShareDirect: number,
): Promise<Omit<AdminOrderDetail['money'], 'payouts' | 'motoboyTransfer'>> {
  const total = Number(order.totalValue);
  const fee = Number(order.deliveryFee);
  const subtotal = order.subtotal != null ? Number(order.subtotal) : fromCents(toCents(total) - toCents(fee));
  const base = {
    subtotal,
    deliveryFee: fee,
    couponDiscount: fromCents(Math.max(0, toCents(subtotal) + toCents(fee) - toCents(total))),
    walletApplied: Number(order.walletApplied ?? 0),
  };
  const paid = order.paymentStatus === 'paid' || order.paymentStatus === 'refunded';
  if (!paid) return { ...base, paidByCustomer: total, storeShare: null, motoboyShare: null, platformShare: null };

  const snapshot = (order.walletDistribution as { storeAmount?: unknown } | null)?.storeAmount;
  let storeAmount: number | null = snapshot == null ? null : Number(snapshot);
  let deliveryCommission = commissionDelivery;
  if (!direct && (storeAmount == null || deliveryCommission == null)) {
    // Pedido sem o retrato do checkout: recalcula pela mesma função (config de agora), como computeMoneyFlow.
    const dist = await calculateOrderDistribution(subtotal, fee, order.storeId);
    if (storeAmount == null) storeAmount = dist.storeAmount;
    if (deliveryCommission == null) deliveryCommission = dist.delivery?.appCommission ?? 0;
  }
  const split = splitPaidOrder({
    direct,
    totalValue: total,
    deliveryFee: fee,
    walletApplied: base.walletApplied,
    cardChargedTotal: order.cardChargedTotal == null ? null : Number(order.cardChargedTotal),
    storeAmount: storeAmount ?? 0,
    commissionDelivery: deliveryCommission ?? 0,
    motoboyTransfer: transferAmount,
    motoboyShareDirect,
  });
  return {
    ...base,
    paidByCustomer: fromCents(split.inFromCustomers),
    storeShare: fromCents(split.toStores),
    motoboyShare: fromCents(split.toMotoboys),
    platformShare: fromCents(split.platform),
  };
}

export async function getAdminOrderDetail(orderId: string, can: PermissionCheck, now: Date = new Date()): Promise<AdminOrderDetail | null> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: ORDER_DETAIL_SELECT });
  if (!order) return null;
  const direct = isDirectOrder(order);
  const cancelled = (CANCELLED_ORDER_STATUSES as string[]).includes(order.status);

  const delivery = order.deliveryId
    ? await prisma.delivery.findUnique({ where: { id: order.deliveryId }, select: SAFE_DELIVERY_SELECT })
    : await prisma.delivery.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' }, select: SAFE_DELIVERY_SELECT });

  const seePayouts = can('payout:view');
  const seeShares = can('money:overview');

  const [motoboy, customerStats, cancellation, actions, payouts, transfer, directRefund, tx, config] = await Promise.all([
    delivery?.motoboyId ? loadMotoboy(delivery.motoboyId) : null,
    loadCustomerStats(order.customerId, now),
    prisma.cancellation.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' } }),
    prisma.adminOrderAction.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } }),
    seePayouts ? prisma.payout.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, recipientType: true, amount: true, status: true },
    }) : [],
    // O Pix ao motoboy entra na conta das partes (money:overview) e é exibido com payout:view.
    seePayouts || seeShares ? prisma.motoboyTransfer.findFirst({
      where: { orderId, reason: 'delivery' },
      orderBy: { createdAt: 'desc' },
      select: { status: true, amount: true },
    }) : null,
    direct ? prisma.directRefund.findUnique({ where: { orderId }, select: { status: true } }) : null,
    prisma.transaction.findFirst({ where: { orderId }, orderBy: { createdAt: 'asc' }, select: { commissionDelivery: true } }),
    getPlatformConfig(),
  ]);

  const names = await namesById([...actions.map((a) => a.actorId), ...(cancellation?.adminId ? [cancellation.adminId] : [])]);
  const money = await orderMoney(
    order,
    direct,
    tx ? Number(tx.commissionDelivery) : null,
    transfer ? Number(transfer.amount) : null,
    Number(config?.motoboyShareDirect ?? 100),
  );

  const custodyRefundOpen = !direct && !!cancellation && Number(cancellation.refundAmount ?? 0) > 0
    && (cancellation.refundStatus === 'pending' || cancellation.refundStatus === 'failed');
  const directRefundOpen = !!directRefund && directRefund.status !== 'done';

  const allowedActions: AdminOrderAllowedAction[] = [];
  // Devolução à loja esperando confirmação: o cancelamento daria 409 RETURN_IN_PROGRESS (P2), então não aparece.
  const returnInProgress = delivery?.statusDevolucao === 'aguardando_confirmacao';
  if (can('order:admin_cancel') && ADMIN_CANCELLABLE_STATUSES.includes(order.status) && !returnInProgress) allowedActions.push('cancel');
  if (can('order:reassign') && !cancelled && delivery?.status === 'assigned') allowedActions.push('reassign');

  return {
    id: order.id,
    shortId: shortOrderId(order.id),
    status: order.status,
    deliveryStatus: delivery?.status ?? null,
    settlementMode: direct ? 'direct' : 'custody',
    store: { id: order.store.id, name: order.store.name },
    customer: { id: order.customer.id, name: order.customer.name, ...customerStats },
    motoboy,
    timeline: buildTimeline([
      ['created', order.createdAt],
      ['paid', order.paidAt],
      ['accepted', order.acceptedAt],
      ['assigned', delivery?.assignedAt],
      ['picked', delivery?.pickedAt],
      cancelled ? ['cancelled', order.cancelledAt ?? cancellation?.createdAt ?? null] : ['delivered', delivery?.deliveredAt],
    ]),
    adminActions: actions.map((a) => ({
      id: a.id,
      action: a.action,
      actorName: names.get(a.actorId) ?? 'Usuário removido',
      reason: a.reason,
      faultParty: a.faultParty ?? null,
      at: a.createdAt.toISOString(),
    })),
    items: order.items.map((i) => ({
      name: i.product.name,
      quantity: i.quantity,
      unitPrice: Number(i.price),
      total: fromCents(toCents(i.price) * i.quantity),
    })),
    money: {
      ...money,
      // Paridade com as rotas irmãs: repasses pedem payout:view; as partes (e a receita do DROP que
      // sai por subtração) pedem money:overview.
      storeShare: seeShares ? money.storeShare : null,
      motoboyShare: seeShares ? money.motoboyShare : null,
      platformShare: seeShares ? money.platformShare : null,
      payouts: seePayouts
        ? payouts.map((p) => ({ id: p.id, recipientType: p.recipientType, amount: Number(p.amount), status: p.status }))
        : [],
      motoboyTransfer: seePayouts && transfer ? { status: transfer.status, amount: Number(transfer.amount) } : null,
    },
    cancellation: cancellation
      ? {
          cancelledBy: cancellation.cancelledBy,
          faultParty: cancellation.faultParty ?? null,
          reason: cancellation.reason,
          adminName: cancellation.adminId ? names.get(cancellation.adminId) ?? null : null,
          at: cancellation.createdAt.toISOString(),
          refundStatus: cancellation.refundStatus ?? 'pending',
        }
      : null,
    refundPending: custodyRefundOpen || directRefundOpen,
    allowedActions,
  };
}
