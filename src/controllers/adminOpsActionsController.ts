/**
 * D3b-1 · P2 — ações do admin sobre o pedido (cancelar com culpa, reatribuir). Só lê a entrada
 * HTTP e chama o serviço; erros com code saem por sendMoneyActionError ({ error, code, ... }).
 */
import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import logger from '../config/logger';
import { sendMoneyActionError } from '../services/adminMoneyAction.service';
import { previewAdminCancel } from '../services/adminOps/adminCancel';

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
