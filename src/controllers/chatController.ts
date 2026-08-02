import { Request, Response } from 'express';
import {
  findConversationById,
  createConversation,
  updateConversation,
  deleteConversationById,
  findConversationBetween,
  listConversationsForUser,
  countConversationsForUser,
  listPrePurchaseForUser,
  countPrePurchaseForUser,
  listAllConversationsAdmin,
  createMessage,
  findMessages,
  lastMessage,
  countMessages,
  markIncomingMessagesRead,
  markMessagesReadByIds,
  deleteMessagesByConversation,
} from '../repositories/chat.repository';
import userRepository from '../repositories/user.repository';


import notifier from '../services/notifier';
import logger from '../config/logger';
import { prisma } from '../lib/prisma';
import { unreadForUser } from '../utils/chatUnread';

/**
 * Normalizar role para match com schema enum
 * 'lojista' -> 'loja'
 * 'cliente' -> 'cliente'
 * 'motoboy' -> 'motoboy'
 */
const normalizeRole = (role?: string): 'loja' | 'cliente' | 'motoboy' | 'suporte' => {
  if (!role) return 'cliente';
  const normalized = role.toLowerCase();
  if (normalized === 'lojista' || normalized === 'loja') return 'loja';
  if (normalized === 'motoboy') return 'motoboy';
  if (normalized === 'cliente') return 'cliente';
  if (['ceo', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys'].includes(normalized)) return 'suporte';
  return 'cliente'; // default
};

/**
 * Criar ou obter conversa existente
 */
export const createOrGetConversation = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const userId = req.user?.id;
    const { type, otherParticipantId, orderId, deliveryId } = req.body;

    // Validações
    if (!userId || !otherParticipantId) {
      return res.status(400).json({ error: 'IDs obrigatórios' });
    }

    if (userId === otherParticipantId) {
      return res.status(400).json({ error: 'Não pode conversar consigo mesmo' });
    }

    const validTypes = ['loja_cliente', 'loja_motoboy', 'motoboy_cliente'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Tipo de conversa inválido' });
    }

    // 🆕 Determinar o otherUserId baseado no tipo de conversa
    let otherUserId = otherParticipantId;
    let storeIdForConversation = null;

    // Se for conversa loja-motoboy, otherParticipantId é storeId
    if (type === 'loja_motoboy') {
      const store = await prisma.store.findUnique({ where: { id: String(otherParticipantId) } }) as any;
      if (!store) {
        return res.status(404).json({ error: 'Loja não encontrada' });
      }
      otherUserId = store.ownerId.toString();
      storeIdForConversation = otherParticipantId;
    }

    // Buscar conversa existente (em ambas as direções)
    let conversation = await findConversationBetween({ type, a: String(userId), b: String(otherUserId) });

    if (conversation) {
      // 🆕 Remover userId do deletedBy se estava lá (reativar) + reativar se inativa
      const patch: any = {};
      if (Array.isArray(conversation.deletedBy) && conversation.deletedBy.includes(String(userId))) {
        console.log(`🔄 [CHAT] Reativando conversa deletada: ${conversation._id}`);
        patch.deletedBy = conversation.deletedBy.filter((id: string) => String(id) !== String(userId));
      }
      if (!conversation.isActive) patch.isActive = true;

      if (Object.keys(patch).length > 0) {
        conversation = await updateConversation(conversation._id, patch);
      }
      console.log(`✅ [CHAT] Conversa existente encontrada/reativada: ${conversation._id}`);
      return res.json(conversation);
    }

    // Buscar dados dos participantes
    const user = await userRepository.findById(String(userId)) as any;
    
    let otherUser;
    
    // 🆕 Se for conversa loja-motoboy, otherParticipantId é storeId, precisamos pegar o ownerId
    if (type === 'loja_motoboy') {
      const store = await prisma.store.findUnique({ where: { id: String(otherParticipantId) } }) as any;
      if (!store) {
        return res.status(404).json({ error: 'Loja não encontrada' });
      }
      otherUserId = store.ownerId.toString();
      otherUser = await userRepository.findById(String(otherUserId)) as any;
    } else {
      // Para outros tipos, otherParticipantId é userId direto
      otherUser = await userRepository.findById(String(otherParticipantId)) as any;
    }

    if (!user || !otherUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Criar nova conversa
    const newConversation = await createConversation({
      type,
      participant1: {
        userId: user.id,
        role: normalizeRole(user.activeRole || user.role),
        name: user.name
      },
      participant2: {
        userId: otherUser.id,
        role: normalizeRole(otherUser.activeRole || otherUser.role),
        name: otherUser.name
      },
      orderId,
      deliveryId,
      unreadCount: [0, 0],
      isBlocked: [false, false],
      isMuted: [false, false]
    });

    console.log(`✅ [CHAT] Nova conversa criada: ${newConversation._id}`);
    console.log(`📢 [CHAT] Emitindo para userId1=${userId}, userId2=${otherUserId}`);
    
    // 📢 Notificar ambos os participantes sobre a conversa via Socket.io
    notifier.emitNewConversation(userId, otherUserId, newConversation);
    
    return res.status(201).json(newConversation);
  } catch (error) {
    console.error('❌ Erro ao criar conversa:', error);
    return res.status(500).json({ error: 'Erro ao criar conversa' });
  }
};

/**
 * Listar todas as conversas do usuário
 */
export const listConversations = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const userId = req.user?.id;
    const { limit = 50, skip = 0 } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    // Buscar apenas conversas que não foram deletadas por este usuário
    const conversations = await listConversationsForUser(String(userId), {
      skip: parseInt(skip as string),
      limit: parseInt(limit as string),
    });

    // 🟢 Buscar última mensagem de cada conversa para exibir na lista
    const conversationsWithLastMessage = await Promise.all(
      conversations.map(async (conv: any) => {
        const last = await lastMessage(conv._id);
        return {
          ...conv,
          lastMessage: last || null,
          unreadCount: unreadForUser(conv.unreadCount, conv.participant1?.userId, userId),
        };
      })
    );

    const total = await countConversationsForUser(String(userId));

    return res.json({
      conversations: conversationsWithLastMessage,
      pagination: {
        total,
        limit: parseInt(limit as string),
        skip: parseInt(skip as string),
        hasMore: parseInt(skip as string) + parseInt(limit as string) < total
      }
    });
  } catch (error) {
    console.error('❌ Erro ao listar conversas:', error);
    return res.status(500).json({ error: 'Erro ao listar conversas' });
  }
};

