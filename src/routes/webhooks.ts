import { Router } from 'express';
import { handleTransferAuthorization } from '../controllers/transferAuthController';
import { handleAsaasWebhook, handleStoreAsaasWebhook } from '../controllers/webhookController';

const router = Router();

// Webhook do Asaas. SEM auth de usuário (é server-to-server). A origem é
// validada pelo token `asaas-access-token` dentro do controller.
router.post('/asaas', handleAsaasWebhook);

// Webhook registrado NA CONTA ASAAS DE CADA LOJA (modo SaaS direto). Token próprio
// da loja (só o hash fica no banco), conferido no controller.
router.post('/asaas/loja/:storeId', handleStoreAsaasWebhook);

// Autorização de transferências/estornos Pix da conta da loja (token próprio, só o hash no banco).
// Sempre 200 com APPROVED/REFUSED; fechado por padrão.
router.post('/asaas/loja/:storeId/autorizacao', handleTransferAuthorization);

export default router;
