import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middleware/auth';
import { authenticateStoreApiKey } from '../middleware/storeApiKey';
import {
  listProductsForIntegration, setProductStock, bulkSetProductStock,
  createApiKey, listApiKeys, revokeApiKey,
  createWebhook, listWebhooks, deleteWebhook, testWebhook,
} from '../controllers/integrationsController';

const router = Router();

/* API pública de máquina (autenticada por API key da loja). */
router.get('/v1/products', authenticateStoreApiKey, listProductsForIntegration);
router.patch('/v1/products/stock', authenticateStoreApiKey, bulkSetProductStock); // lote (antes da rota com :id)
router.patch('/v1/products/:id/stock', authenticateStoreApiKey, setProductStock);

/* Gestão de chaves/webhooks pelo lojista logado (JWT). */
const seller = [authenticate, authorizeRoles('lojista')];

router.post('/keys', ...seller, createApiKey);
router.get('/keys', ...seller, listApiKeys);
router.delete('/keys/:id', ...seller, revokeApiKey);

router.post('/webhooks', ...seller, createWebhook);
router.get('/webhooks', ...seller, listWebhooks);
router.delete('/webhooks/:id', ...seller, deleteWebhook);
router.post('/webhooks/:id/test', ...seller, testWebhook);

export default router;