/**
 * Obter mensagens de uma conversa
 */
export const getMessages = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const userId = req.user?.id;
    const { conversationId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const skip = parseInt(req.query.skip as string) || 0;

    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    // Buscar conversa
    const conversation = await findConversationById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    // Verificar autorização
    const isParticipant =
      String(conversation.participant1.userId) === userId ||
      String(conversation.participant2.userId) === userId;

    const activeRole = (req.user as any)?.activeRole || req.user?.role;
    const isAdminRole = ['ceo', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys'].includes(activeRole);
    const isSupportConversation = (conversation as any).type === 'suporte';

    if (!isParticipant && !(isAdminRole && isSupportConversation)) {
      return res.status(403).json({ error: 'Não autorizado' });
    }

    // 🆕 AUTO-MARCAR COMO LIDO: Mensagens do outro usuário que ainda não foram lidas
    const modified = await markIncomingMessagesRead(String(conversationId), String(userId));
    if (modified > 0) {
      console.log(`✅ [GET MESSAGES] ${modified} mensagens marcadas como lidas automaticamente`);
    }

    // Buscar mensagens
    const messages = await findMessages(String(conversationId), { skip, limit, order: 'desc' });

    const totalMessages = await countMessages(String(conversationId));

    // Obter unread count do usuário (apenas se for participante)
    const participantIndex =
      String(conversation.participant1.userId) === userId ? 0 :
      String(conversation.participant2.userId) === userId ? 1 : -1;

    // 🆕 Após marcar como lido, zerar o unreadCount para este usuário
    if (participantIndex !== -1 && conversation.unreadCount[participantIndex] > 0) {
      conversation.unreadCount[participantIndex] = 0;
      await updateConversation(conversation._id, { unreadCount: conversation.unreadCount });
      console.log(`✅ [GET MESSAGES] Zerado unreadCount para participante ${participantIndex}`);
    }

    return res.json({
      conversationId,
      conversation: {
        _id: conversation._id,
        type: conversation.type,
        participant1: conversation.participant1,
        participant2: conversation.participant2,
        orderId: conversation.orderId,
        deliveryId: conversation.deliveryId,
        lastMessageAt: conversation.lastMessageAt
      },
      messages: messages.reverse(),
      totalMessages,
      unreadCount: participantIndex !== -1 ? conversation.unreadCount[participantIndex] : 0,
      pagination: {
        limit,
        skip,
        hasMore: skip + limit < totalMessages
      }
    });
  } catch (error) {
    console.error('❌ Erro ao obter mensagens:', error);
    return res.status(500).json({ error: 'Erro ao obter mensagens' });
  }
};

