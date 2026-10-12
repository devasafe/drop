import { Router } from 'express';
import { createStore, listStores, deleteStoreAndUser, getStore, listarAvaliacoesLoja, dashboard, updateStore, getFeaturedStores, uploadStoreBanner, uploadStoreLogo, updateOperatingHours, getStoreTopProducts, getTopStores } from '../controllers/storeController';
import { authenticate, authorizeRoles, optionalAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { getNearbyStores, NearbyQuerySchema } from '../controllers/catalogController';
import { storeQuotesLimiter, catalogHomeLimiter } from '../middleware/publicRateLimit';
import { quoteStores, StoreQuotesSchema } from '../controllers/deliveryQuoteController';
import upload from '../middleware/upload';
import { pauseStore, unpauseStore } from '../controllers/storePauseController';
import { storePauseSchema, updateStoreIdentitySchema } from '../validation/storeSchemas';

const router = Router();

// Painel do lojista
router.get('/dashboard', authenticate, authorizeRoles('lojista'), dashboard);

// [Plan1] Lojas em destaque — Plano 3 com banner preenchido (rota pública)
router.get('/featured', getFeaturedStores);
router.get('/top', getTopStores);
// Antes de '/:idOrSlug': senão "nearby" é lido como slug
router.get('/nearby', catalogHomeLimiter, validate(NearbyQuerySchema, 'query'), getNearbyStores);

// Cotação em lote dos cards da vitrine (pública; estimativa, sem custo de rota)
router.post('/quotes', optionalAuth, storeQuotesLimiter, validate(StoreQuotesSchema), quoteStores);

// Upload de capa (cover, todos os planos) ou banner de destaque (featured, regra do Premium)
router.post('/banner', authenticate, authorizeRoles('lojista'), upload.single('banner'), uploadStoreBanner);

// create store (lojista)
router.post('/', authenticate, authorizeRoles('lojista'), createStore);
// Atualizar endereço da loja (lojista)
router.put('/:id', authenticate, authorizeRoles('lojista'), validate(updateStoreIdentitySchema), updateStore);
// D1: logo da loja (todos os planos) — só o dono
router.post('/:id/logo', authenticate, authorizeRoles('lojista'), upload.single('logo'), uploadStoreLogo);
// Atualizar horário de funcionamento
router.put('/:id/operating-hours', authenticate, authorizeRoles('lojista'), updateOperatingHours);
// D1: pausar a loja (30/60/120 min ou até amanhã) e tirar a pausa — só o dono
router.put('/:id/pause', authenticate, authorizeRoles('lojista'), validate(storePauseSchema), pauseStore);
router.delete('/:id/pause', authenticate, authorizeRoles('lojista'), unpauseStore);
// Listar avaliações da loja
router.get('/:id/ratings', listarAvaliacoesLoja);
// Top produtos vendidos da loja (público)
router.get('/:id/top-products', getStoreTopProducts);

// Deletar loja e usuário lojista juntos
router.delete('/:id', authenticate, authorizeRoles('lojista'), deleteStoreAndUser);
router.get('/', listStores);
router.get('/:idOrSlug', getStore);

export default router;
