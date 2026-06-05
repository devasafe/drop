import { Router } from 'express';
import { createBroadcast, listBroadcasts, deleteBroadcast } from '../controllers/broadcastController';
import { authenticate, authorizeRoles } from '../middleware/auth';
import { authorizePermission } from '../middleware/authorize';

const router = Router();

// Listar broadcasts
router.get('/', authenticate, authorizeRoles('ceo', 'marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys'), listBroadcasts);

// Criar broadcast (requer permissão broadcast:send — verificada dinamicamente no authorizePermission)
router.post('/', authenticate, authorizePermission('broadcast:send'), createBroadcast);

// Deletar broadcast e remover notificações de todos (apenas CEO)
router.delete('/:id', authenticate, authorizeRoles('ceo'), deleteBroadcast);

export default router;
