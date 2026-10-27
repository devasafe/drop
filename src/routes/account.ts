import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { deletionCheck, deleteAccount } from '../controllers/accountController';

const router = Router();

// Exclusão de conta pelo próprio usuário (exigência das lojas de apps e LGPD).
router.get('/deletion-check', authenticate, deletionCheck);
router.post('/delete', authenticate, deleteAccount);

export default router;
