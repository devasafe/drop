import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middleware/auth';
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

// Lojista/Motoboy - Ver meus payouts
router.get('/my', authenticate, authorizeRoles('motoboy', 'lojista', 'seller'), getMyPayouts);

// Admin/CEO - Ver todos os payouts
router.get('/admin', authenticate, authorizeRoles('ceo'), getAdminPayouts);

// Admin/CEO - Obrigações pendentes
router.get('/admin/obligations', authenticate, authorizeRoles('ceo'), getPendingObligations);

// Admin/CEO - Liberar payout manualmente
router.post('/admin/:id/release', authenticate, authorizeRoles('ceo'), releasePayoutManually);

// Admin/CEO - Marcar payouts como pagos
router.post('/admin/mark-paid', authenticate, authorizeRoles('ceo'), markPayoutsPaid);

// Admin/CEO - Bloquear/desbloquear payout
router.post('/admin/:id/block', authenticate, authorizeRoles('ceo'), blockPayout);
router.post('/admin/:id/unblock', authenticate, authorizeRoles('ceo'), unblockPayout);

// Admin/CEO - Config de auto-aprovação
router.get('/admin/config', authenticate, authorizeRoles('ceo'), getPayoutConfig);
router.put('/admin/config', authenticate, authorizeRoles('ceo'), toggleAutoApprove);

export default router;
