/**
 * D3b-1 · Operação ao vivo (spec 4.1). Só valida a entrada e chama os serviços de
 * src/services/adminOps. Leitura que falha responde 500 com a mensagem (nunca zero no lugar do erro).
 */
import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import logger from '../config/logger';
import { AppError } from '../utils/AppError';
import { buildQueue } from '../services/adminOps/queue';
import { getOpsSummary } from '../services/adminOps/summary';
import { permissionCheckFor, readOpsLimits } from '../services/adminOps/common';

/** Erro de entrada conhecido (AppError < 500) → status + { error, code }; o resto → 500 com log. */
function sendOpsReadFailure(res: Response, err: unknown, what: string) {
  if (err instanceof AppError && err.statusCode < 500) {
    return res.status(err.statusCode).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
  }
  logger.error(`admin/ops: falha ao carregar ${what}`, err as Error);
  return res.status(500).json({ error: `Erro ao carregar ${what}`, code: 'OPS_READ_FAILED' });
}

// GET /api/admin/queue — "Precisa de mim" (spec 3.1)
export const getQueue = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [can, limits] = await Promise.all([permissionCheckFor(req.user), readOpsLimits()]);
    return res.json(await buildQueue({ now: new Date(), limits, can }));
  } catch (err) {
    return sendOpsReadFailure(res, err, 'a fila');
  }
};

// GET /api/admin/ops/summary — KPIs de hoje, pedidos por hora e saúde (spec 3.1)
export const getSummary = async (_req: AuthenticatedRequest, res: Response) => {
  try {
    return res.json(await getOpsSummary());
  } catch (err) {
    return sendOpsReadFailure(res, err, 'o resumo de hoje');
  }
};
