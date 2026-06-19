import { Router } from 'express';
import { handleAsaasWebhook } from '../controllers/webhookController';

const router = Router();

// Webhook do Asaas. SEM auth de usuário (é server-to-server). A origem é
// validada pelo token `asaas-access-token` dentro do controller.
router.post('/asaas', handleAsaasWebhook);

export default router;