/**
 * Enviar mensagem
 */
export const sendMessage = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const userId = req.user?.id;
    const userRole = (req.user as any)?.activeRole || req.user?.role;
    const userName = req.user?.name;
    // Aceita conversationId do params (rota /conversations/:conversationId/messages) ou do body (rota /messages)
    const conversationId = req.params.conversationId || req.body.conversationId;
    const { text, attachments } = req.body;

    console.log('📨 [SEND MESSAGE] Recebido:', {
      userId,
      userRole,
      userName,
      conversationId,
      text: text?.substring(0, 50),
      hasAttachments: !!attachments
    });

    // Validações
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId é obrigatório' });
    }

    if (!text?.trim()) {
      return res.status(400).json({ error: 'Mensagem não pode ser vazia' });
    }

    if (text.length > 1000) {
      return res
        .status(400)
        .json({ error: 'Mensagem muito longa (máx 1000 caracteres)' });
    }

    // Buscar conversa
    let conversation = await findConversationById(conversationId);
    console.log('🔍 [SEND MESSAGE] Conversa encontrada:', {
      found: !!conversation,
      conversationId,
      participant1Id: conversation?.participant1.userId?.toString(),
      participant2Id: conversation?.participant2.userId?.toString(),
      userId
    });

    // 🆕 Se conversa foi deletada pelo usuário, reativar
    let wasReactivated = false;
    if (conversation && Array.isArray(conversation.deletedBy) && conversation.deletedBy.includes(String(userId))) {
      console.log(`🔄 [SEND MESSAGE] Reativando conversa deletada para usuário: ${userId}`);
      conversation = await updateConversation(conversation._id, {
        deletedBy: conversation.deletedBy.filter((id: string) => String(id) !== String(userId)),
      });
      wasReactivated = true;

      // 📢 Notificar o outro participante que a conversa foi reativada
      const otherParticipantId = String(conversation.participant1.userId) === userId
        ? String(conversation.participant2.userId)
        : String(conversation.participant1.userId);

      notifier.emitConversationReactivated(otherParticipantId, {
        _id: conversation._id,
        type: conversation.type,
        participant1: conversation.participant1,
        participant2: conversation.participant2,
        lastMessageAt: conversation.lastMessageAt,
        messageCount: conversation.messageCount,
        unreadCount: conversation.unreadCount
      });
    }

    // Se conversa não existe, criar automaticamente
    if (!conversation) {
      console.log(`⚠️ [SEND MESSAGE] Conversa não encontrada. Tentando criar automaticamente...`);
      
      // Buscar outro participante no body
      const { otherParticipantId, conversationType } = req.body;
      
      if (!otherParticipantId) {
        return res.status(400).json({ error: 'otherParticipantId é obrigatório se conversa não existe' });
      }

      // Buscar dados dos participantes
      const user = await userRepository.findById(String(userId)) as any;
      
      // 🆕 Se for conversa loja-motoboy, otherParticipantId pode ser storeId
      let otherUser;
      let otherUserIdForNotif = otherParticipantId;
      const convType = conversationType || 'loja_cliente';
      
      if (convType === 'loja_motoboy' || conversationType === 'loja_motoboy') {
        // Tentar buscar como Store primeiro
        const store = await prisma.store.findUnique({ where: { id: String(otherParticipantId) } }) as any;
        if (store) {
          otherUserIdForNotif = store.ownerId.toString();
          otherUser = await userRepository.findById(String(otherUserIdForNotif)) as any;
        } else {
          // Se não for store, é userId
          otherUser = await userRepository.findById(String(otherParticipantId)) as any;
        }
      } else {
        // Para outros tipos, otherParticipantId é userId
        otherUser = await userRepository.findById(String(otherParticipantId)) as any;
      }

      if (!user || !otherUser) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      // Determinar tipo de conversa baseado nos roles
      let determinedType = conversationType || 'loja_cliente';
      const userRole = user.activeRole || user.role;
      const otherRole = otherUser.activeRole || otherUser.role;

      if (userRole === 'motoboy' && otherRole === 'cliente') {
        determinedType = 'motoboy_cliente';
      } else if (userRole === 'cliente' && otherRole === 'motoboy') {
        determinedType = 'motoboy_cliente';
      } else if (userRole === 'lojista' && otherRole === 'motoboy') {
        determinedType = 'loja_motoboy';
      } else if (userRole === 'motoboy' && otherRole === 'lojista') {
        determinedType = 'loja_motoboy';
      }

      // Criar conversa
      conversation = await createConversation({
        type: determinedType,
        participant1: {
          userId: user.id,
          role: normalizeRole(userRole),
          name: user.name
        },
        participant2: {
          userId: otherUser.id,
          role: normalizeRole(otherRole),
          name: otherUser.name
        },
        unreadCount: [0, 0],
        isBlocked: [false, false],
        isMuted: [false, false],
        messageCount: 0,
        lastMessageAt: new Date()
      });

      console.log(`✅ [SEND MESSAGE] Nova conversa criada automaticamente: ${conversation._id}`);
      
      // Emitir evento de nova conversa (usando otherUserIdForNotif)
      notifier.emitNewConversation(userId, otherUserIdForNotif, conversation);
    }

    // Verificar se usuário é participante
    const isParticipant =
      String(conversation.participant1.userId) === userId ||
      String(conversation.participant2.userId) === userId;

    const senderActiveRole = (req.user as any)?.activeRole || req.user?.role;
    const isSenderAdmin = ['ceo', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys'].includes(senderActiveRole);
    const isSupportConv = (conversation as any).type === 'suporte';

    console.log('👤 [SEND MESSAGE] Verificação de participante:', {
      isParticipant,
      userId,
      participant1: String(conversation.participant1.userId),
      participant2: String(conversation.participant2.userId)
    });

    // Para conversas de suporte: verificar status do ticket
    let supportTicket: any = null;
    if (isSupportConv) {
      supportTicket = await prisma.supportTicket.findFirst({ where: { conversationId: String(conversationId) } });
      if (supportTicket?.status === 'resolvido') {
        return res.status(403).json({ error: 'Este atendimento foi encerrado' });
      }
    }

    // Para admins em conversas de suporte: checar se assumiu o ticket
    if (!isParticipant && isSenderAdmin && isSupportConv) {
      if (!supportTicket) return res.status(404).json({ error: 'Ticket não encontrado' });
      const hasAssumed = ((supportTicket.assignedTo as any[]) || []).some(
        (a: any) => String(a.userId) === userId
      );
      if (!hasAssumed) {
        return res.status(403).json({ error: 'Assuma o ticket antes de responder' });
      }
    } else if (!isParticipant) {
      return res.status(403).json({ error: 'Não autorizado' });
    }

    // Verificar se está bloqueado (apenas para participantes diretos)
    const participantIndex =
      String(conversation.participant1.userId) === userId ? 0 :
      String(conversation.participant2.userId) === userId ? 1 : -1;
    if (participantIndex !== -1 && conversation.isBlocked[participantIndex]) {
      return res.status(403).json({ error: 'Esta conversa foi bloqueada' });
    }

    // Criar mensagem
    const message = await createMessage({
      conversationId: String(conversationId),
      senderId: String(userId),
      senderRole: normalizeRole(userRole),
      senderName: userName || 'Usuário',
      text: text.trim(),
      attachments: attachments || [],
      status: 'sent'
    });

    // Atualizar conversa
    const newUnread = [...conversation.unreadCount];
    if (participantIndex === 0) {
      newUnread[0] = 0;
      newUnread[1] = (newUnread[1] || 0) + 1;
    } else if (participantIndex === 1) {
      newUnread[1] = 0;
      newUnread[0] = (newUnread[0] || 0) + 1;
    } else {
      // Admin enviando: incrementa unread de ambos os participantes
      newUnread[0] = (newUnread[0] || 0) + 1;
      newUnread[1] = (newUnread[1] || 0) + 1;
    }
    conversation = await updateConversation(conversation._id, {
      messageCount: (conversation.messageCount || 0) + 1,
      lastMessageAt: new Date(),
      unreadCount: newUnread,
    });

    console.log(`✅ [CHAT] Mensagem enviada: ${message._id}`);

    // 📨 Emitir evento Socket.io para notificar participantes em tempo real
    const msgPayload = {
      _id: message._id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      senderRole: message.senderRole,
      senderName: message.senderName,
      text: message.text,
      attachments: message.attachments,
      status: 'delivered',
      createdAt: message.createdAt,
    };
    // Emite diretamente para cada participante pelo user:${id}
    const p1Id = conversation.participant1.userId.toString();
    const p2Id = conversation.participant2.userId.toString();
    const io = notifier.io;
    if (io) {
      io.to(`user:${p1Id}`).emit('chat:new_message', msgPayload);
      io.to(`user:${p2Id}`).emit('chat:new_message', msgPayload);
    }

    // 🔄 Emitir atualização da conversa para o outro participante (lista atualizada + notificação)
    const otherParticipantId = conversation.participant1.userId.toString() === userId 
      ? conversation.participant2.userId.toString()
      : conversation.participant1.userId.toString();
    
    notifier.emitNewConversation(userId, otherParticipantId, {
      _id: conversation._id,
      type: conversation.type,
      participant1: conversation.participant1,
      participant2: conversation.participant2,
      lastMessageAt: conversation.lastMessageAt,
      lastMessage: {
        text: message.text,
        senderName: message.senderName,
        createdAt: message.createdAt
      },
      messageCount: conversation.messageCount,
      unreadCount: conversation.unreadCount
    });

    return res.status(201).json({
      _id: message._id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      senderRole: message.senderRole,
      senderName: message.senderName,
      text: message.text,
      attachments: message.attachments,
      status: 'delivered',
      createdAt: message.createdAt
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('❌ [SEND MESSAGE] Erro ao enviar mensagem:', {
      error: errorMessage,
      stack: errorStack,
      userId: req.user?.id,
      conversationId: req.body.conversationId || req.params.conversationId
    });
    return res.status(500).json({ 
      error: 'Erro ao enviar mensagem',
      details: errorMessage 
    });
  }
};

/**
 * Marcar mensagens como lidas
 */
export const markAsRead = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const userId = req.user?.id;
    const { conversationId, messageIds } = req.body;

    if (!userId || !conversationId) {
      return res.status(400).json({ error: 'IDs obrigatórios' });
    }

    // Marcar mensagens como lidas
    const modifiedCount = await markMessagesReadByIds(messageIds || [], String(conversationId));

    console.log(`✅ [CHAT] ${modifiedCount} mensagens marcadas como lidas`);

    // Obter conversa
    const conversation = await findConversationById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    // Atualizar contador de não-lidas
    const isParticipant1 = String(conversation.participant1.userId) === userId;
    const newUnread = [...conversation.unreadCount];
    if (isParticipant1) newUnread[0] = 0;
    else newUnread[1] = 0;
    await updateConversation(conversation._id, { unreadCount: newUnread });

    // Emitir evento em tempo real
    const notifier = require('../services/notifier');
    notifier.default.emitMessagesRead(conversationId, messageIds, userId);

    return res.json({
      success: true,
      modifiedCount
    });
  } catch (error) {
    console.error('❌ Erro ao marcar como lido:', error);
    return res.status(500).json({ error: 'Erro ao marcar como lido' });
  }
};

