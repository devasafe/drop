import { Response } from 'express';
import { Prisma, ReturnReason } from '@prisma/client';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../lib/prisma';
import logger from '../config/logger';
import { emitToRoom } from '../utils/socketEmitter';
import { isDirectOrder } from '../utils/settlement';
import { uploadToCloudinary } from '../utils/cloudinary';
import { isValidImageBuffer } from '../middleware/upload';
import { generatePin, pinLockMinutesLeft, pinLockedResponse } from '../services/pinGuard';
import { notifyStore, notifyUser, STORE_LINKS } from '../services/storeNotify';
import { CUSTOMER_LINKS } from '../services/customerNotify';
import {
  RETURN_REASONS, RETURN_REASON_LABEL, RETURN_REJECT_REASONS,
  returnRefund, serializeReturnRequest, settleReturnRefund, registerReturnPinFailure,
} from '../services/returnRequest';

const code = (id: string) => String(id).slice(-6).toUpperCase();
const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
const firstName = (name?: string | null) => String(name || '').split(' ')[0] || 'O cliente';

/** Pedido do cliente que pode ter reembolso: entregue, pago e do modo SaaS (o estorno sai da loja). */
async function loadOwnedDeliveredOrder(orderId: string, customerId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, customerId: true, storeId: true, status: true, paymentStatus: true, paymentProvider: true, totalValue: true, deliveryFee: true, deliveryId: true },
  });
  if (!order) return { error: { status: 404, body: { error: 'Pedido não encontrado' } } } as const;
  if (order.customerId !== customerId) return { error: { status: 403, body: { error: 'Permissão negada' } } } as const;
  if (order.status !== 'entregue' || order.paymentStatus !== 'paid' || !isDirectOrder(order)) {
    return { error: { status: 409, body: { error: 'Este pedido não pode ter reembolso pelo app. Fale com o suporte.', code: 'RETURN_NOT_AVAILABLE' } } } as const;
  }
  const delivery = order.deliveryId
    ? await prisma.delivery.findUnique({ where: { id: order.deliveryId }, select: { deliveredAt: true } })
    : null;
  return { order, deliveredAt: delivery?.deliveredAt ?? null } as const;
}

