/**
 * D3b-1 · Operação ao vivo (spec 4). Leitura com operation:view.
 * Montado em /api/admin (src/app.ts), antes do router de admin.ts; não há rota igual lá.
 */
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { authorizePermission } from '../middleware/authorize';
import { getQueue, getSummary, listOrders, getOrderDetail, getMap } from '../controllers/adminOpsController';
import { getAdminCancelPreview, postAdminCancel } from '../controllers/adminOpsActionsController';

const router = Router();
const canViewOps = authorizePermission('operation:view');

// GET /api/admin/queue — "Precisa de mim" (spec 3.1)
router.get('/queue', authenticate, canViewOps, getQueue);

// GET /api/admin/ops/summary — KPIs de hoje, pedidos por hora e "Saúde agora" (spec 3.1)
router.get('/ops/summary', authenticate, canViewOps, getSummary);

// GET /api/admin/ops/map — Mapa ao vivo (spec 3.4)
router.get('/ops/map', authenticate, canViewOps, getMap);

// GET /api/admin/orders?filtro=&storeId=&cursor= — Pedidos ao vivo (spec 3.2)
router.get('/orders', authenticate, canViewOps, listOrders);

// GET /api/admin/orders/:id — Pedido · visão do admin (spec 3.3); PIN, CPF e e-mail nunca saem
router.get('/orders/:id', authenticate, canViewOps, getOrderDetail);

// D3b-1 · P2.2 — prévia do cancelamento do admin por culpa
router.get('/orders/:id/cancel-preview', authenticate, authorizePermission('order:admin_cancel'), getAdminCancelPreview);

// D3b-1 · P2.3 — cancelar com estorno, com culpa
router.post('/orders/:id/cancel', authenticate, authorizePermission('order:admin_cancel'), postAdminCancel);

export default router;
