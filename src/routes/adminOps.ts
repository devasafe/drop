/**
 * D3b-1 · Operação ao vivo (spec 4). Leitura com operation:view.
 * Montado em /api/admin (src/app.ts), antes do router de admin.ts; não há rota igual lá.
 */
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { authorizePermission } from '../middleware/authorize';
import { getQueue } from '../controllers/adminOpsController';

const router = Router();
const canViewOps = authorizePermission('operation:view');

// GET /api/admin/queue — "Precisa de mim" (spec 3.1)
router.get('/queue', authenticate, canViewOps, getQueue);

export default router;
