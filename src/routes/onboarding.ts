import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireActiveUser } from '../middleware/requireActive';
import { setPixKey, getOnboardingStatus } from '../controllers/onboardingController';

const router = Router();

// Onboarding de recebedores (Asaas): chave PIX + status da subconta.
router.get('/status', authenticate, getOnboardingStatus);
router.post('/pix-key', authenticate, requireActiveUser, setPixKey);

export default router;
