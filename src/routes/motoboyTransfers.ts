import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middleware/auth';
import { authorizePermission } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { catchAsync } from '../middleware/errorHandler';
import {
  listMyTransfers, listStoreTransfers, listAdminTransfers, retryTransfer, resolveTransfer, resolveTransferSchema,
  retryStoreTransfer, revealTransferPixKey,
} from '../controllers/motoboyTransfersController';

/** Montado em /api (caminhos completos): /motoboy/transfers, /stores/:storeId/transfers, /admin/transfers. */
const router = Router();

router.get('/motoboy/transfers', authenticate, authorizeRoles('motoboy'), catchAsync(listMyTransfers));
router.get('/stores/:storeId/transfers', authenticate, catchAsync(listStoreTransfers));
// D1: "Tentar agora" do Pix parado (dono; 1 a cada 5 min → 429 RETRY_TOO_SOON)
router.post('/stores/:storeId/transfers/:transferId/retry', authenticate, catchAsync(retryStoreTransfer));
router.get('/admin/transfers', authenticate, authorizePermission('payout:view'), catchAsync(listAdminTransfers));
router.post('/admin/transfers/:id/retry', authenticate, authorizePermission('payout:release'), catchAsync(retryTransfer));
// D3b-1: "Ver chave" do Pix manual do DROP (auditado em motoboy_transfer_pix_reveal)
router.get('/admin/transfers/:id/pix-key', authenticate, authorizePermission('payout:release'), catchAsync(revealTransferPixKey));
router.post('/admin/transfers/:id/resolve', authenticate, authorizePermission('payout:release'), validate(resolveTransferSchema), catchAsync(resolveTransfer));

export default router;
