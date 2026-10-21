/**
 * D3b-2a · leituras de Pessoas e Lojas (spec 6). Só valida a entrada e chama src/services/adminAccounts.
 * Leitura que falha responde 500 com a mensagem (nunca lista vazia no lugar do erro).
 * Erros no formato das rotas admin atuais: { error: <mensagem>, code }.
 */
import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import logger from '../config/logger';
import { AppError } from '../utils/AppError';
import { sendAccountActionError, userNotFound } from '../services/adminAccounts/errors';
import { listAdminUsers, USER_LIST_TABS } from '../services/adminAccounts/users';
import { StoreListFilter, UserListTab } from '../services/adminAccounts/types';
import { listAdminStores, STORE_LIST_FILTERS } from '../services/adminAccounts/stores';
import { activeRoleOf } from './rolePermissionsController';
import { permissionCheckFor } from '../services/adminOps/common';
import { getAdminUserDetail, userTimeline } from '../services/adminAccounts/userDetail';

/** Erro de entrada conhecido (< 500) → status + { error, code }; o resto → 500 com log. */
function sendReadFailure(res: Response, err: unknown, what: string) {
  // AccountActionError da P1 (inclui o 400 INVALID_CURSOR de listTimeline e os 404 de errors.ts).
  if (sendAccountActionError(res, err)) return undefined;
  if (err instanceof AppError && err.statusCode < 500) {
    return res.status(err.statusCode).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
  }
  logger.error(`admin/accounts: falha ao carregar ${what}`, err as Error);
  return res.status(500).json({ error: `Erro ao carregar ${what}`, code: 'ACCOUNTS_READ_FAILED' });
}

const invalidFilter = (res: Response) => res.status(400).json({ error: 'Filtro inválido', code: 'INVALID_FILTER' });
const queryText = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

// GET /api/admin/users?q=&tab=&withDebt=&cursor=&limit= — lista de pessoas (spec 6)
export const listUsers = async (req: AuthenticatedRequest, res: Response) => {
  const rawTab = req.query.tab;
  const tab = rawTab === undefined || rawTab === '' ? 'all' : rawTab;
  if (typeof tab !== 'string' || !(USER_LIST_TABS as readonly string[]).includes(tab)) return invalidFilter(res);
  const rawQ = req.query.q;
  if (rawQ !== undefined && typeof rawQ !== 'string') return invalidFilter(res);
  try {
    return res.json(await listAdminUsers({
      q: typeof rawQ === 'string' ? rawQ : '',
      tab: tab as UserListTab,
      withDebt: req.query.withDebt === '1',
      cursor: queryText(req.query.cursor),
      limit: queryText(req.query.limit),
    }));
  } catch (err) {
    return sendReadFailure(res, err, 'as pessoas');
  }
};

const idParam = (req: AuthenticatedRequest): string | null => {
  const id = String(req.params.id ?? '');
  return id && id.length <= 64 ? id : null;
};

// GET /api/admin/users/:id — ficha da pessoa (spec 6)
export const getUser = async (req: AuthenticatedRequest, res: Response) => {
  const id = idParam(req);
  try {
    const can = await permissionCheckFor(req.user);
    const detail = id
      ? await getAdminUserDetail(id, { id: String(req.user?.id ?? ''), isCeo: activeRoleOf(req.user) === 'ceo', can })
      : null;
    if (!detail) return sendReadFailure(res, userNotFound(), 'a ficha da pessoa');
    return res.json(detail);
  } catch (err) {
    return sendReadFailure(res, err, 'a ficha da pessoa');
  }
};

// GET /api/admin/users/:id/timeline?cursor= — histórico da pessoa (spec 6)
export const getUserTimeline = async (req: AuthenticatedRequest, res: Response) => {
  const id = idParam(req);
  try {
    const page = id ? await userTimeline(id, queryText(req.query.cursor)) : null;
    if (!page) return sendReadFailure(res, userNotFound(), 'o histórico da pessoa');
    return res.json(page);
  } catch (err) {
    return sendReadFailure(res, err, 'o histórico da pessoa');
  }
};

// GET /api/admin/stores?q=&filter=&cursor=&limit= — lista de lojas (spec 6)
export const listStores = async (req: AuthenticatedRequest, res: Response) => {
  const rawFilter = req.query.filter;
  const filter = rawFilter === undefined || rawFilter === '' ? 'all' : rawFilter;
  if (typeof filter !== 'string' || !(STORE_LIST_FILTERS as readonly string[]).includes(filter)) return invalidFilter(res);
  const rawQ = req.query.q;
  if (rawQ !== undefined && typeof rawQ !== 'string') return invalidFilter(res);
  try {
    return res.json(await listAdminStores({
      q: typeof rawQ === 'string' ? rawQ : '',
      filter: filter as StoreListFilter,
      cursor: queryText(req.query.cursor),
      limit: queryText(req.query.limit),
    }));
  } catch (err) {
    return sendReadFailure(res, err, 'as lojas');
  }
};
