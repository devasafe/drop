import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middleware/auth';
import { authorizePermission } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { catchAsync } from '../middleware/errorHandler';
import {
  listMyTransfers, listStoreTransfers, listAdminTransfers, retryTransfer, resolveTransfer, resolveTransferSchema,
} from '../controllers/motoboyTransfersController';

/** Montado em /api (caminhos completos): /motoboy/transfers, /stores/:storeId/transfers, /admin/transfers. */
const router = Router();

router.get('/motoboy/transfers', authenticate, authorizeRoles('motoboy'), catchAsync(listMyTransfers));
router.get('/stores/:storeId/transfers', authenticate, catchAsync(listStoreTransfers));
router.get('/admin/transfers', authenticate, authorizePermission('payout:view'), catchAsync(listAdminTransfers));
router.post('/admin/transfers/:id/retry', authenticate, authorizePermission('payout:release'), catchAsync(retryTransfer));
router.post('/admin/transfers/:id/resolve', authenticate, authorizePermission('payout:release'), validate(resolveTransferSchema), catchAsync(resolveTransfer));

export default router;
