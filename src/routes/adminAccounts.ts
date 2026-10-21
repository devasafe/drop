/**
 * D3b-2a · Pessoas e lojas (spec 5 e 6). Rotas finas: leem a entrada, chamam o serviço de
 * src/services/adminAccounts e traduzem AccountActionError ({ error, code }).
 * Montado em /api/admin (src/app.ts), depois de adminOps e antes do router de admin.ts.
 */
import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { authorizePermission } from '../middleware/authorize';
import logger from '../config/logger';
import { actorFromRequest } from '../services/adminMoneyAction.service';
import { sendAccountActionError } from '../services/adminAccounts/errors';
import { forgiveDebt } from '../services/adminAccounts/debt';

const router = Router();

/** Responde o resultado do serviço; AccountActionError vira { error, code }; o resto, 500 com log. */
export const handle = (label: string, fn: (req: any) => Promise<unknown>, okStatus = 200) =>
  async (req: any, res: Response) => {
    try {
      return res.status(okStatus).json(await fn(req));
    } catch (err) {
      if (sendAccountActionError(res, err)) return undefined;
      logger.error(`[adminAccounts] ${label}`, err as Error, { params: req.params });
      return res.status(500).json({ error: 'Não deu para concluir. Tente de novo.' });
    }
  };

// POST /api/admin/users/:id/debts/:debtId/forgive { reason } — perdoar dívida (spec 5.3)
router.post(
  '/users/:id/debts/:debtId/forgive',
  authenticate,
  authorizePermission('user:debt_forgive'),
  handle('falha ao perdoar a dívida', (req) =>
    forgiveDebt(String(req.params.id), String(req.params.debtId), actorFromRequest(req), req.body?.reason)),
);

export default router;
