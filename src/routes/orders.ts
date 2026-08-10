
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createOrder, getOrder, getOrderPix, acceptOrder, avaliarLoja, listOrders, updatePaymentStatus, deliverPlan1Order, quoteDelivery } from '../controllers/orderController';
import {
  cancelOrderByCustomer,
  acceptOrderByStore,
  rejectOrderByStore,
  getCancellationHistory,
  getCancellationStats,
  posDevolucaoDecision,
  poolTimeoutDecision,
} from '../controllers/cancellationController';
import { getMyProductReviewsForOrder } from '../controllers/productReviewController';
import { authenticate, authorizeRoles } from '../middleware/auth';
import { authorizePermission } from '../middleware/authorize';
import { requireActiveUser } from '../middleware/requireActive';
import { validate } from '../middleware/validate';  // ✅ NOVO
import { CreateOrderSchema } from '../validation/schemas';  // ✅ NOVO

const router = Router();

// ✅ SEGURANÇA: Rate limiting para criação de pedidos
// Express já está configurado com "trust proxy" em app.ts,
// então req.ip será preenchido automaticamente do X-Forwarded-For
const createOrderLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 10, // 10 pedidos por minuto por usuário
  message: 'Muitas requisições de pedidos. Aguarde um minuto.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test',
});

// ✅ NOVO: Adicionar validação Zod antes de processar
// requireActiveUser: bloquear compra de user com conta bloqueada (check no DB)
router.post('/', authenticate, requireActiveUser, createOrderLimiter, validate(CreateOrderSchema), createOrder);
// Orçamento da entrega (preview do checkout) — mesma fonte da cobrança final.
router.post('/quote', authenticate, quoteDelivery);
router.get('/', authenticate, listOrders);

// ========== ANALYTICS ==========
// Get store cancellation stats (MUST come before /:id routes)
router.get('/stats/cancellations', authenticate, authorizeRoles('lojista'), getCancellationStats);

// Get single order details
router.get('/:id', authenticate, getOrder);
// Produtos que o cliente logado já avaliou neste pedido (hidrata a UI pós-F5).
router.get('/:id/my-product-reviews', authenticate, getMyProductReviewsForOrder);
// Retomar pagamento PIX de um pedido pendente
router.get('/:id/pix', authenticate, getOrderPix);

// ========== STORE OPERATIONS ==========
// store accepts order -> moves to processing
router.post('/:id/accept', authenticate, requireActiveUser, authorizeRoles('lojista'), acceptOrderByStore);
// store rejects order -> cancels and refunds
router.post('/:id/reject', authenticate, requireActiveUser, authorizeRoles('lojista'), rejectOrderByStore);

// ========== CUSTOMER OPERATIONS ==========
// customer cancels order -> refunds payment
router.post('/:id/cancel', authenticate, requireActiveUser, authorizeRoles('cliente'), cancelOrderByCustomer);

// customer decides after motoboy cancels post-pickup -> reembolso (100%) | reentrega (volta ao pool)
router.post('/:id/pos-devolucao', authenticate, requireActiveUser, authorizeRoles('cliente'), posDevolucaoDecision);

// customer decides after pool timeout (no motoboy accepted) -> seguir (stays in pool) | cancelar (refund 100%)
router.post('/:id/pool-timeout', authenticate, requireActiveUser, authorizeRoles('cliente'), poolTimeoutDecision);

// Get cancellation history for an order
router.get('/:id/cancellations', authenticate, getCancellationHistory);

// Cliente avalia a loja
router.post('/:id/evaluate-store', authenticate, avaliarLoja);

// ========== PLANO 1 ==========
// Cliente confirma que recebeu o produto (sem motoboy)
router.post('/:id/deliver', authenticate, authorizeRoles('cliente'), deliverPlan1Order);

// Admin altera status de pagamento (temporário até gateway)
router.put('/payment-status/update', authenticate, authorizePermission('order:manage_payment'), updatePaymentStatus);

export default router;