/**
 * Silenciar conversa
 */
export const muteConversation = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const userId = req.user?.id;
    const { conversationId } = req.params;
    const { isMuted } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const conversation = await findConversationById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    // Determinar índice do participante
    const participantIndex =
      String(conversation.participant1.userId) === userId ? 0 : 1;

    // Verificar se é participante
    if (
      String(conversation.participant1.userId) !== userId &&
      String(conversation.participant2.userId) !== userId
    ) {
      return res.status(403).json({ error: 'Não autorizado' });
    }

    // Atualizar
    const newMuted = [...conversation.isMuted];
    newMuted[participantIndex] = isMuted;
    await updateConversation(conversation._id, { isMuted: newMuted });

    console.log(`✅ [CHAT] Conversa ${isMuted ? 'silenciada' : 'desilenciada'}: ${conversationId}`);

    return res.json({ success: true, isMuted });
  } catch (error) {
    console.error('❌ Erro ao silenciar conversa:', error);
    return res.status(500).json({ error: 'Erro ao silenciar conversa' });
  }
};

/**
 * Bloquear participante
 */
export const blockParticipant = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const userId = req.user?.id;
    const { conversationId } = req.params;
    const { isBlocked } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const conversation = await findConversationById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    // Determinar índice do participante
    const participantIndex =
      String(conversation.participant1.userId) === userId ? 0 : 1;

    // Verificar se é participante
    if (
      String(conversation.participant1.userId) !== userId &&
      String(conversation.participant2.userId) !== userId
    ) {
      return res.status(403).json({ error: 'Não autorizado' });
    }

    // Atualizar
    const newBlocked = [...conversation.isBlocked];
    newBlocked[participantIndex] = isBlocked;
    await updateConversation(conversation._id, { isBlocked: newBlocked });

    console.log(
      `✅ [CHAT] Conversa ${isBlocked ? 'bloqueada' : 'desbloqueada'}: ${conversationId}`
    );

    return res.json({ success: true, isBlocked });
  } catch (error) {
    console.error('❌ Erro ao bloquear participante:', error);
    return res.status(500).json({ error: 'Erro ao bloquear participante' });
  }
};

