import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middleware/auth';
import { authenticateStoreApiKey, requireScope } from '../middleware/storeApiKey';
import {
  listProductsForIntegration, setProductStock, bulkSetProductStock,
  exportProductsCsv, importProductsStock,
  createApiKey, listApiKeys, revokeApiKey,
  createWebhook, listWebhooks, deleteWebhook, testWebhook,
} from '../controllers/integrationsController';

const router = Router();

/* API pública de máquina (autenticada por API key da loja + escopo). */
router.get('/v1/products', authenticateStoreApiKey, requireScope('read'), listProductsForIntegration);
router.patch('/v1/products/stock', authenticateStoreApiKey, requireScope('write'), bulkSetProductStock); // lote (antes da rota com :id)
router.patch('/v1/products/:id/stock', authenticateStoreApiKey, requireScope('write'), setProductStock);

/* Gestão de chaves/webhooks pelo lojista logado (JWT). */
const seller = [authenticate, authorizeRoles('lojista')];

/* Export/import 1-clique (baixa/atualiza CSV direto do painel, sem chave). */
router.get('/export/products.csv', ...seller, exportProductsCsv);
router.post('/import/products', ...seller, importProductsStock);

router.post('/keys', ...seller, createApiKey);
router.get('/keys', ...seller, listApiKeys);
router.delete('/keys/:id', ...seller, revokeApiKey);

router.post('/webhooks', ...seller, createWebhook);
router.get('/webhooks', ...seller, listWebhooks);
router.delete('/webhooks/:id', ...seller, deleteWebhook);
router.post('/webhooks/:id/test', ...seller, testWebhook);

export default router;
