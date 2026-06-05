import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getInvoice,
  getInvoiceByOrder,
  listMyInvoices,
} from '../controllers/deliveryInvoiceController';

const router = Router();

router.get('/my', authenticate, listMyInvoices);
router.get('/by-order/:orderId', authenticate, getInvoiceByOrder);
router.get('/:id', authenticate, getInvoice);

export default router;
