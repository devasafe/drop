import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/AppError';
import { pauseUntilTomorrowAt } from '../utils/storeOpen';
import type { StorePauseInput } from '../validation/storeSchemas';
import { isAdminPaused, STORE_ADMIN_PAUSED_SELLER_MESSAGE } from '../services/adminAccounts/storePause';
import logger from '../config/logger';

/**
 * D1 · pausa da loja pelo dono. Nada de job: vitrine e checkout leem `pausedUntil` na hora
 * (utils/storeOpen). Sem socket: o painel recarrega; regra do projeto: nenhum broadcast novo.
 * D3b-2a: com a loja pausada pelo DROP, o dono não pausa nem despausa (só o admin libera).
 */

/** D3b-2a: a pausa do DROP barrou o lojista. Carrega o motivo, que o errorHandler não repassaria. */
class StoreAdminPausedError extends AppError {
  readonly reason: string | null;

  constructor(reason: string | null) {
    super(STORE_ADMIN_PAUSED_SELLER_MESSAGE, 409, true, 'STORE_ADMIN_PAUSED');
    this.reason = reason;
    Object.setPrototypeOf(this, StoreAdminPausedError.prototype);
  }
}

/** Mesmo formato do errorHandler ({ success: false, error: { message, statusCode, code } }), mais o motivo. */
function sendAdminPaused(res: Response, err: StoreAdminPausedError) {
  return res.status(409).json({
    success: false,
    error: { message: err.message, statusCode: 409, code: err.code, reason: err.reason },
  });
}

async function ownedStore(req: AuthenticatedRequest) {
  const store = await prisma.store.findUnique({
    where: { id: String(req.params.id) },
    select: { id: true, ownerId: true, operatingHours: true, adminPausedAt: true, adminPauseReason: true },
  });
  if (!store) throw new AppError('Loja não encontrada', 404, true, 'STORE_NOT_FOUND');
  if (String(store.ownerId) !== String(req.user?.id ?? '')) {
    throw new AppError('Sem permissão para esta loja', 403, true, 'NOT_STORE_OWNER');
  }
  if (isAdminPaused(store)) throw new StoreAdminPausedError(store.adminPauseReason ?? null);
  return store;
}

/** Grava `pausedUntil` só se o DROP não pausou no meio (a pausa do admin vence a corrida). */
async function setPausedUntil(storeId: string, pausedUntil: Date | null) {
  const { count } = await prisma.store.updateMany({ where: { id: storeId, adminPausedAt: null }, data: { pausedUntil } });
  if (count === 0) {
    const paused = await prisma.store.findUnique({ where: { id: storeId }, select: { adminPauseReason: true } });
    throw new StoreAdminPausedError(paused?.adminPauseReason ?? null);
  }
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
    await setPausedUntil(store.id, pausedUntil);
    logger.info('Loja pausou os pedidos', { storeId: store.id, pausedUntil: pausedUntil.toISOString() });
    return res.json({ success: true, data: { pausedUntil: pausedUntil.toISOString() } });
  } catch (err) {
    if (err instanceof StoreAdminPausedError) return sendAdminPaused(res, err);
    return next(err);
  }
};

/** DELETE /stores/:id/pause — volta a receber pedidos agora → `{ pausedUntil: null }`. */
export const unpauseStore = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const store = await ownedStore(req);
    await setPausedUntil(store.id, null);
    logger.info('Loja tirou a pausa', { storeId: store.id });
    return res.json({ success: true, data: { pausedUntil: null } });
  } catch (err) {
    if (err instanceof StoreAdminPausedError) return sendAdminPaused(res, err);
    return next(err);
  }
};
