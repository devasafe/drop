import { Router } from 'express';
import { createCoupon, listCoupons, toggleCoupon, deleteCoupon, validateCoupon } from '../controllers/couponController';
import { authenticate, authorizeRoles } from '../middleware/auth';

const router = Router();

// Validar cupom (cliente no checkout)
router.post('/validate', authenticate, validateCoupon);

// CRUD (lojista e CEO)
router.get('/', authenticate, authorizeRoles('lojista', 'ceo'), listCoupons);
router.post('/', authenticate, authorizeRoles('lojista', 'ceo'), createCoupon);
router.put('/:id/toggle', authenticate, authorizeRoles('lojista', 'ceo'), toggleCoupon);
router.delete('/:id', authenticate, authorizeRoles('lojista', 'ceo'), deleteCoupon);

export default router;
