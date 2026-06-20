import { Router } from 'express';
import { createBroadcast, listBroadcasts, deleteBroadcast } from '../controllers/broadcastController';
import { authenticate } from '../middleware/auth';
import { authorizePermission } from '../middleware/authorize';

const router = Router();

// Listar broadcasts (quem pode enviar pode listar)
router.get('/', authenticate, authorizePermission('broadcast:send'), listBroadcasts);

// Criar broadcast
router.post('/', authenticate, authorizePermission('broadcast:send'), createBroadcast);

// Deletar broadcast e remover notificações de todos
router.delete('/:id', authenticate, authorizePermission('broadcast:send'), deleteBroadcast);

export default router;
