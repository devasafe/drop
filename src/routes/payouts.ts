import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middleware/auth';
import { authorizePermission } from '../middleware/authorize';
import {
  getMyPayouts,
  getAdminPayouts,
  releasePayoutManually,
  markPayoutsPaid,
  getPendingObligations,
  blockPayout,
  unblockPayout,
  toggleAutoApprove,
  getPayoutConfig,
} from '../controllers/payoutController';

const router = Router();

// Lojista/Motoboy - Ver meus payouts (papel-base, segue por papel)
router.get('/my', authenticate, authorizeRoles('motoboy', 'lojista', 'seller'), getMyPayouts);

// Admin - Ver todos os payouts
router.get('/admin', authenticate, authorizePermission('payout:view'), getAdminPayouts);

// Admin - Obrigações pendentes
router.get('/admin/obligations', authenticate, authorizePermission('payout:view'), getPendingObligations);

// Admin - Liberar payout manualmente
router.post('/admin/:id/release', authenticate, authorizePermission('payout:release'), releasePayoutManually);

// Admin - Marcar payouts como pagos
router.post('/admin/mark-paid', authenticate, authorizePermission('payout:mark_paid'), markPayoutsPaid);

// Admin - Bloquear/desbloquear payout
router.post('/admin/:id/block', authenticate, authorizePermission('payout:block'), blockPayout);
router.post('/admin/:id/unblock', authenticate, authorizePermission('payout:block'), unblockPayout);

// Admin - Config de auto-aprovação
router.get('/admin/config', authenticate, authorizePermission('payout:view'), getPayoutConfig);
router.put('/admin/config', authenticate, authorizePermission('payout:config'), toggleAutoApprove);

export default router;
