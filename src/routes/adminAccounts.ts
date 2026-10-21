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
import { extendTrial } from '../services/adminAccounts/saas';
import { listUsers, getUser, getUserTimeline, listStores, getStore, getStoreTimeline } from '../controllers/adminAccountsReadController';

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

// D3b-2b · POST /api/admin/stores/:id/saas/extend-trial { days: 7|14|30, reason } — estender o teste (spec 9)
router.post(
  '/stores/:id/saas/extend-trial',
  authenticate,
  authorizePermission('plan:manage'),
  handle('falha ao estender o teste da mensalidade', (req) =>
    extendTrial(String(req.params.id), actorFromRequest(req), req.body?.days, req.body?.reason)),
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

// D3b-2a · P2.2 — ficha e histórico da pessoa (spec 6)
router.get('/users/:id/timeline', authenticate, authorizePermission('user:view_all'), getUserTimeline);
router.get('/users/:id', authenticate, authorizePermission('user:view_all'), getUser);

// D3b-2a · P2.3 — lista de lojas: atenção primeiro, cursor composto (spec 6).
// /stores/saas-billing e /stores/asaas são servidos antes, pelos routers montados em
// /api/admin/stores (app.ts:124 e :126); d3b2a.p2.3.storesList.test.ts cobra isso.
router.get('/stores', authenticate, authorizePermission('store:view_all'), listStores);

// D3b-2a · P2.4 — ficha e histórico da loja (spec 6). Não capturam /stores/saas-billing nem
// /stores/asaas: esses são servidos antes, em app.ts:124 e :126 (teste em d3b2a.p2.4).
router.get('/stores/:id/timeline', authenticate, authorizePermission('store:view_all'), getStoreTimeline);
router.get('/stores/:id', authenticate, authorizePermission('store:view_all'), getStore);

export default router;
