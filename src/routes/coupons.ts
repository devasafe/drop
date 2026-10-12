import { Router } from 'express';
import {
  createCoupon, listCoupons, toggleCoupon, deleteCoupon, validateCoupon,
  UpdateCouponSchema, updateCouponVisibility, endCoupon, getCouponResults,
} from '../controllers/couponController';
import { authenticate, authorizeRoles } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { catchAsync } from '../middleware/errorHandler';

const router = Router();

// Validar cupom (cliente no checkout)
router.post('/validate', authenticate, validateCoupon);

// CRUD (lojista e CEO)
router.get('/', authenticate, authorizeRoles('lojista', 'ceo'), listCoupons);
router.get('/:id/results', authenticate, authorizeRoles('lojista', 'ceo'), catchAsync(getCouponResults));
router.post('/', authenticate, authorizeRoles('lojista', 'ceo'), createCoupon);
router.put('/:id/toggle', authenticate, authorizeRoles('lojista', 'ceo'), toggleCoupon);
// D1: encerrar (soft-delete; o histórico fica nos pedidos). DELETE /:id não muda.
router.post('/:id/end', authenticate, authorizeRoles('lojista', 'ceo'), catchAsync(endCoupon));
// D1: visibilidade (cupom público aparece na página da loja)
router.put('/:id', authenticate, authorizeRoles('lojista', 'ceo'), validate(UpdateCouponSchema), catchAsync(updateCouponVisibility));
router.delete('/:id', authenticate, authorizeRoles('lojista', 'ceo'), deleteCoupon);

export default router;
