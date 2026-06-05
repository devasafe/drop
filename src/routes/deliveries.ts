

import { Router } from 'express';
import { createDelivery, assignDelivery, updateDeliveryStatus, getDelivery, listAvailableDeliveries, claimDelivery, finalizarEntrega, listOngoingDeliveries, avaliarMotoboy, listarAvaliacoesMotoboy, listHistoryDeliveries, validarPinRetirada, requestReturn, confirmReturn } from '../controllers/deliveryController';
import { rejectDeliveryByMotoboy } from '../controllers/cancellationController';
import { authenticate, authorizeRoles } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { CreateDeliverySchema } from '../validation/schemas';

const router = Router();

// ========== VALIDATION & FINALIZATION ==========
// ✅ SEGURANÇA: Validar PIN de retirada
router.post('/:id/validar-pin-retirada', authenticate, authorizeRoles('lojista'), validarPinRetirada);

// motoboy finaliza entrega com PIN
router.post('/:id/finalizar', authenticate, authorizeRoles('motoboy'), finalizarEntrega);

// ========== RATINGS ==========
// cliente avalia o motoboy após entrega (qualquer usuário autenticado pode avaliar se for o dono do pedido)
router.post('/:id/avaliar', authenticate, avaliarMotoboy);
// Listar avaliações recebidas pelo motoboy
router.get('/motoboy/:id/ratings', authenticate, listarAvaliacoesMotoboy);

// ========== CREATION & ASSIGNMENT ==========
// ✅ SEGURANÇA: Criar entrega com validação Zod
router.post('/', authenticate, authorizeRoles('lojista'), validate(CreateDeliverySchema), createDelivery);

// assign motoboy to delivery (only store owner)
router.put('/:id/assign', authenticate, authorizeRoles('lojista'), assignDelivery);

// ========== MOTOBOY OPERATIONS ==========
// motoboy updates status
router.put('/:id/status', authenticate, authorizeRoles('motoboy'), updateDeliveryStatus);

// motoboy rejects delivery (returns to pool or cancels)
router.post('/:id/reject', authenticate, authorizeRoles('motoboy'), rejectDeliveryByMotoboy);

// motoboy claims a delivery (first-claim-wins)
router.post('/:id/claim', authenticate, authorizeRoles('motoboy'), claimDelivery);

// ✅ FIX #6: motoboy solicita devolução do produto (gera PIN)
router.post('/:id/request-return', authenticate, authorizeRoles('motoboy'), requestReturn);

// ✅ FIX #6: loja confirma devolução inserindo o PIN
router.post('/:id/confirm-return', authenticate, authorizeRoles('lojista'), confirmReturn);

// ========== LISTING ==========
// list available deliveries for motoboys
router.get('/available', authenticate, authorizeRoles('motoboy'), listAvailableDeliveries);

// list ongoing deliveries for motoboy
router.get('/ongoing', authenticate, authorizeRoles('motoboy'), listOngoingDeliveries);

// list history deliveries for motoboy
router.get('/history', authenticate, authorizeRoles('motoboy'), listHistoryDeliveries);

// ========== DETAILS ==========
// get delivery
router.get('/:id', authenticate, getDelivery);

export default router;
