/**
 * D3b-3 · Visão geral do Dinheiro e Histórico (spec 7 e 8). Só leitura, permissão money:overview.
 * Montado em /api/admin/money (src/app.ts).
 */
import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { authorizePermission } from '../middleware/authorize';
import { ValidationError } from '../utils/AppError';
import logger from '../config/logger';
import { getMoneySummary } from '../services/moneyOverview.service';

const router = Router();

/** Filtro/cursor inválido → 400; o resto → 500 com log (fail closed: nunca zero no lugar do erro). */
function sendReadFailure(res: Response, err: unknown, what: string) {
  if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
  logger.error(`admin/money: falha ao carregar ${what}`, err as Error);
  return res.status(500).json({ error: `Erro ao carregar ${what}` });
}

// GET /api/admin/money/summary — cartões e "Para onde foi o dinheiro hoje" (spec 7.1 e 7.3)
router.get('/summary', authenticate, authorizePermission('money:overview'), async (_req: any, res: Response) => {
  try {
    return res.json(await getMoneySummary());
  } catch (err) {
    return sendReadFailure(res, err, 'a visão geral do dinheiro');
  }
});

export default router;