/**
 * Deletar conversa
 */
export const deleteConversation = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const userId = req.user?.id;
    const { conversationId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const conversation = await findConversationById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    // Verificar autorização
    const isParticipant =
      String(conversation.participant1.userId) === userId ||
      String(conversation.participant2.userId) === userId;

    if (!isParticipant) {
      return res.status(403).json({ error: 'Não autorizado' });
    }

    // Marcar como deletado apenas para este usuário (soft delete)
    console.log(`🗑️ [CHAT] Marcando conversa como deletada para usuário: ${userId}`);

    // Se ambos usuários deletaram, excluir de verdade
    let deletedByArray: string[] = [...(conversation.deletedBy || [])];

    // Verificar se o usuário já está no array (comparando strings)
    const userAlreadyDeleted = deletedByArray.some((id) => String(id) === String(userId));
    if (!userAlreadyDeleted) {
      deletedByArray.push(String(userId));
    }

    // Se ambos deletaram, excluir permanentemente
    if (deletedByArray.length === 2) {
      console.log(`🗑️ [CHAT] Ambos usuários deletaram. Removendo conversa permanentemente: ${conversationId}`);
      await deleteMessagesByConversation(String(conversationId));
      await deleteConversationById(String(conversationId));

      // Notificar ambos sobre a deleção permanente
      const participant1Id = String(conversation.participant1.userId);
      const participant2Id = String(conversation.participant2.userId);
      const notifier = require('../services/notifier');
      notifier.default.emitConversationDeleted(participant1Id, participant2Id, conversationId);
    } else {
      // Apenas marcar para este usuário
      await updateConversation(String(conversationId), { deletedBy: deletedByArray });

      // Notificar apenas este usuário
      const notifier = require('../services/notifier');
      notifier.default.emitConversationDeletedForUser(userId, conversationId);
    }

    console.log(`✅ [CHAT] Conversa marcada como deletada para usuário: ${userId}`);

    return res.json({ success: true });
  } catch (error) {
    console.error('❌ Erro ao deletar conversa:', error);
    return res.status(500).json({ error: 'Erro ao deletar conversa' });
  }
};

