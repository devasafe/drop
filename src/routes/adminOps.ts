/**
 * D3b-1 · Operação ao vivo (spec 4). Leitura com operation:view.
 * Montado em /api/admin (src/app.ts), antes do router de admin.ts; não há rota igual lá.
 */
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { authorizePermission } from '../middleware/authorize';
import { getQueue, getSummary, listOrders } from '../controllers/adminOpsController';

const router = Router();
const canViewOps = authorizePermission('operation:view');

// GET /api/admin/queue — "Precisa de mim" (spec 3.1)
router.get('/queue', authenticate, canViewOps, getQueue);

// GET /api/admin/ops/summary — KPIs de hoje, pedidos por hora e "Saúde agora" (spec 3.1)
router.get('/ops/summary', authenticate, canViewOps, getSummary);

// GET /api/admin/orders?filtro=&storeId=&cursor= — Pedidos ao vivo (spec 3.2)
router.get('/orders', authenticate, canViewOps, listOrders);

export default router;
