/**
 * D3b-1 · P2 — ações do admin sobre o pedido (cancelar com culpa, reatribuir). Só lê a entrada
 * HTTP e chama o serviço; erros com code saem por sendMoneyActionError ({ error, code, ... }).
 */
import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import logger from '../config/logger';
import { actorFromRequest, sendMoneyActionError } from '../services/adminMoneyAction.service';
import { previewAdminCancel, adminCancelOrder } from '../services/adminOps/adminCancel';
import { adminReassignDelivery } from '../services/adminOps/reassign';

// GET /api/admin/orders/:id/cancel-preview?fault= (order:admin_cancel)
export const getAdminCancelPreview = async (req: AuthenticatedRequest, res: Response) => {
  try {
    return res.json(await previewAdminCancel(String(req.params.id), req.query.fault));
  } catch (err) {
    if (sendMoneyActionError(res, err)) return undefined;
    logger.error('[adminOps] falha na prévia do cancelamento', err as Error, { orderId: req.params.id });
    return res.status(500).json({ error: 'Erro ao calcular a prévia do cancelamento' });
  }
};

// POST /api/admin/orders/:id/cancel { fault, reason } (order:admin_cancel)
export const postAdminCancel = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await adminCancelOrder({
      orderId: String(req.params.id),
      fault: req.body?.fault,
      reason: req.body?.reason,
      actor: actorFromRequest(req),
    });
    return res.json(result);
  } catch (err) {
    if (sendMoneyActionError(res, err)) return undefined;
    logger.error('[adminOps] falha ao cancelar o pedido', err as Error, { orderId: req.params.id });
    return res.status(500).json({ error: 'Erro ao cancelar o pedido' });
  }
};

// POST /api/admin/orders/:id/reassign { reason } (order:reassign)
export const postAdminReassign = async (req: AuthenticatedRequest, res: Response) => {
  try {
    await adminReassignDelivery({ orderId: String(req.params.id), reason: req.body?.reason, actor: actorFromRequest(req) });
    return res.json({ ok: true });
  } catch (err) {
    if (sendMoneyActionError(res, err)) return undefined;
    logger.error('[adminOps] falha ao reatribuir o motoboy', err as Error, { orderId: req.params.id });
    return res.status(500).json({ error: 'Erro ao reatribuir o motoboy' });
  }
};
