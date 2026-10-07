import { Router } from 'express';
import { requireSettlement } from '../middleware/requireSettlement';
import { authenticate } from '../middleware/auth';
import { requireActiveUser } from '../middleware/requireActive';
import { setPixKey, getOnboardingStatus, setupReceiver } from '../controllers/onboardingController';

const router = Router();

// Onboarding de recebedores (Asaas): chave PIX + endereço + criação da subconta.
router.get('/status', authenticate, getOnboardingStatus);
router.post('/pix-key', authenticate, requireActiveUser, setPixKey);
router.post('/receiver', requireSettlement('custodia'), authenticate, requireActiveUser, setupReceiver);

export default router;
