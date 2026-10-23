/** D3b-4a · histórico de Regras e taxas (spec 5.5). Montado em /api/admin/rules. */
import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { authorizePermission } from '../middleware/authorize';
import { ValidationError } from '../utils/AppError';
import logger from '../config/logger';
import { SP_DATE_RE } from '../services/moneyHistory.service';
import { RULE_HISTORY_FIELDS } from '../services/rules/platformConfigRules';
import { listRuleChanges } from '../services/rules/ruleHistory.service';

const router = Router();
const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);
const query = z.object({
  field: z.preprocess(emptyToUndefined, z.string().refine((f) => RULE_HISTORY_FIELDS.includes(f)).optional()),
  actorId: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(100).regex(/^[^\0]*$/).optional()),
  from: z.preprocess(emptyToUndefined, z.string().regex(SP_DATE_RE).optional()),
  to: z.preprocess(emptyToUndefined, z.string().regex(SP_DATE_RE).optional()),
  cursor: z.preprocess(emptyToUndefined, z.string().max(500).optional()),
});

router.get('/history', authenticate, authorizePermission('settings:manage'), async (req: any, res: Response) => {
  const parsed = query.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Filtro inválido' });
  try {
    return res.json(await listRuleChanges(parsed.data));
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    logger.error('admin/rules: falha ao carregar o histórico de regras', err as Error);
    return res.status(500).json({ error: 'Erro ao carregar o histórico de regras' });
  }
});

export default router;
