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
import { listAdminOrders, ORDERS_FILTERS } from '../services/adminOps/orders';
import { OpsMapResponse, OrdersFilter } from '../services/adminOps/types';
import { getAdminOrderDetail } from '../services/adminOps/orderDetail';
import { getOpsMap } from '../services/adminOps/map';
import { storesWithoutCourier } from '../services/adminOps/couriersNear';
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

const invalidFilter = (res: Response) => res.status(400).json({ error: 'Filtro inválido', code: 'INVALID_FILTER' });

// GET /api/admin/orders?filtro=&storeId=&cursor= — Pedidos ao vivo (spec 3.2)
export const listOrders = async (req: AuthenticatedRequest, res: Response) => {
  const rawFilter = req.query.filtro;
  const filter = rawFilter === undefined || rawFilter === '' ? 'atencao' : rawFilter;
  if (typeof filter !== 'string' || !(ORDERS_FILTERS as readonly string[]).includes(filter)) return invalidFilter(res);
  const rawStore = req.query.storeId;
  if (rawStore !== undefined && rawStore !== '' && (typeof rawStore !== 'string' || rawStore.length > 64)) return invalidFilter(res);
  const storeId = typeof rawStore === 'string' && rawStore ? rawStore : undefined;
  const cursor = typeof req.query.cursor === 'string' && req.query.cursor ? req.query.cursor : undefined;
  try {
    return res.json(await listAdminOrders({ filter: filter as OrdersFilter, storeId, cursor }));
  } catch (err) {
    return sendOpsReadFailure(res, err, 'os pedidos');
  }
};

// GET /api/admin/orders/:id — Pedido · visão do admin (spec 3.3)
export const getOrderDetail = async (req: AuthenticatedRequest, res: Response) => {
  const id = String(req.params.id ?? '');
  try {
    const can = await permissionCheckFor(req.user);
    const detail = id && id.length <= 64 ? await getAdminOrderDetail(id, can) : null;
    if (!detail) return res.status(404).json({ error: 'Pedido não encontrado', code: 'ORDER_NOT_FOUND' });
    return res.json(detail);
  } catch (err) {
    return sendOpsReadFailure(res, err, 'o pedido');
  }
};

// GET /api/admin/ops/map — Mapa ao vivo (spec 3.4)
export const getMap = async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const now = new Date();
    const [map, noCourier] = await Promise.all([getOpsMap(now), storesWithoutCourier(now)]);
    const body: OpsMapResponse = { ...map, storesWithoutCourier: noCourier };
    return res.json(body);
  } catch (err) {
    return sendOpsReadFailure(res, err, 'o mapa');
  }
};
