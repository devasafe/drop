import { Router } from 'express';
import { requireCustodyOrLeftover } from '../middleware/requireSettlement';
import { authenticate, authorizeRoles } from '../middleware/auth';
import { authorizePermission } from '../middleware/authorize';
import { requireActiveUser } from '../middleware/requireActive';
import { validate } from '../middleware/validate';
import { z } from 'zod';
import {
  requestWithdrawal,
  requestUserWithdrawal,
  getPendingWithdrawals,
  getAllWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  resolveUncertainWithdrawal,
  getMyWithdrawals,
  getCEOWallet,
  toggleAutoApproveWithdrawals,
  getWithdrawalConfig,
} from '../controllers/withdrawalController';

const router = Router();

// Motoboy/Lojista - Solicitar saque
router.post('/request', authenticate, requireCustodyOrLeftover, requireActiveUser, authorizeRoles('motoboy', 'lojista', 'seller'), requestWithdrawal);

// User (cliente/lojista) - Saque a partir do user balance
router.post('/request-user', authenticate, requireCustodyOrLeftover, requireActiveUser, requestUserWithdrawal);

// Motoboy - Ver seus saques
router.get('/my-withdrawals', authenticate, requireCustodyOrLeftover, authorizeRoles('motoboy', 'lojista', 'seller'), getMyWithdrawals);

// Admin - Ver saques pendentes
router.get('/pending', authenticate, authorizePermission('withdrawal:view'), getPendingWithdrawals);

// Admin - Ver todos os saques
router.get('/all', authenticate, authorizePermission('withdrawal:view'), getAllWithdrawals);

// Admin - Aprovar saque
router.post('/approve', authenticate, authorizePermission('withdrawal:approve'), approveWithdrawal);

// Admin - Rejeitar saque
router.post('/reject', authenticate, authorizePermission('withdrawal:approve'), rejectWithdrawal);

// Admin - Resolver saque incerto/travado em processamento (R27), depois de conferir no Asaas
const resolveUncertainSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('paid'), asaasTransferId: z.string().trim().min(1).max(100).optional(), note: z.string().trim().min(10).max(1000) }).strict(),
  z.object({ outcome: z.literal('not_sent'), note: z.string().trim().min(10).max(1000) }).strict(),
]);
router.post('/:id/resolve-uncertain', authenticate, authorizePermission('withdrawal:approve'), validate(resolveUncertainSchema), resolveUncertainWithdrawal);

// Admin - Ver carteira CEO
router.get('/ceo-wallet', authenticate, authorizePermission('withdrawal:view'), getCEOWallet);

// Admin - Config de auto-aprovação
router.get('/admin/config', authenticate, authorizePermission('withdrawal:view'), getWithdrawalConfig);
router.put('/admin/config', authenticate, authorizePermission('withdrawal:config'), toggleAutoApproveWithdrawals);

export default router;
