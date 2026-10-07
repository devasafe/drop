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
 *
 * O guard vai em CADA rota (não em `router.use`): um `router.use` aqui interceptaria qualquer
 * /api/admin/stores/* — inclusive rotas futuras de outros routers — e devolveria 401/403 antes
 * de o Express procurar o handler certo. Assim, só os caminhos abaixo exigem CEO; o resto
 * segue adiante (e cai em 404 se ninguém responder).
 */
const router = Router({ mergeParams: true });

const ceoOnly = [authenticate, authorizeRoles('ceo')];

router.get('/asaas', ...ceoOnly, catchAsync(listAsaasStores));

router.put('/:storeId/asaas', ...ceoOnly, validate(connectSchema), catchAsync(putAsaas));
router.get('/:storeId/asaas', ...ceoOnly, catchAsync(getAsaas));
router.delete('/:storeId/asaas', ...ceoOnly, catchAsync(deleteAsaas));
router.post('/:storeId/asaas/checklist', ...ceoOnly, validate(checklistSchema), catchAsync(postChecklist));
router.post('/:storeId/asaas/auth-token', ...ceoOnly, catchAsync(postAuthToken));
router.post('/:storeId/asaas/test', ...ceoOnly, catchAsync(postTest));

export default router;