/**
 * Obter conversas pré-compra (para lojista)
 * Filtra por tipo (product ou user)
 */
export const getPrePurchaseConversations = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const storeId = req.user?.id;
    const { conversationType, limit = 20, skip = 0 } = req.query;

    if (!storeId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const ctype = conversationType === 'product' || conversationType === 'user' ? String(conversationType) : undefined;

    // Buscar conversas ordenadas por última mensagem
    const conversations = await listPrePurchaseForUser(String(storeId), {
      conversationType: ctype,
      skip: Number(skip),
      limit: Number(limit),
    });

    // Para cada conversa, obter última mensagem
    const conversationsWithLastMessage = await Promise.all(
      conversations.map(async (conv) => {
        const last = await lastMessage(conv._id);

        const otherParticipant =
          String(conv.participant1.userId) === storeId
            ? conv.participant2
            : conv.participant1;

        return {
          ...conv,
          otherParticipant,
          lastMessage: last
            ? {
                text: last.text,
                senderName: last.senderName,
                createdAt: last.createdAt
              }
            : null,
          unreadCount: unreadForUser(conv.unreadCount, conv.participant1?.userId, storeId)
        };
      })
    );

    const total = await countPrePurchaseForUser(String(storeId), ctype);

    return res.json({
      conversations: conversationsWithLastMessage,
      total,
      hasMore: Number(skip) + Number(limit) < total
    });
  } catch (error) {
    console.error('❌ Erro ao obter conversas pré-compra:', error);
    return res.status(500).json({ error: 'Erro ao obter conversas' });
  }
};

