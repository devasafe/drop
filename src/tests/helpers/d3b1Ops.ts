/**
 * D3b-1 · dados de operação para as suítes da Operação ao vivo (fila, resumo, pedidos, detalhe e
 * mapa) e a limpeza do que o cleanupUsersByEmailDomain não alcança (Transaction, MotoboyTransfer,
 * DirectRefund, WithdrawalRequest, Payout por pedido, StoreSubscription, SupportTicket).
 * SupportTicket não tem dono por FK: as suítes gravam `conversationId` começando com `mark`.
 */
import { DeliveryStatus, OrderStatus, PaymentMethod, PaymentProviderName, PaymentStatus, Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ownerIdForStore } from './storeOwner';
import { cleanupUsersByEmailDomain } from './pgCleanup';

/** `m` minutos antes de `now`. */
export const minutesBefore = (now: Date, m: number) => new Date(now.getTime() - m * 60_000);

/** Loja com dono do domínio da suíte (o cleanup recolhe). Coordenadas em texto, como no Store. */
export async function createOpsStore(
  domain: string,
  data: { name?: string; latitude?: string; longitude?: string } = {},
): Promise<string> {
  const store = await prisma.store.create({
    data: {
      ownerId: await ownerIdForStore(domain),
      name: data.name ?? 'Loja Operação',
      plan: 2,
      isOpen: true,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
    },
  });
  return store.id;
}

export interface OpsDeliveryInput {
  status: DeliveryStatus;
  motoboyId?: string | null;
  createdAt?: Date;
  assignedAt?: Date | null;
  pickedAt?: Date | null;
  deliveredAt?: Date | null;
  pin?: string | null;
  pinRetirada?: string | null;
  storeLatitude?: number | null;
  storeLongitude?: number | null;
  rating?: number | null;
}

export interface OpsOrderInput {
  customerId: string;
  storeId: string;
  /** Padrão 'pago'. */
  status?: OrderStatus;
  /** Padrão 'paid'. */
  paymentStatus?: PaymentStatus;
  /** Padrão 'pix'. */
  paymentMethod?: PaymentMethod;
  /** Padrão 'asaas' (custódia). 'asaas_loja' = modo direto. */
  paymentProvider?: PaymentProviderName;
  /** Padrão 30. */
  totalValue?: number;
  /** Padrão 10. */
  deliveryFee?: number;
  /** Padrão totalValue − deliveryFee. */
  subtotal?: number;
  walletApplied?: number;
  /** walletDistribution.storeAmount (retrato do checkout); omitido = sem retrato. */
  storeAmount?: number;
  /** Cria a Transaction do pedido com esta commissionDelivery; omitido = sem Transaction. */
  commissionDelivery?: number;
  /** Padrão agora. */
  createdAt?: Date;
  /** Padrão = createdAt; null = não pago. */
  paidAt?: Date | null;
  acceptedAt?: Date | null;
  cancelledAt?: Date | null;
  awaitingCustomerPoolDecision?: boolean;
  /** Segundos, como Order.deliveryDuration. */
  deliveryDuration?: number | null;
  items?: { productId: string; quantity: number; price: number }[];
  /** Cria a entrega e grava Order.deliveryId. */
  delivery?: OpsDeliveryInput;
}

export interface OpsOrder {
  orderId: string;
  deliveryId: string | null;
}

export async function createOpsOrder(o: OpsOrderInput): Promise<OpsOrder> {
  const total = o.totalValue ?? 30;
  const fee = o.deliveryFee ?? 10;
  const createdAt = o.createdAt ?? new Date();
  const order = await prisma.order.create({
    data: {
      customerId: o.customerId,
      storeId: o.storeId,
      totalValue: total,
      deliveryFee: fee,
      subtotal: o.subtotal ?? Math.round((total - fee) * 100) / 100,
      status: o.status ?? 'pago',
      paymentStatus: o.paymentStatus ?? 'paid',
      paymentMethod: o.paymentMethod ?? 'pix',
      paymentProvider: o.paymentProvider ?? 'asaas',
      walletApplied: o.walletApplied ?? 0,
      walletDistribution: o.storeAmount == null ? undefined : { storeAmount: o.storeAmount, appCommission: 0, commissionPercent: 0 },
      createdAt,
      paidAt: o.paidAt === undefined ? createdAt : o.paidAt,
      acceptedAt: o.acceptedAt ?? null,
      cancelledAt: o.cancelledAt ?? null,
      awaitingCustomerPoolDecision: o.awaitingCustomerPoolDecision ?? false,
      deliveryDuration: o.deliveryDuration ?? null,
      ...(o.items ? { items: { create: o.items } } : {}),
    },
  });
  if (o.commissionDelivery != null) {
    await prisma.transaction.create({
      data: { orderId: order.id, paymentMethod: 'pix', amount: total, commissionProduct: 0, commissionDelivery: o.commissionDelivery },
    });
  }
  if (!o.delivery) return { orderId: order.id, deliveryId: null };

  const d = o.delivery;
  const delivery = await prisma.delivery.create({
    data: {
      orderId: order.id,
      status: d.status,
      fee,
      distance: 3,
      motoboyId: d.motoboyId ?? null,
      createdAt: d.createdAt ?? new Date(),
      assignedAt: d.assignedAt ?? null,
      pickedAt: d.pickedAt ?? null,
      deliveredAt: d.deliveredAt ?? null,
      pin: d.pin ?? null,
      pinRetirada: d.pinRetirada ?? null,
      storeLatitude: d.storeLatitude ?? null,
      storeLongitude: d.storeLongitude ?? null,
      rating: d.rating ?? null,
    },
  });
  await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });
  return { orderId: order.id, deliveryId: delivery.id };
}

/**
 * Troca as permissões de um papel em Permissões (RolePermissions) por exatamente `permissions` e
 * devolve a função que restaura o estado anterior. Chamar a restauração num `finally`.
 */
export async function grantRolePermissions(role: Role, permissions: string[]): Promise<() => Promise<void>> {
  const previous = await prisma.rolePermissions.findUnique({ where: { role } });
  await prisma.rolePermissions.upsert({
    where: { role },
    create: { role, permissions, updatedBy: 'test' },
    update: { permissions },
  });
  return async () => {
    if (previous) {
      await prisma.rolePermissions.update({
        where: { role },
        data: { permissions: previous.permissions, notificationTargets: previous.notificationTargets, updatedBy: previous.updatedBy },
      });
    } else {
      await prisma.rolePermissions.deleteMany({ where: { role } });
    }
  };
}

/** Limpa as linhas de operação da suíte e, por último, os usuários/lojas/pedidos do domínio. */
export async function cleanupOpsFixtures(domain: string, mark: string): Promise<void> {
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
  await prisma.motoboyTransfer.deleteMany({
    where: { OR: [{ storeId: { in: storeIds } }, { motoboyId: { in: userIds } }, { orderId: { in: orderIds } }] },
  });
  await prisma.directRefund.deleteMany({ where: { OR: [{ storeId: { in: storeIds } }, { orderId: { in: orderIds } }] } });
  await prisma.withdrawalRequest.deleteMany({ where: { motoboyId: { in: userIds } } });
  await prisma.payout.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.storeSubscription.deleteMany({ where: { storeId: { in: storeIds } } });
  await prisma.supportTicket.deleteMany({ where: { conversationId: { startsWith: mark } } });
  await cleanupUsersByEmailDomain(domain);
}
