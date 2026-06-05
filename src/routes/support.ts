import { Router } from 'express';
import { openTicket, listTickets, assignTicket, resolveTicket, deleteTicket } from '../controllers/supportController';
import { authenticate, authorizeRoles } from '../middleware/auth';

const router = Router();

// Usuário abre ticket (qualquer role autenticado)
router.post('/tickets', authenticate, openTicket);

// Listar tickets (usuário vê os seus; gerentes/CEO veem os da categoria)
router.get('/tickets', authenticate, listTickets);

// Gerente assume ticket
router.put('/tickets/:id/assign', authenticate, authorizeRoles('ceo', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys'), assignTicket);

// Gerente resolve ticket
router.put('/tickets/:id/resolve', authenticate, authorizeRoles('ceo', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys'), resolveTicket);

// CEO apaga ticket
router.delete('/tickets/:id', authenticate, authorizeRoles('ceo'), deleteTicket);

export default router;
