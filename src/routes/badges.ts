import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getBadgeCounts } from '../controllers/badgesController';

const router = Router();

// Contagens para os badges do menu (verificações / pedidos da loja / entregas).
router.get('/', authenticate, getBadgeCounts);

export default router;
