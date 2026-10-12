import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/AppError';
import { pauseUntilTomorrowAt } from '../utils/storeOpen';
import type { StorePauseInput } from '../validation/storeSchemas';
import logger from '../config/logger';

/**
 * D1 · pausa da loja pelo dono. Nada de job: vitrine e checkout leem `pausedUntil` na hora
 * (utils/storeOpen). Sem socket: o painel recarrega; regra do projeto: nenhum broadcast novo.
 */

async function ownedStore(req: AuthenticatedRequest) {
  const store = await prisma.store.findUnique({
    where: { id: String(req.params.id) },
    select: { id: true, ownerId: true, operatingHours: true },
  });
  if (!store) throw new AppError('Loja não encontrada', 404, true, 'STORE_NOT_FOUND');
  if (String(store.ownerId) !== String(req.user?.id ?? '')) {
    throw new AppError('Sem permissão para esta loja', 403, true, 'NOT_STORE_OWNER');
  }
  return store;
}

/** PUT /stores/:id/pause — `{ minutes: 30|60|120 }` ou `{ untilTomorrow: true }` → `{ pausedUntil }`. */
export const pauseStore = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const store = await ownedStore(req);
    const body = req.body as StorePauseInput;
    const now = new Date();
    const pausedUntil = 'untilTomorrow' in body
      ? pauseUntilTomorrowAt(store, now)
      : new Date(now.getTime() + (body as { minutes: number }).minutes * 60_000);
    await prisma.store.update({ where: { id: store.id }, data: { pausedUntil } });
    logger.info('Loja pausou os pedidos', { storeId: store.id, pausedUntil: pausedUntil.toISOString() });
    return res.json({ success: true, data: { pausedUntil: pausedUntil.toISOString() } });
  } catch (err) {
    return next(err);
  }
};

/** DELETE /stores/:id/pause — volta a receber pedidos agora → `{ pausedUntil: null }`. */
export const unpauseStore = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const store = await ownedStore(req);
    await prisma.store.update({ where: { id: store.id }, data: { pausedUntil: null } });
    logger.info('Loja tirou a pausa', { storeId: store.id });
    return res.json({ success: true, data: { pausedUntil: null } });
  } catch (err) {
    return next(err);
  }
};
