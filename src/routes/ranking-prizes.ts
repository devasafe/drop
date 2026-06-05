import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middleware/auth';
import { getCurrentPrizes, getPrizeHistory, setPrizes, distributePrizes } from '../controllers/rankingPrizeController';

const router = Router();

// Qualquer autenticado pode ver os prêmios do mês
router.get('/', authenticate, getCurrentPrizes);

// Apenas CEO gerencia
router.get('/history', authenticate, authorizeRoles('ceo'), getPrizeHistory);
router.put('/', authenticate, authorizeRoles('ceo'), setPrizes);
router.post('/distribute', authenticate, authorizeRoles('ceo'), distributePrizes);

export default router;
