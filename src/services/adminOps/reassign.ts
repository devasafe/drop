/**
 * D3b-1 · P2.5 — reatribuir motoboy (spec 4.3). Só com a entrega 'assigned' (antes da
 * retirada). A entrega volta ao pool com createdAt = agora (decisão do usuário: o raio recomeça e o
 * pool timeout não dispara logo em seguida), o motoboy
 * entra em excludedMotoboyIds e não recebe a corrida de novo. Sem punição: nenhum
 * Cancellation, multa ou ponto. O efeito reaproveita o reassign do deliveryTimeout.job.
 */
import { prisma } from '../../lib/prisma';
import logger from '../../config/logger';
import { MoneyActionError, AdminMoneyActor } from '../adminMoneyAction.service';
import {
  emitAdminOrderChanged, emitDeliveryCreated, emitDeliveryStatusChanged, emitToRoom,
} from '../../utils/socketEmitter';
import { notifyStore, notifyUser, STORE_LINKS } from '../storeNotify';
import { normalizeAdminReason } from './adminReason';

const CLOSED_ORDER_STATUSES = ['entregue', 'cancelado', 'rejeitado'];

export async function adminReassignDelivery(input: { orderId: string; reason: unknown; actor: AdminMoneyActor }): Promise<void> {
  const reason = normalizeAdminReason(input.reason);
  const order = await prisma.order.findUnique({
    where: { id: String(input.orderId) },
    select: { id: true, status: true, storeId: true, customerId: true, deliveryId: true },
  });
  if (!order) throw new MoneyActionError(404, 'ORDER_NOT_FOUND', 'Pedido não encontrado');
  const delivery = order.deliveryId ? await prisma.delivery.findUnique({ where: { id: order.deliveryId } }) : null;
  if (!delivery || delivery.status !== 'assigned' || !delivery.motoboyId || CLOSED_ORDER_STATUSES.includes(order.status)) {
    throw new MoneyActionError(409, 'DELIVERY_NOT_REASSIGNABLE', 'Só dá para reatribuir com o motoboy indo à loja, antes da retirada.', {
      currentStatus: delivery?.status ?? 'none',
    });
  }
  const previousMotoboyId = delivery.motoboyId;
  const backToPoolAt = new Date();

  // Mesma ordem de travas do claim e do cancelamento: pedido (FOR UPDATE) → entrega.
  const won = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ status: string }[]>`SELECT status::text AS status FROM "Order" WHERE id = ${order.id} FOR UPDATE`;
    if (!rows.length || CLOSED_ORDER_STATUSES.includes(rows[0].status)) return false;
    const { count } = await tx.delivery.updateMany({
      where: { id: delivery.id, status: 'assigned', motoboyId: previousMotoboyId },
      data: {
        status: 'pending', motoboyId: null, assignedAt: null, createdAt: backToPoolAt,
        pin: null, pinRetirada: null, pinDevolucao: null, pinFailedAttempts: 0, pinLockedUntil: null,
        excludedMotoboyIds: { push: previousMotoboyId },
      },
    });
    if (count !== 1) return false;
    await tx.order.updateMany({
      where: { id: order.id, status: { in: ['pago', 'aguardando_motoboy'] } },
      data: { status: 'aguardando_motoboy' },
    });
    await tx.adminOrderAction.create({
      data: {
        orderId: order.id, action: 'reassign', actorId: input.actor.id, actorRole: input.actor.role, reason,
        details: { deliveryId: delivery.id, previousMotoboyId },
      },
    });
    return true;
  });
  if (!won) {
    const fresh = await prisma.delivery.findUnique({ where: { id: delivery.id }, select: { status: true } });
    const currentStatus = fresh?.status ?? 'none';
    throw new MoneyActionError(409, 'DELIVERY_CHANGED', currentStatus === 'picked' ? 'O motoboy já retirou o pedido.' : 'A entrega mudou. Recarregue.', { currentStatus });
  }

  const shortId = order.id.slice(-6);
  logger.info('[adminReassign] corrida devolvida ao pool', { orderId: order.id, deliveryId: delivery.id, actorId: input.actor.id });

  // Motoboy que saiu: sino + push e o evento direto. delivery:status_changed faz o app reler a
  // corrida (o GET passa a 403) e tirar a tela.
  await notifyUser(previousMotoboyId, {
    title: 'Corrida passada para outro motoboy',
    message: `A corrida #${shortId} foi passada para outro motoboy.`,
    link: '/motoboy',
    entityId: delivery.id,
    type: 'order',
    tag: `corrida-${delivery.id}`,
  });
  emitToRoom(`user:${previousMotoboyId}`, 'delivery:you_were_reassigned', {
    deliveryId: delivery.id,
    orderId: order.id,
    message: `A corrida #${shortId} foi passada para outro motoboy.`,
  });
  emitDeliveryStatusChanged({ _id: delivery.id, orderId: order.id, status: 'pending' });

  await notifyStore(order.storeId, {
    title: 'Buscando outro motoboy',
    message: `O suporte do DROP passou o pedido #${shortId} para outro motoboy. Estamos buscando um novo entregador.`,
    link: STORE_LINKS.order(order.id),
    entityId: order.id,
    type: 'order',
    tag: 'pedido-motoboy',
  });

  // O pool recebe a oferta de novo pelo emissor existente.
  emitDeliveryCreated({
    _id: delivery.id, orderId: order.id, distance: delivery.distance, fee: Number(delivery.fee), createdAt: backToPoolAt,
    excludedMotoboyIds: [...(delivery.excludedMotoboyIds ?? []), previousMotoboyId],
  });
  emitAdminOrderChanged(order.id, 'aguardando_motoboy');
}
