import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { publicStoreVisibilityWhere } from '../services/catalog/visibility';
import { getDeliveryConfig } from '../services/deliveryQuote/config';
import { estimateQuote, resolvePlan1FreeMany } from '../services/deliveryQuote/quote';

export const StoreQuotesSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  storeIds: z
    .array(z.string().trim().min(1).max(64))
    .min(1)
    .max(50)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'storeIds repetidos' }),
});

/**
 * POST /stores/quotes — cotação em lote dos cards da vitrine (pública).
 * Só ESTIMATIVA (reta × desvio, sem custo de rota): é exibição; a taxa cobrada sai da rota
 * real no createOrder. Aplica os mesmos filtros da vitrine (`listStores`): KYC e mensalidade,
 * com AND. Loja invisível ou inexistente fica de fora da resposta (não é erro).
 */
export const quoteStores = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { latitude, longitude, storeIds } = req.body as z.infer<typeof StoreQuotesSchema>;

    const where = { AND: [{ id: { in: storeIds } }, await publicStoreVisibilityWhere()] };

    const [stores, deliveryCfg] = await Promise.all([
      prisma.store.findMany({
        where,
        select: {
          id: true, latitude: true, longitude: true, deliveryRadiusKm: true,
          prepMinutes: true, isOpen: true, operatingHours: true, pausedUntil: true, openOverrideUntil: true, adminPausedAt: true,
        },
      }),
      getDeliveryConfig(),
    ]);
    // Plano por loja numa consulta só (no modo direto nem consulta: false para todas).
    const plan1Free = await resolvePlan1FreeMany(stores.map((s) => s.id));

    const byId = new Map(stores.map((s) => [s.id, s]));
    const point = { lat: latitude, lng: longitude };
    const now = new Date();
    const data = storeIds
      .filter((id) => byId.has(id))
      .map((id) => estimateQuote(byId.get(id)!, point, { ...deliveryCfg, plan1Free: plan1Free.get(id) ?? false }, now));

    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};
