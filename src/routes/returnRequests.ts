import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middleware/auth';
import { requireActiveUser } from '../middleware/requireActive';
import { approveReturnRequest, rejectReturnRequest, chooseReturnMode, confirmReturnRequest, checkReturnFee } from '../controllers/returnRequestController';

/** Reembolso de pedido entregue (caso B). A dona da loja é conferida no controller; as rotas seguem o padrão das outras da loja. */
const router = Router();

router.post('/:id/approve', authenticate, requireActiveUser, authorizeRoles('lojista'), approveReturnRequest);
router.post('/:id/reject', authenticate, requireActiveUser, authorizeRoles('lojista'), rejectReturnRequest);
router.post('/:id/mode', authenticate, requireActiveUser, authorizeRoles('cliente'), chooseReturnMode);
router.post('/:id/fee/check', authenticate, requireActiveUser, authorizeRoles('cliente'), checkReturnFee);
router.post('/:id/confirm', authenticate, requireActiveUser, authorizeRoles('lojista'), confirmReturnRequest);

export default router;
