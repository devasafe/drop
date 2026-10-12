import { Response } from 'express';
import { z } from 'zod';
import { AppError } from '../utils/AppError';
import { isStoreOwner } from '../utils/storeOwnership';
import { directMonthSummary } from '../services/asaasLoja/directSummary';

export const DirectSummaryQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use o mês no formato AAAA-MM').optional(),
});

/** GET /api/stores/:id/direct-summary?month=YYYY-MM — só o dono da loja. */
export async function getDirectSummary(req: any, res: Response) {
  const storeId = String(req.params.id);
  if (!(await isStoreOwner(storeId, req.user?.id))) {
    throw new AppError('Sem permissão para esta loja', 403, true, 'FORBIDDEN');
  }
  const data = await directMonthSummary(storeId, req.query.month as string | undefined);
  return res.json({ success: true, data });
}
