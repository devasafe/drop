import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middleware/auth';
import { authorizePermission } from '../middleware/authorize';
import { requireActiveUser } from '../middleware/requireActive';
import {
  requestWithdrawal,
  requestUserWithdrawal,
  getPendingWithdrawals,
  getAllWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  getMyWithdrawals,
  getCEOWallet,
  toggleAutoApproveWithdrawals,
  getWithdrawalConfig,
} from '../controllers/withdrawalController';

const router = Router();

// Motoboy/Lojista - Solicitar saque
router.post('/request', authenticate, requireActiveUser, authorizeRoles('motoboy', 'lojista', 'seller'), requestWithdrawal);

// User (cliente/lojista) - Saque a partir do user balance
router.post('/request-user', authenticate, requireActiveUser, requestUserWithdrawal);

// Motoboy - Ver seus saques
router.get('/my-withdrawals', authenticate, authorizeRoles('motoboy', 'lojista', 'seller'), getMyWithdrawals);

// Admin - Ver saques pendentes
router.get('/pending', authenticate, authorizePermission('withdrawal:view'), getPendingWithdrawals);

// Admin - Ver todos os saques
router.get('/all', authenticate, authorizePermission('withdrawal:view'), getAllWithdrawals);

// Admin - Aprovar saque
router.post('/approve', authenticate, authorizePermission('withdrawal:approve'), approveWithdrawal);

// Admin - Rejeitar saque
router.post('/reject', authenticate, authorizePermission('withdrawal:approve'), rejectWithdrawal);

// Admin - Ver carteira CEO
router.get('/ceo-wallet', authenticate, authorizePermission('withdrawal:view'), getCEOWallet);

// Admin - Config de auto-aprovação
router.get('/admin/config', authenticate, authorizePermission('withdrawal:view'), getWithdrawalConfig);
router.put('/admin/config', authenticate, authorizePermission('withdrawal:config'), toggleAutoApproveWithdrawals);

export default router;
