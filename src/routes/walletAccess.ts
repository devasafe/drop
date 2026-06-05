import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { authorizePermission } from '../middleware/authorize';
import {
  requestWalletAccess,
  approveWalletAccess,
  rejectWalletAccess,
  revokeWalletAccess,
  listIncomingRequests,
  listOutgoingRequests,
} from '../controllers/walletAccessController';

const router = Router();

// Solicitar acesso (precisa de permissão wallet:request_access)
router.post('/request', authenticate, authorizePermission('wallet:request_access'), requestWalletAccess);

// Listas
router.get('/incoming', authenticate, listIncomingRequests);
router.get('/outgoing', authenticate, authorizePermission('wallet:request_access'), listOutgoingRequests);

// Ações do dono da carteira
router.post('/:id/approve', authenticate, approveWalletAccess);
router.post('/:id/reject',  authenticate, rejectWalletAccess);
router.post('/:id/revoke',  authenticate, revokeWalletAccess);

export default router;
