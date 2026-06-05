import { Router } from 'express';
import { createStore, listStores, deleteStoreAndUser, getStore, listarAvaliacoesLoja, dashboard, updateStore, getFeaturedStores, uploadStoreBanner, updateOperatingHours, getStoreTopProducts } from '../controllers/storeController';
import { authenticate, authorizeRoles } from '../middleware/auth';
import upload from '../middleware/upload';

const router = Router();

// Painel do lojista
router.get('/dashboard', authenticate, authorizeRoles('lojista'), dashboard);

// [Plan1] Lojas em destaque — Plano 3 com banner preenchido (rota pública)
router.get('/featured', getFeaturedStores);

// Upload de banner (featured) ou capa (cover) — exclusivo Plano 3
router.post('/banner', authenticate, authorizeRoles('lojista'), upload.single('banner'), uploadStoreBanner);

// create store (lojista)
router.post('/', authenticate, authorizeRoles('lojista'), createStore);
// Atualizar endereço da loja (lojista)
router.put('/:id', authenticate, authorizeRoles('lojista'), updateStore);
// Atualizar horário de funcionamento
router.put('/:id/operating-hours', authenticate, authorizeRoles('lojista'), updateOperatingHours);
// Listar avaliações da loja
router.get('/:id/ratings', listarAvaliacoesLoja);
// Top produtos vendidos da loja (público)
router.get('/:id/top-products', getStoreTopProducts);

// Deletar loja e usuário lojista juntos
router.delete('/:id', authenticate, authorizeRoles('lojista'), deleteStoreAndUser);
router.get('/', listStores);
router.get('/:idOrSlug', getStore);

export default router;
