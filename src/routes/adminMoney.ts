/**
 * D3b-3 · Visão geral do Dinheiro e Histórico (spec 7 e 8). Só leitura, permissão money:overview.
 * Montado em /api/admin/money (src/app.ts).
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { authorizePermission } from '../middleware/authorize';
import { ValidationError } from '../utils/AppError';
import logger from '../config/logger';
import { getMoneySummary, listMoneyMovements, MONEY_MOVEMENT_TYPES } from '../services/moneyOverview.service';

const router = Router();

/** `?type=` vazio vale como "sem filtro". */
const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

const movementsQuery = z.object({
  type: z.preprocess(emptyToUndefined, z.enum(MONEY_MOVEMENT_TYPES).optional()),
  cursor: z.preprocess(emptyToUndefined, z.string().max(500).optional()),
});

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

// GET /api/admin/money/movements?type=&cursor= — movimentos de hoje, 50 por página (spec 7.2)
router.get('/movements', authenticate, authorizePermission('money:overview'), async (req: any, res: Response) => {
  const parsed = movementsQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Filtro inválido', details: parsed.error.flatten().fieldErrors });
  try {
    return res.json(await listMoneyMovements(parsed.data));
  } catch (err) {
    return sendReadFailure(res, err, 'os movimentos de hoje');
  }
});

export default router;