/**
 * Criar ou obter conversa pré-compra
 */
export const createOrGetPrePurchaseConversation = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    console.log(`📨 [CONTROLLER] createOrGetPrePurchaseConversation - START`);
    console.log(`📨 [CONTROLLER] req.user:`, req.user);
    console.log(`📨 [CONTROLLER] req.body:`, req.body);
    
    const userId = req.user?.id;
    const { storeId, productId, conversationType = 'user' } = req.body;

    console.log(`📨 [CONTROLLER] userId: ${userId}, storeId: ${storeId}`);

    if (!userId || !storeId) {
      console.log(`❌ [CONTROLLER] Missing IDs - userId: ${userId}, storeId: ${storeId}`);
      return res.status(400).json({ error: 'IDs obrigatórios', details: { userId: !!userId, storeId: !!storeId } });
    }

    // ✅ FIX: Buscar a Store e obter o ownerId
    console.log(`📨 [CONTROLLER] Buscando Store com ID: ${storeId}`);
    const store = await prisma.store.findUnique({ where: { id: String(storeId) } }) as any;
    
    if (!store) {
      console.log(`❌ [CONTROLLER] Store não encontrada com ID: ${storeId}`);
      return res.status(404).json({ error: 'Loja não encontrada' });
    }

    console.log(`✅ [CONTROLLER] Store encontrada: ${store.name}, ownerId: ${store.ownerId}`);
    
    const storeOwnerId = store.ownerId.toString();

    // Validar tipo de conversa (com fallback para 'user')
    const validConversationType = ['product', 'user'].includes(conversationType) ? conversationType : 'user';

    console.log(`📨 [CONTROLLER] validConversationType: ${validConversationType}`);

    // Buscar conversa existente
    let conversation: any;

    if (validConversationType === 'product' && productId) {
      console.log(`📨 [CONTROLLER] Buscando por PRODUTO`);
      // Buscar por produto
      conversation = await findConversationBetween({
        type: 'loja_cliente_pre_compra',
        a: String(userId),
        b: String(storeOwnerId),
        productId: String(productId),
      });
    } else {
      console.log(`📨 [CONTROLLER] Buscando por USUÁRIO`);
      // Buscar por usuário (sem produto específico)
      conversation = await findConversationBetween({
        type: 'loja_cliente_pre_compra',
        a: String(userId),
        b: String(storeOwnerId),
        conversationType: 'user',
      });
    }

    if (conversation) {
      console.log(`✅ [CONTROLLER] Conversa encontrada: ${conversation._id}`);
      // Reativar se estava desativada
      if (!conversation.isActive) {
        conversation = await updateConversation(conversation._id, { isActive: true });
      }
      return res.json(conversation);
    }

    console.log(`📨 [CONTROLLER] Conversa não encontrada, buscando participantes`);

    // Buscar dados dos participantes
    const customer = await userRepository.findById(String(userId)) as any;
    const storeOwner = await userRepository.findById(String(storeOwnerId)) as any;

    console.log(`📨 [CONTROLLER] customer:`, customer ? customer.name : 'NOT FOUND');
    console.log(`📨 [CONTROLLER] storeOwner:`, storeOwner ? storeOwner.name : 'NOT FOUND');

    if (!customer || !storeOwner) {
      console.log(`❌ [CONTROLLER] Usuário não encontrado`);
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    console.log(`📨 [CONTROLLER] Criando nova conversa`);

    // Criar nova conversa
    const newConversation = await createConversation({
      type: 'loja_cliente_pre_compra',
      conversationType: validConversationType,
      participant1: {
        userId: customer.id,
        role: 'cliente',
        name: customer.name
      },
      participant2: {
        userId: storeOwner.id,
        role: 'loja',
        name: storeOwner.name
      },
      productId: validConversationType === 'product' ? productId : undefined,
      unreadCount: [0, 0],
      isBlocked: [false, false],
      isMuted: [false, false]
    });

    console.log(
      `✅ [CHAT PRÉ-COMPRA] Nova conversa criada: ${newConversation._id}`
    );

    return res.json(newConversation);
  } catch (error) {
    console.error('❌ Erro ao criar conversa pré-compra:', error);
    return res.status(500).json({ error: 'Erro ao criar conversa' });
  }
};

/**
 * CEO: listar todas as conversas com filtros e paginação
 */
