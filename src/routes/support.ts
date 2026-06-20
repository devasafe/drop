import { Router } from 'express';
import { openTicket, listTickets, assignTicket, resolveTicket, deleteTicket } from '../controllers/supportController';
import { authenticate } from '../middleware/auth';
import { authorizePermission } from '../middleware/authorize';

const router = Router();

// Usuário abre ticket (qualquer role autenticado)
router.post('/tickets', authenticate, openTicket);

// Listar tickets (usuário vê os seus; quem tem support:attend vê os da categoria)
router.get('/tickets', authenticate, listTickets);

// Atendente assume ticket
router.put('/tickets/:id/assign', authenticate, authorizePermission('support:attend'), assignTicket);

// Atendente resolve ticket
router.put('/tickets/:id/resolve', authenticate, authorizePermission('support:attend'), resolveTicket);

// Apagar ticket
router.delete('/tickets/:id', authenticate, authorizePermission('support:attend'), deleteTicket);

export default router;
