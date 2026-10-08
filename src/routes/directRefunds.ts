import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { authorizePermission } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { catchAsync } from '../middleware/errorHandler';
import { refundDirect, listDirectRefunds, resolveDirectRefund, resolveRefundSchema } from '../controllers/directRefundController';

/** Montado em /api (caminhos completos): /orders/:id/refund-direct e /admin/direct-refunds. */
const router = Router();

router.post('/orders/:id/refund-direct', authenticate, catchAsync(refundDirect));
router.get('/admin/direct-refunds', authenticate, authorizePermission('payout:view'), catchAsync(listDirectRefunds));
router.post('/admin/direct-refunds/:id/resolve', authenticate, authorizePermission('payout:release'), validate(resolveRefundSchema), catchAsync(resolveDirectRefund));

export default router;