/** GET /orders/:id/return-request/preview — quanto volta em cada motivo. */
export const previewReturnRequest = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const loaded = await loadOwnedDeliveredOrder(String(req.params.id), String(req.user?.id));
    if ('error' in loaded) return res.status(loaded.error.status).json(loaded.error.body);
    const amounts = Object.fromEntries(RETURN_REASONS.map((r) => [r, returnRefund(loaded.order, loaded.deliveredAt, r).amount]));
    return res.json({ amounts });
  } catch (err) {
    logger.error('Erro na prévia do reembolso', err as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/** POST /orders/:id/return-request (multipart: reason, note?, photo?) — cliente pede o reembolso. */
export const createReturnRequest = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const customerId = String(req.user?.id);
    const reason = String(req.body?.reason || '') as ReturnReason;
    if (!RETURN_REASONS.includes(reason)) return res.status(400).json({ error: 'Motivo inválido', code: 'INVALID_REASON' });
    const note = typeof req.body?.note === 'string' && req.body.note.trim() ? req.body.note.trim().slice(0, 500) : null;

    const loaded = await loadOwnedDeliveredOrder(String(req.params.id), customerId);
    if ('error' in loaded) return res.status(loaded.error.status).json(loaded.error.body);
    const { order, deliveredAt } = loaded;

    if (await prisma.returnRequest.findUnique({ where: { orderId: order.id }, select: { id: true } })) {
      return res.status(409).json({ error: 'Já existe um pedido de reembolso para este pedido', code: 'RETURN_EXISTS' });
    }

    let photoUrl: string | null = null;
    const file = (req as any).file as { buffer: Buffer } | undefined;
    if (file) {
      if (!isValidImageBuffer(file.buffer)) return res.status(400).json({ error: 'Imagem inválida' });
      photoUrl = await uploadToCloudinary(file.buffer, 'drop/reembolsos');
    }

    const { amount, includesDeliveryFee } = returnRefund(order, deliveredAt, reason);
    let rr;
    try {
      rr = await prisma.returnRequest.create({
        data: {
          orderId: order.id, customerId, storeId: order.storeId, reason, note, photoUrl,
          amount: new Prisma.Decimal(amount.toFixed(2)), includesDeliveryFee,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return res.status(409).json({ error: 'Já existe um pedido de reembolso para este pedido', code: 'RETURN_EXISTS' });
      }
      throw err;
    }

    const customer = await prisma.user.findUnique({ where: { id: customerId }, select: { name: true } });
    void notifyStore(order.storeId, {
      title: 'Pedido de reembolso',
      message: `${firstName(customer?.name)} pediu reembolso do pedido #${code(order.id)}: ${RETURN_REASON_LABEL[reason]}.`,
      link: STORE_LINKS.order(order.id),
      entityId: order.id,
      tag: 'reembolso',
    });
    emitToRoom(`store:${order.storeId}`, 'order:updated', { orderId: order.id });

    return res.status(201).json(serializeReturnRequest(rr, 'customer'));
  } catch (err) {
    logger.error('Erro ao pedir reembolso', err as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/** GET /orders/:id/return-request — o pedido de reembolso para o cliente ou para a loja (null se não há). */
export const getReturnRequest = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = String(req.user?.id);
    const order = await prisma.order.findUnique({ where: { id: String(req.params.id) }, select: { id: true, customerId: true, store: { select: { ownerId: true } } } });
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
    const viewer = order.customerId === userId ? 'customer' : order.store?.ownerId === userId ? 'store' : null;
    if (!viewer) return res.status(403).json({ error: 'Permissão negada' });
    const rr = await prisma.returnRequest.findUnique({ where: { orderId: order.id } });
    return res.json(rr ? serializeReturnRequest(rr, viewer) : null);
  } catch (err) {
    logger.error('Erro ao ler pedido de reembolso', err as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/** O pedido de reembolso e se quem chama é a dona da loja. */
async function loadForStore(id: string, userId: string) {
  const rr = await prisma.returnRequest.findUnique({ where: { id } });
  if (!rr) return { error: { status: 404, body: { error: 'Pedido de reembolso não encontrado' } } } as const;
  const store = await prisma.store.findUnique({ where: { id: rr.storeId }, select: { ownerId: true, name: true } });
  if (!store || store.ownerId !== userId) return { error: { status: 403, body: { error: 'Permissão negada' } } } as const;
  return { rr, store } as const;
}

/** Move de um estado para outro só se ainda estiver nele (um toque só vale uma vez). */
async function transition(id: string, from: string, data: Prisma.ReturnRequestUpdateInput) {
  const { count } = await prisma.returnRequest.updateMany({ where: { id, status: from as any }, data: data as any });
  return count === 1 ? prisma.returnRequest.findUnique({ where: { id } }) : null;
}

const conflict = (res: Response) => res.status(409).json({ error: 'Este pedido de reembolso já mudou. Atualize a tela.', code: 'RETURN_STATE_CHANGED' });

/** POST /return-requests/:id/approve — a loja aprova. */
export const approveReturnRequest = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const loaded = await loadForStore(String(req.params.id), String(req.user?.id));
    if ('error' in loaded) return res.status(loaded.error.status).json(loaded.error.body);
    const updated = await transition(loaded.rr.id, 'aguardando_loja', { status: 'aprovado', decidedAt: new Date() });
    if (!updated) return conflict(res);
    void notifyUser(updated.customerId, {
      title: 'Reembolso aprovado',
      message: `A ${loaded.store.name} aprovou o seu reembolso. Escolha como devolver o produto.`,
      link: CUSTOMER_LINKS.order(updated.orderId),
      entityId: updated.orderId,
      tag: 'reembolso',
    });
    emitToRoom(`user:${updated.customerId}`, 'return:updated', { orderId: updated.orderId, status: updated.status });
    return res.json(serializeReturnRequest(updated, 'store'));
  } catch (err) {
    logger.error('Erro ao aprovar reembolso', err as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/** POST /return-requests/:id/reject { reasonCode } — a loja recusa com um motivo da lista. */
export const rejectReturnRequest = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const reasonCode = String(req.body?.reasonCode || '');
    if (!RETURN_REJECT_REASONS[reasonCode]) return res.status(400).json({ error: 'Motivo inválido', code: 'INVALID_REASON' });
    const loaded = await loadForStore(String(req.params.id), String(req.user?.id));
    if ('error' in loaded) return res.status(loaded.error.status).json(loaded.error.body);
    const updated = await transition(loaded.rr.id, 'aguardando_loja', { status: 'recusado', rejectReasonCode: reasonCode, decidedAt: new Date() });
    if (!updated) return conflict(res);
    void notifyUser(updated.customerId, {
      title: 'Reembolso recusado',
      message: `A ${loaded.store.name} recusou o reembolso: ${RETURN_REJECT_REASONS[reasonCode]}. Se não concordar, fale com o suporte pelo pedido.`,
      link: CUSTOMER_LINKS.order(updated.orderId),
      entityId: updated.orderId,
      tag: 'reembolso',
    });
    emitToRoom(`user:${updated.customerId}`, 'return:updated', { orderId: updated.orderId, status: updated.status });
    return res.json(serializeReturnRequest(updated, 'store'));
  } catch (err) {
    logger.error('Erro ao recusar reembolso', err as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/** POST /return-requests/:id/mode { mode } — o cliente escolhe como devolver. Fase 1: só "levo na loja". */
export const chooseReturnMode = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const mode = String(req.body?.mode || '');
    if (mode !== 'loja') return res.status(400).json({ error: 'Por enquanto a devolução é levando o produto na loja.', code: 'MODE_NOT_AVAILABLE' });
    const rr = await prisma.returnRequest.findUnique({ where: { id: String(req.params.id) } });
    if (!rr) return res.status(404).json({ error: 'Pedido de reembolso não encontrado' });
    if (rr.customerId !== String(req.user?.id)) return res.status(403).json({ error: 'Permissão negada' });
    const updated = await transition(rr.id, 'aprovado', { status: 'devolvendo', mode: 'loja', pin: generatePin(5), pinFailedAttempts: 0, pinLockedUntil: null });
    if (!updated) return conflict(res);
    emitToRoom(`store:${updated.storeId}`, 'order:updated', { orderId: updated.orderId });
    return res.json(serializeReturnRequest(updated, 'customer'));
  } catch (err) {
    logger.error('Erro ao escolher como devolver', err as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/** POST /return-requests/:id/confirm { pin } — a loja recebeu o produto: confere o PIN e estorna. */
export const confirmReturnRequest = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = String(req.user?.id);
    const loaded = await loadForStore(String(req.params.id), userId);
    if ('error' in loaded) return res.status(loaded.error.status).json(loaded.error.body);
    const { rr } = loaded;
    if (rr.status !== 'devolvendo') return conflict(res);

    const lockedFor = pinLockMinutesLeft(rr);
    if (lockedFor) return res.status(429).json(pinLockedResponse(lockedFor));
    if (!req.body?.pin || String(req.body.pin) !== rr.pin) {
      await registerReturnPinFailure(rr.id);
      return res.status(400).json({ error: 'Código de devolução não confere', code: 'INVALID_PIN' });
    }

    const done = await transition(rr.id, 'devolvendo', { status: 'concluido', completedAt: new Date(), pin: null, pinFailedAttempts: 0, pinLockedUntil: null });
    if (!done) return conflict(res);

    const refundStatus = await settleReturnRefund(done, userId);
    void notifyUser(done.customerId, {
      title: 'Produto devolvido',
      message: `A loja recebeu o produto. O estorno de ${brl(Number(done.amount))} foi pedido e volta pelo Pix que você usou.`,
      link: CUSTOMER_LINKS.order(done.orderId),
      entityId: done.orderId,
      tag: 'reembolso',
    });
    emitToRoom(`user:${done.customerId}`, 'return:updated', { orderId: done.orderId, status: done.status });
    return res.json({ ...serializeReturnRequest(done, 'store'), refundStatus });
  } catch (err) {
    logger.error('Erro ao confirmar a devolução', err as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
