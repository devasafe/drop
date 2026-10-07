import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { catchAsync } from '../middleware/errorHandler';
import {
  connectSchema,
  checklistSchema,
  putAsaas,
  getAsaas,
  deleteAsaas,
  listAsaasStores,
  postChecklist,
  postAuthToken,
  postTest,
} from '../controllers/storeAsaasController';

/**
 * Montado em /api/admin/stores. Trocar a conta Asaas de uma loja redireciona o dinheiro dela:
 * só o CEO (activeRole), sem permissão delegável. Mesmos handlers do lojista, outro guard.
 * Registrar ANTES de adminRoutes em app.ts não é necessário: o prefixo /stores não colide.
 */
const router = Router({ mergeParams: true });

router.use(authenticate, authorizeRoles('ceo'));

router.get('/asaas', catchAsync(listAsaasStores));

router.put('/:storeId/asaas', validate(connectSchema), catchAsync(putAsaas));
router.get('/:storeId/asaas', catchAsync(getAsaas));
router.delete('/:storeId/asaas', catchAsync(deleteAsaas));
router.post('/:storeId/asaas/checklist', validate(checklistSchema), catchAsync(postChecklist));
router.post('/:storeId/asaas/auth-token', catchAsync(postAuthToken));
router.post('/:storeId/asaas/test', catchAsync(postTest));

export default router;
