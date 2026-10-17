/**
 * D3b-3 · P3 — dados de dinheiro para as suítes da Visão geral e do Histórico, e a limpeza do
 * que o cleanupUsersByEmailDomain não alcança (Transaction, MotoboyTransfer, DirectRefund,
 * WithdrawalRequest, AppCashboxEntry, Withdrawal, StoreSubscription).
 * Linhas sem dono por usuário (AppCashboxEntry, Withdrawal do caixa) levam `reason = mark`.
 */
import { AppCashboxEntryType, AppCashboxSource, OrderStatus, PaymentProviderName, PaymentStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ensureAppCashbox } from '../../repositories/appCashbox.repository';
import { ownerIdForStore } from './storeOwner';
import { cleanupUsersByEmailDomain } from './pgCleanup';

/** Loja com dono do domínio da suíte (o cleanup recolhe). `plan` padrão 2 (entrega integrada). */
export async function createMoneyStore(domain: string, data: { name?: string; plan?: number } = {}): Promise<string> {
  const store = await prisma.store.create({
    data: { ownerId: await ownerIdForStore(domain), name: data.name ?? 'Loja Dinheiro', plan: data.plan ?? 2, isOpen: true },
  });
  return store.id;
}

export interface MoneyOrderInput {
  customerId: string;
  storeId: string;
  totalValue: number;
  deliveryFee?: number;
  subtotal?: number | null;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  paidAt?: Date | null;
  paymentProvider?: PaymentProviderName;
  walletApplied?: number;
  cardChargedTotal?: number | null;
  /** walletDistribution.storeAmount; omitido = pedido sem retrato (cai no recálculo). */
  storeAmount?: number | null;
  /** Transaction.commissionDelivery; omitido = sem Transaction (cai no recálculo). */
  commissionDelivery?: number | null;
}

/** Pedido pago (por padrão: custódia, `pago`, `paid`, `paidAt` agora). Devolve o id. */
export async function createMoneyOrder(o: MoneyOrderInput): Promise<string> {
  const fee = o.deliveryFee ?? 0;
  const order = await prisma.order.create({
    data: {
      customerId: o.customerId,
      storeId: o.storeId,
      totalValue: o.totalValue,
      deliveryFee: fee,
      subtotal: o.subtotal === undefined ? Math.round((o.totalValue - fee) * 100) / 100 : o.subtotal,
      status: o.status ?? 'pago',
      paymentStatus: o.paymentStatus ?? 'paid',
      paidAt: o.paidAt === undefined ? new Date() : o.paidAt,
      paymentProvider: o.paymentProvider ?? 'asaas',
      walletApplied: o.walletApplied ?? 0,
      cardChargedTotal: o.cardChargedTotal ?? null,
      walletDistribution: o.storeAmount == null ? undefined : { storeAmount: o.storeAmount, appCommission: 0, commissionPercent: 0 },
    },
  });
  if (o.commissionDelivery != null) {
    await prisma.transaction.create({
      data: { orderId: order.id, paymentMethod: 'pix', amount: o.totalValue, commissionProduct: 0, commissionDelivery: o.commissionDelivery },
    });
  }
  return order.id;
}

/** Lançamento no caixa com data escolhida (não mexe no saldo do caixa). Devolve o id. */
export async function createCashboxEntry(
  mark: string,
  e: { type: AppCashboxEntryType; source: AppCashboxSource; amount: number; createdAt: Date; orderId?: string; withdrawalId?: string },
): Promise<string> {
  const box = await ensureAppCashbox();
  const row = await prisma.appCashboxEntry.create({ data: { appCashboxId: box.id, ...e, reason: mark } });
  return row.id;
}

/** Limpa as linhas de dinheiro da suíte e, por último, os usuários/lojas/pedidos do domínio. */
export async function cleanupMoneyFixtures(domain: string, mark: string): Promise<void> {
  const users = await prisma.user.findMany({ where: { email: { endsWith: domain } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const stores = await prisma.store.findMany({ where: { ownerId: { in: userIds } }, select: { id: true } });
  const storeIds = stores.map((s) => s.id);
  const orders = await prisma.order.findMany({
    where: { OR: [{ customerId: { in: userIds } }, { storeId: { in: storeIds } }] },
    select: { id: true },
  });
  const orderIds = orders.map((o) => o.id);

  await prisma.transaction.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.motoboyTransfer.deleteMany({ where: { OR: [{ storeId: { in: storeIds } }, { motoboyId: { in: userIds } }] } });
  await prisma.directRefund.deleteMany({ where: { OR: [{ storeId: { in: storeIds } }, { orderId: { in: orderIds } }] } });
  await prisma.withdrawalRequest.deleteMany({ where: { motoboyId: { in: userIds } } });
  await prisma.appCashboxEntry.deleteMany({ where: { reason: mark } });
  await prisma.withdrawal.deleteMany({ where: { reason: mark } });
  await prisma.storeSubscription.deleteMany({ where: { storeId: { in: storeIds } } });
  await cleanupUsersByEmailDomain(domain);
}
