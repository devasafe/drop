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
import { pauseStoreByAdmin, unpauseStoreByAdmin } from '../services/adminAccounts/storePause';
import { addStoreNote, addUserNote } from '../services/adminAccounts/notes';
import { listUsers } from '../controllers/adminAccountsReadController';

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

// POST /api/admin/stores/:id/pause { reason } — pausar a loja (spec 5.4)
router.post(
  '/stores/:id/pause',
  authenticate,
  authorizePermission('store:edit'),
  handle('falha ao pausar a loja', (req) => pauseStoreByAdmin(String(req.params.id), actorFromRequest(req), req.body?.reason)),
);

// POST /api/admin/stores/:id/unpause { reason? } — liberar a loja (spec 5.4)
router.post(
  '/stores/:id/unpause',
  authenticate,
  authorizePermission('store:edit'),
  handle('falha ao liberar a loja', (req) => unpauseStoreByAdmin(String(req.params.id), actorFromRequest(req), req.body?.reason)),
);

// POST /api/admin/users/:id/notes { text } — nota interna na ficha da pessoa (só acréscimo)
router.post(
  '/users/:id/notes',
  authenticate,
  authorizePermission('user:view_all'),
  handle('falha ao gravar a nota da pessoa', (req) => addUserNote(String(req.params.id), actorFromRequest(req), req.body?.text), 201),
);

// POST /api/admin/stores/:id/notes { text } — nota interna na ficha da loja (só acréscimo)
router.post(
  '/stores/:id/notes',
  authenticate,
  authorizePermission('store:view_all'),
  handle('falha ao gravar a nota da loja', (req) => addStoreNote(String(req.params.id), actorFromRequest(req), req.body?.text), 201),
);

// D3b-2a · P2.1 — lista de pessoas: busca no servidor, abas, "Com dívida" e cursor (spec 6)
router.get('/users', authenticate, authorizePermission('user:view_all'), listUsers);

export default router;
