import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { authorizePermission } from '../middleware/authorize';
import { getCurrentPrizes, getPrizeHistory, setPrizes, distributePrizes } from '../controllers/rankingPrizeController';

const router = Router();

// Qualquer autenticado pode ver os prêmios do mês
router.get('/', authenticate, getCurrentPrizes);

// Administração de prêmios de ranking
router.get('/history', authenticate, authorizePermission('ranking:manage'), getPrizeHistory);
router.put('/', authenticate, authorizePermission('ranking:manage'), setPrizes);
router.post('/distribute', authenticate, authorizePermission('ranking:manage'), distributePrizes);

export default router;
