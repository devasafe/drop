import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { catchAsync } from '../middleware/errorHandler';
import {
  requireStoreOwner,
  connectSchema,
  checklistSchema,
  putAsaas,
  getAsaas,
  postChecklist,
  postAuthToken,
  postTest,
} from '../controllers/storeAsaasController';

// Montado em /api/stores/:storeId/asaas — conexão da conta Asaas própria da loja (modo direto).
const router = Router({ mergeParams: true });

router.use(authenticate, authorizeRoles('lojista'), requireStoreOwner);

router.put('/', validate(connectSchema), catchAsync(putAsaas));
router.get('/', catchAsync(getAsaas));
router.post('/checklist', validate(checklistSchema), catchAsync(postChecklist));
router.post('/auth-token', catchAsync(postAuthToken));
router.post('/test', catchAsync(postTest));

export default router;
