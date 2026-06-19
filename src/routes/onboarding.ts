import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireActiveUser } from '../middleware/requireActive';
import { setPixKey, getOnboardingStatus, setupReceiver } from '../controllers/onboardingController';

const router = Router();

// Onboarding de recebedores (Asaas): chave PIX + endereço + criação da subconta.
router.get('/status', authenticate, getOnboardingStatus);
router.post('/pix-key', authenticate, requireActiveUser, setPixKey);
router.post('/receiver', authenticate, requireActiveUser, setupReceiver);

export default router;
