/**
 * D3b-2a · leituras de Pessoas e Lojas (spec 6). Só valida a entrada e chama src/services/adminAccounts.
 * Leitura que falha responde 500 com a mensagem (nunca lista vazia no lugar do erro).
 * Erros no formato das rotas admin atuais: { error: <mensagem>, code }.
 */
import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import logger from '../config/logger';
import { AppError } from '../utils/AppError';
import { sendAccountActionError } from '../services/adminAccounts/errors';
import { listAdminUsers, USER_LIST_TABS } from '../services/adminAccounts/users';
import { UserListTab } from '../services/adminAccounts/types';

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
