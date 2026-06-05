import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middleware/auth';
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

// CEO - Ver saques pendentes
router.get('/pending', authenticate, authorizeRoles('ceo'), getPendingWithdrawals);

// CEO - Ver todos os saques
router.get('/all', authenticate, authorizeRoles('ceo'), getAllWithdrawals);

// CEO - Aprovar saque
router.post('/approve', authenticate, authorizeRoles('ceo'), approveWithdrawal);

// CEO - Rejeitar saque
router.post('/reject', authenticate, authorizeRoles('ceo'), rejectWithdrawal);

// CEO - Ver carteira CEO
router.get('/ceo-wallet', authenticate, authorizeRoles('ceo'), getCEOWallet);

// CEO - Config de auto-aprovação
router.get('/admin/config', authenticate, authorizeRoles('ceo'), getWithdrawalConfig);
router.put('/admin/config', authenticate, authorizeRoles('ceo'), toggleAutoApproveWithdrawals);

export default router;
