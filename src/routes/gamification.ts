import { Router } from 'express';
import { getGamification, addPoints, getRanking, redeem, getMonthlyRanking, getBenefits } from '../controllers/gamificationController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/ranking', getRanking);
router.get('/ranking-mensal', getMonthlyRanking);
router.get('/benefits', getBenefits);
router.post('/redeem', authenticate, redeem);
router.get('/:user_id', getGamification);
router.post('/:user_id/add', addPoints);

export default router;
