import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/AppError';
import logger from '../config/logger';
import { emitToRoom } from '../utils/socketEmitter';

/** Depois do aceite e antes da retirada ("a caminho" é a Delivery em picked; ninguém grava 'enviado'). */
const READYABLE_STATUSES = ['pago', 'aguardando_motoboy'];

/**
 * POST /orders/:id/ready — a loja avisa que o pedido está pronto para retirada.
 * Grava `readyAt` UMA vez (updateMany condicional: só quem obtém count === 1 emite).
 * O aviso vai só para a sala do motoboy da entrega atribuída, sem PIN no payload.
 */
export async function markOrderReady(req: AuthenticatedRequest, res: Response) {
  const orderId = String(req.params.id);
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, storeId: true, status: true, acceptedAt: true, readyAt: true, deliveryId: true },
  });
  if (!order) throw new AppError('Pedido não encontrado', 404, true, 'ORDER_NOT_FOUND');
  const store = await prisma.store.findFirst({
    where: { id: String(order.storeId), ownerId: String(req.user?.id) },
    select: { id: true, name: true },
  });
  if (!store) throw new AppError('Este pedido não é da sua loja', 403, true, 'FORBIDDEN');
  if (order.readyAt) return res.json({ success: true, data: { readyAt: order.readyAt } });

  const readyAt = new Date();
  const { count } = await prisma.order.updateMany({
    where: { id: order.id, readyAt: null, acceptedAt: { not: null }, status: { in: READYABLE_STATUSES as any } },
    data: { readyAt },
  });
  if (count !== 1) {
    const fresh = await prisma.order.findUnique({ where: { id: order.id }, select: { readyAt: true } });
    if (fresh?.readyAt) return res.json({ success: true, data: { readyAt: fresh.readyAt } }); // outra requisição gravou antes
    throw new AppError(
      order.acceptedAt ? 'Este pedido não pode mais ser marcado como pronto' : 'Aceite o pedido antes de marcar como pronto',
      409, true, 'ORDER_NOT_READYABLE',
    );
  }

  if (order.deliveryId) {
    const delivery = await prisma.delivery.findUnique({
      where: { id: String(order.deliveryId) },
      select: { id: true, motoboyId: true, status: true },
    });
    if (delivery?.motoboyId && delivery.status === 'assigned') {
      emitToRoom(`user:${delivery.motoboyId}`, 'order:ready', {
        orderId: order.id,
        deliveryId: delivery.id,
        storeId: store.id,
        storeName: store.name,
        readyAt: readyAt.toISOString(),
      });
    }
  }
  logger.info('[order] loja marcou o pedido como pronto para retirada', { orderId: order.id, storeId: store.id });
  return res.json({ success: true, data: { readyAt } });
}
