import { Router } from 'express';
import {
  createProduct,
  listProducts,
  getProduct,
  updateProduct,
  deleteProduct,
  updateStock,
  bulkUpdateStock,
  setProductActive,
} from '../controllers/productController';
import { getTopProducts } from '../controllers/storeController';
import { getProductReviews, createProductReview } from '../controllers/productReviewController';
import { authenticate, authorizeRoles, optionalAuth } from '../middleware/auth';

import upload, { uploadProductMedia } from '../middleware/upload';
import { validate } from '../middleware/validate';
import { catchAsync } from '../middleware/errorHandler';
import { catalogHomeLimiter } from '../middleware/publicRateLimit';
import { getOffers, OffersQuerySchema } from '../controllers/catalogController';
import { createProductSchema, updateProductSchema, updateStockSchema, setProductActiveSchema, bulkStockSchema } from '../validation/productSchemas';

const router = Router();

// Public listing
router.get('/', listProducts);
router.get('/top', getTopProducts);
// Antes de '/:id': senão "offers" é lido como id
router.get('/offers', catalogHomeLimiter, validate(OffersQuerySchema, 'query'), getOffers);
router.get('/:id/reviews', getProductReviews);
// optionalAuth: o dono de loja pausada ainda abre o próprio produto (tela de edição)
router.get('/:id', optionalAuth, getProduct);

// Avaliação de produto (cliente que comprou)
router.post('/:id/reviews', authenticate, createProductReview);

// Protected routes (require authentication) - agora aceita upload de imagem
router.post('/', authenticate, authorizeRoles('lojista'), uploadProductMedia.fields([
  { name: 'images', maxCount: 10 },
  { name: 'video', maxCount: 1 }
]), createProduct);
router.put('/:id', authenticate, authorizeRoles('lojista'), uploadProductMedia.fields([
  { name: 'images', maxCount: 10 },
  { name: 'video', maxCount: 1 }
]), updateProduct);
router.delete('/:id', authenticate, authorizeRoles('lojista'), deleteProduct);

// stock update
router.put('/stock/:id', authenticate, authorizeRoles('lojista'), validate(updateStockSchema), updateStock);
// D1: estoque em lote pelo painel (até 200 itens)
router.patch('/stock', authenticate, authorizeRoles('lojista'), validate(bulkStockSchema), catchAsync(bulkUpdateStock));
// D1: pausar/reativar o produto (só o dono)
router.put('/:id/active', authenticate, authorizeRoles('lojista'), validate(setProductActiveSchema), setProductActive);

export default router;