export const listAllConversations = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { type, status, search, page = '1', limit = '30' } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const { conversations, total } = await listAllConversationsAdmin({
      type: type || undefined,
      status: status || undefined,
      search: search || undefined,
      skip,
      limit: limitNum,
    });

    return res.json({
      conversations,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    logger.error('Erro ao listar conversas (admin)', error as Error);
    return res.status(500).json({ error: 'Erro ao listar conversas' });
  }
};

/**
 * CEO: ler mensagens de qualquer conversa (sem restrição de participante)
 */
export const getConversationMessagesAdmin = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { conversationId } = req.params;

    const conversation = await findConversationById(conversationId);
    if (!conversation) return res.status(404).json({ error: 'Conversa não encontrada' });

    const messages = await findMessages(String(conversationId), { order: 'asc' });

    return res.json({ conversation, messages });
  } catch (error) {
    logger.error('Erro ao ler mensagens (admin)', error as Error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

// Status "ativos" p/ o seletor de contatos.
const ACTIVE_ORDER_STATUSES: any[] = ['criado', 'pago', 'aguardando_motoboy', 'enviado'];
const ACTIVE_DELIVERY_STATUSES: any[] = ['assigned', 'picked'];

interface ChatContact { id: string; name: string; role: 'lojista' | 'cliente' | 'motoboy'; kind: 'store' | 'user'; context?: string }

/**
 * Contatos elegíveis p/ INICIAR conversa, conforme o papel ativo:
 *  - motoboy: loja + cliente da entrega atual (assigned/picked).
 *  - lojista: clientes e motoboys dos pedidos ativos da sua loja.
 *  - cliente: [] (o front usa a lista de lojas — "qualquer loja").
 */
export const getChatContacts = async (req: Request, res: Response) => {
  try {
    const userId = String((req as any).user?.id || '');
    const role = (req as any).user?.activeRole || (req as any).user?.role;
    const contacts: ChatContact[] = [];

    if (role === 'motoboy') {
      const delivery = await prisma.delivery.findFirst({
        where: { motoboyId: userId, status: { in: ACTIVE_DELIVERY_STATUSES } },
        orderBy: { createdAt: 'desc' },
      });
      if (delivery) {
        const order = await prisma.order.findUnique({ where: { id: String(delivery.orderId) } });
        if (order) {
          const [store, customer] = await Promise.all([
            prisma.store.findUnique({ where: { id: String(order.storeId) }, select: { id: true, name: true } }),
            prisma.user.findUnique({ where: { id: String(order.customerId) }, select: { id: true, name: true } }),
          ]);
          if (store) contacts.push({ id: store.id, name: store.name, role: 'lojista', kind: 'store', context: 'Entrega atual' });
          if (customer) contacts.push({ id: customer.id, name: customer.name, role: 'cliente', kind: 'user', context: 'Entrega atual' });
        }
      }
    } else if (role === 'lojista' || role === 'seller') {
      const store = await prisma.store.findFirst({ where: { ownerId: userId }, select: { id: true } });
      if (store) {
        const orders = await prisma.order.findMany({
          where: { storeId: store.id, status: { in: ACTIVE_ORDER_STATUSES } },
          orderBy: { createdAt: 'desc' },
          take: 50,
        });
        const seen = new Set<string>();
        for (const o of orders) {
          const short = `Pedido #${String(o.id).slice(-6).toUpperCase()}`;
          if (o.customerId && !seen.has(o.customerId)) {
            seen.add(o.customerId);
            const c = await prisma.user.findUnique({ where: { id: String(o.customerId) }, select: { id: true, name: true } });
            if (c) contacts.push({ id: c.id, name: c.name, role: 'cliente', kind: 'user', context: short });
          }
          if (o.deliveryId) {
            const d = await prisma.delivery.findUnique({ where: { id: String(o.deliveryId) }, select: { motoboyId: true } });
            if (d?.motoboyId && !seen.has(d.motoboyId)) {
              seen.add(d.motoboyId);
              const m = await prisma.user.findUnique({ where: { id: String(d.motoboyId) }, select: { id: true, name: true } });
              if (m) contacts.push({ id: m.id, name: m.name, role: 'motoboy', kind: 'user', context: 'Entregador' });
            }
          }
        }
      }
    }

    return res.json({ contacts });
  } catch (error) {
    logger.error('Erro ao listar contatos de chat', error as Error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
