import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/AppError';
import logger from '../config/logger';
import { isStoreOwner } from '../utils/storeOwnership';

/** Resposta pública da loja a uma avaliação: 1 a 500 caracteres (depois do trim). */
export const StoreReplySchema = z.object({
  text: z.string().trim().min(1, 'Escreva a resposta').max(500, 'A resposta pode ter até 500 caracteres'),
}).strict();

/**
 * PUT /api/stores/:id/ratings/:orderId/reply — só o dono da loja.
 * Uma resposta por avaliação, editável. Grava só se o pedido é DESTA loja e tem nota
 * (updateMany condicional: nunca responde pedido de outra loja nem pedido sem avaliação).
 */
export async function replyToStoreRating(req: any, res: Response) {
  const storeId = String(req.params.id);
  const orderId = String(req.params.orderId);
  if (!(await isStoreOwner(storeId, req.user?.id))) {
    throw new AppError('Sem permissão para esta loja', 403, true, 'FORBIDDEN');
  }
  const text: string = req.body.text;
  const storeRepliedAt = new Date();
  const r = await prisma.order.updateMany({
    where: { id: orderId, storeId, storeRating: { not: null } },
    data: { storeReply: text, storeRepliedAt },
  });
  if (r.count !== 1) throw new AppError('Avaliação não encontrada', 404, true, 'RATING_NOT_FOUND');
  logger.info('[ratings] loja respondeu avaliação', { storeId, orderId });
  return res.json({ success: true, data: { orderId, storeReply: text, storeRepliedAt } });
}

/**
 * DELETE /api/admin/ratings/:orderId/reply — moderação (permissão `reviews:moderate`).
 * Apaga só a resposta da loja; a nota e o comentário do cliente ficam.
 */
export async function deleteStoreRatingReply(req: any, res: Response) {
  const orderId = String(req.params.orderId);
  const r = await prisma.order.updateMany({
    where: { id: orderId, storeReply: { not: null } },
    data: { storeReply: null, storeRepliedAt: null },
  });
  if (r.count !== 1) throw new AppError('Resposta não encontrada', 404, true, 'REPLY_NOT_FOUND');
  logger.info('[ratings][AUDIT] resposta da loja removida pela moderação', { orderId, adminId: req.user?.id });
  return res.json({ success: true, data: { orderId, storeReply: null, storeRepliedAt: null } });
}
