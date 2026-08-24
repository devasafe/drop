import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { vapidPublicKey, subscribe, unsubscribe, sendTest } from '../controllers/pushController';

const router = Router();

// Chave pública pode ser lida sem auth (é pública e o front precisa cedo).
router.get('/vapid-public-key', vapidPublicKey);

// Inscrição/cancelamento exigem usuário logado.
router.post('/subscribe', authenticate, subscribe);
router.post('/unsubscribe', authenticate, unsubscribe);
router.post('/test', authenticate, sendTest);

export default router;
