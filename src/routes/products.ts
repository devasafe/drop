import { Router } from 'express';
import {
  createProduct,
  listProducts,
  getProduct,
  updateProduct,
  deleteProduct,
  updateStock
} from '../controllers/productController';
import { authenticate, authorizeRoles } from '../middleware/auth';

import upload, { uploadProductMedia } from '../middleware/upload';
import { validate } from '../middleware/validate';
import { createProductSchema, updateProductSchema, updateStockSchema } from '../validation/productSchemas';

const router = Router();

// Public listing
router.get('/', listProducts);
router.get('/:id', getProduct);

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

export default router;
