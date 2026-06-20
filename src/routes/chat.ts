import express, { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { authorizePermission } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import * as chatController from '../controllers/chatController';

const router: Router = express.Router();

// ============= CHAT VALIDATION SCHEMAS =============
const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const CreateConversationSchema = z.object({
  type: z.enum(['loja_cliente', 'loja_motoboy', 'motoboy_cliente']),
  otherParticipantId: z.string().regex(objectIdRegex, 'ID de participante inválido'),
  orderId: z.string().regex(objectIdRegex, 'ID de pedido inválido').optional(),
  deliveryId: z.string().regex(objectIdRegex, 'ID de entrega inválido').optional(),
});

const CreatePrePurchaseSchema = z.object({
  storeId: z.string().regex(objectIdRegex, 'ID da loja inválido'),
  productId: z.string().regex(objectIdRegex, 'ID do produto inválido').optional(),
  conversationType: z.enum(['user', 'product']).optional().default('user'),
});

const SendMessageSchema = z.object({
  text: z.string().min(1, 'Mensagem não pode ser vazia').max(5000, 'Mensagem muito longa').optional(),
  attachments: z.array(z.object({
    url: z.string().url(),
    type: z.enum(['image', 'audio', 'file']).optional(),
  })).optional(),
  conversationId: z.string().regex(objectIdRegex, 'ID de conversa inválido').optional(),
}).refine(data => data.text || (data.attachments && data.attachments.length > 0), {
  message: 'Mensagem deve conter texto ou anexos',
});

const MuteSchema = z.object({
  isMuted: z.boolean(),
});

const BlockSchema = z.object({
  isBlocked: z.boolean(),
});

// Middleware de autenticação obrigatório PRIMEIRO
router.use(authenticate);

// Conversas Pré-Compra (DEVE VIR ANTES das rotas dinâmicas!)
router.post('/conversations/pre-purchase', validate(CreatePrePurchaseSchema), chatController.createOrGetPrePurchaseConversation);
router.get('/conversations/pre-purchase/list', chatController.getPrePurchaseConversations);

// Conversas (rotas mais genéricas DEPOIS)
router.post('/conversations', validate(CreateConversationSchema), chatController.createOrGetConversation);
router.get('/conversations', chatController.listConversations);
router.get('/conversations/:conversationId/messages', chatController.getMessages);
router.post('/conversations/:conversationId/messages', validate(SendMessageSchema), chatController.sendMessage);
router.get('/conversations/:conversationId', chatController.getMessages);
router.put('/conversations/:conversationId/mute', validate(MuteSchema), chatController.muteConversation);
router.put('/conversations/:conversationId/block', validate(BlockSchema), chatController.blockParticipant);
router.delete('/conversations/:conversationId', chatController.deleteConversation);

// Admin CEO: visualizar todas as conversas (ANTES das rotas dinâmicas com :id)
router.get('/admin/conversations', authorizePermission('conversations:view_all'), chatController.listAllConversations);
router.get('/admin/conversations/:conversationId/messages', authorizePermission('conversations:view_all'), chatController.getConversationMessagesAdmin);

// Mensagens
router.post('/messages', validate(SendMessageSchema), chatController.sendMessage);
router.put('/messages/:messageId/read', chatController.markAsRead);
router.put('/conversations/:conversationId/mark-as-read', chatController.markAsRead);

export default router;
