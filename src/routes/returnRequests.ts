import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middleware/auth';
import { requireActiveUser } from '../middleware/requireActive';
import { approveReturnRequest, rejectReturnRequest, chooseReturnMode, confirmReturnRequest } from '../controllers/returnRequestController';

/** Reembolso de pedido entregue (caso B). A dona da loja é conferida no controller. */
const router = Router();

router.post('/:id/approve', authenticate, approveReturnRequest);
router.post('/:id/reject', authenticate, rejectReturnRequest);
router.post('/:id/mode', authenticate, requireActiveUser, authorizeRoles('cliente'), chooseReturnMode);
router.post('/:id/confirm', authenticate, confirmReturnRequest);

export default router;
