// src/routes/debts.ts
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getMyPendingDebt } from '../controllers/debtController';

const router = Router();
router.get('/my-pending', authenticate, getMyPendingDebt);
export default router;
