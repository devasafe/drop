import { Router } from 'express';
import { getGamification, getRanking, redeem, getMonthlyRanking, getBenefits, getGamificationFeatures } from '../controllers/gamificationController';
import { authenticate, authorizeRoles } from '../middleware/auth';

const router = Router();

router.get('/ranking', getRanking);
router.get('/ranking-mensal', getMonthlyRanking);
router.get('/benefits', getBenefits);
router.get('/features', getGamificationFeatures);
router.post('/redeem', authenticate, authorizeRoles('motoboy'), redeem);
router.get('/:user_id', authenticate, getGamification);
// Segurança (2026-10-07): não existe rota para somar pontos. Pontos só nascem de
// eventos internos do servidor (PIN de entrega validado, avaliação) — ver deliveryController.

export default router;
