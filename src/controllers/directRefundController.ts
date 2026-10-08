import { Response } from 'express';
import { z } from 'zod';
import { DirectRefund } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/AppError';
import logger from '../config/logger';
import { isStoreOwner } from '../utils/storeOwnership';
import { getEffectivePermissions } from './rolePermissionsController';
import { executeDirectRefund, markDirectRefundDone } from '../services/asaasLoja/refund';

/** Task 3.4 — botão "Estornar" (loja e admin) do pedido no modo direto. */

export const resolveRefundSchema = z.object({
  note: z.string().trim().min(10, 'Informe uma nota com pelo menos 10 caracteres'),
});

/** Só o necessário para a UI: nunca chave da loja nem o id da cobrança no Asaas. */
export function serializeDirectRefund(r: DirectRefund) {
  return {
    id: r.id,
    orderId: r.orderId,
    storeId: r.storeId,
    status: r.status,
    amount: Number(r.amount),
    attempts: r.attempts,
    lastError: r.lastError,
    nextAttemptAt: r.nextAttemptAt,
    resolvedBy: r.resolvedBy,
    doneAt: r.doneAt,
    createdAt: r.createdAt,
  };
}

async function hasAdminPermission(user: any, permission: string): Promise<boolean> {
  const role = user?.activeRole || user?.role;
  if (role === 'ceo') return true;
  if (!role) return false;
  try {
    const { permissions } = await getEffectivePermissions(role);
    return permissions.includes('*') || permissions.includes(permission);
  } catch {
    return false; // fail closed
  }
}

/** POST /api/orders/:id/refund-direct */
export async function refundDirect(req: any, res: Response) {
  const userId = req.user?.id;
  const orderId = String(req.params.id);
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { storeId: true } });
  if (!order) throw new AppError('Estorno não encontrado', 404, true, 'REFUND_NOT_FOUND');

  const owner = await isStoreOwner(order.storeId, userId);
  const admin = !owner && (await hasAdminPermission(req.user, 'payout:release'));
  if (!owner && !admin) throw new AppError('Sem permissão para estornar este pedido', 403, true, 'FORBIDDEN');

  const refund = await prisma.directRefund.findUnique({ where: { orderId } });
  if (!refund) throw new AppError('Estorno não encontrado', 404, true, 'REFUND_NOT_FOUND');

  switch (refund.status) {
    case 'done': throw new AppError('Este estorno já foi concluído', 409, true, 'REFUND_ALREADY_DONE');
    case 'uncertain': throw new AppError('Resultado incerto no Asaas — aguardando conferência do admin', 409, true, 'REFUND_UNCERTAIN');
    case 'requested': throw new AppError('O estorno já está em andamento', 409, true, 'REFUND_IN_PROGRESS');
    case 'failed_final':
      if (!admin) throw new AppError('Estorno esgotou as tentativas: apenas o admin pode reabrir', 409, true, 'REFUND_FINAL_ADMIN_ONLY');
      // Reabre com claim condicional: só um admin concorrente passa.
      {
        const { count } = await prisma.directRefund.updateMany({
          where: { id: refund.id, status: 'failed_final' },
          data: { status: 'failed', nextAttemptAt: new Date() },
        });
        if (count !== 1) throw new AppError('O estorno já está em andamento', 409, true, 'REFUND_IN_PROGRESS');
        logger.info('[refund][AUDIT]', { refundId: refund.id, orderId, adminId: userId, action: 'reopen' });
      }
      break;
    default: break; // pending | failed
  }

  await executeDirectRefund(refund.id);
  const fresh = await prisma.directRefund.findUnique({ where: { id: refund.id } });
  return res.json({ success: true, data: serializeDirectRefund(fresh!) });
}

/** GET /api/admin/direct-refunds?status= */
export async function listDirectRefunds(req: any, res: Response) {
  const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined;
  const rows = await prisma.directRefund.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const stores = await prisma.store.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.storeId))] } },
    select: { id: true, name: true },
  });
  const names = new Map(stores.map((s) => [s.id, s.name]));
  return res.json({ success: true, data: rows.map((r) => ({ ...serializeDirectRefund(r), storeName: names.get(r.storeId) ?? null })) });
}

/** POST /api/admin/direct-refunds/:id/resolve — admin conferiu no Asaas e marca como concluído. */
export async function resolveDirectRefund(req: any, res: Response) {
  const adminId = req.user?.id;
  const { note } = req.body as z.infer<typeof resolveRefundSchema>;
  const refund = await prisma.directRefund.findUnique({ where: { id: String(req.params.id) } });
  if (!refund) throw new AppError('Estorno não encontrado', 404, true, 'REFUND_NOT_FOUND');
  if (refund.status === 'done') throw new AppError('Este estorno já foi concluído', 409, true, 'REFUND_ALREADY_DONE');
  if (refund.status === 'requested') throw new AppError('O estorno já está em andamento', 409, true, 'REFUND_IN_PROGRESS');

  const marked = await markDirectRefundDone(refund.orderId, 'admin', { actorId: adminId, note });
  if (!marked) throw new AppError('Este estorno já foi concluído', 409, true, 'REFUND_ALREADY_DONE');
  logger.info('[refund][AUDIT]', { refundId: refund.id, orderId: refund.orderId, adminId, note });

  const fresh = await prisma.directRefund.findUnique({ where: { id: refund.id } });
  return res.json({ success: true, data: serializeDirectRefund(fresh!) });
}
