import { Router } from 'express';
import { listCategories, createCategory, updateCategory, deleteCategory } from '../controllers/categoryController';
import { authenticate, authorizeRoles } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createCategorySchema, updateCategorySchema } from '../validation/categorySchemas';

const router = Router();

router.get('/', listCategories);
router.post('/', authenticate, authorizeRoles('lojista'), validate(createCategorySchema), createCategory);
router.put('/:id', authenticate, authorizeRoles('lojista'), validate(updateCategorySchema), updateCategory);
router.delete('/:id', authenticate, authorizeRoles('lojista'), deleteCategory);

export default router;
