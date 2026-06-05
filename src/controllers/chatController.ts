import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Conversation from '../models/Conversation';
import Message from '../models/Message';
import User from '../models/User';
import Order from '../models/Order';
import Delivery from '../models/Delivery';
import Store from '../models/Store';
import notifier from '../services/notifier';
import logger from '../config/logger';

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
      const store = await Store.findById(otherParticipantId).select('ownerId name').lean();
      if (!store) {
        return res.status(404).json({ error: 'Loja não encontrada' });
      }
      otherUserId = store.ownerId.toString();
      storeIdForConversation = otherParticipantId;
    }

    // Buscar conversa existente (em ambas as direções)
    let conversation = await Conversation.findOne({
      type, // 👈 IMPORTANTE: Filtrar por tipo também!
      $or: [
        {
          'participant1.userId': userId,
          'participant2.userId': otherUserId
        },
        {
          'participant1.userId': otherUserId,
          'participant2.userId': userId
        }
      ]
    }); // ⚠️ NÃO usar .lean() aqui pois vamos precisar reativar

    if (conversation) {
      // 🆕 Remover userId do deletedBy se estava lá (reativar)
      if (conversation.deletedBy && conversation.deletedBy.includes(new mongoose.Types.ObjectId(userId))) {
        console.log(`🔄 [CHAT] Reativando conversa deletada: ${conversation._id}`);
        conversation.deletedBy = conversation.deletedBy.filter(id => id.toString() !== userId);
      }
      
      // Reativar se estava desativada
      if (!conversation.isActive) {
        conversation.isActive = true;
      }
      
      await conversation.save();
      console.log(`✅ [CHAT] Conversa existente encontrada/reativada: ${conversation._id}`);
      return res.json(conversation);
    }

    // Buscar dados dos participantes
    const user = await User.findById(userId).select('name role activeRole').lean();
    
    let otherUser;
    
    // 🆕 Se for conversa loja-motoboy, otherParticipantId é storeId, precisamos pegar o ownerId
    if (type === 'loja_motoboy') {
      const store = await Store.findById(otherParticipantId).select('ownerId name').lean();
      if (!store) {
        return res.status(404).json({ error: 'Loja não encontrada' });
      }
      otherUserId = store.ownerId.toString();
      otherUser = await User.findById(otherUserId)
        .select('name role activeRole')
        .lean();
    } else {
      // Para outros tipos, otherParticipantId é userId direto
      otherUser = await User.findById(otherParticipantId)
        .select('name role activeRole')
        .lean();
    }

    if (!user || !otherUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Criar nova conversa
    const newConversation = new Conversation({
      type,
      participant1: {
        userId: user._id,
        role: normalizeRole(user.activeRole || user.role),
        name: user.name
      },
      participant2: {
        userId: otherUser._id,
        role: normalizeRole(otherUser.activeRole || otherUser.role),
        name: otherUser.name
      },
      orderId,
      deliveryId,
      unreadCount: [0, 0],
      isBlocked: [false, false],
      isMuted: [false, false]
    });

    await newConversation.save();

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

    const userObjectId = new mongoose.Types.ObjectId(userId);
    
    // Buscar apenas conversas que não foram deletadas por este usuário
    const conversations = await Conversation.find({
      $and: [
        {
          $or: [
            { 'participant1.userId': userObjectId },
            { 'participant2.userId': userObjectId }
          ]
        },
        {
          $or: [
            { deletedBy: { $exists: false } },
            { deletedBy: { $nin: [userObjectId] } }
          ]
        },
        { type: { $ne: 'suporte' } }
      ]
    })
      .select(
        'type participant1 participant2 lastMessageAt messageCount unreadCount orderId'
      )
      .sort({ lastMessageAt: -1 })
      .limit(parseInt(limit as string))
      .skip(parseInt(skip as string))
      .lean();

    // 🟢 Buscar última mensagem de cada conversa para exibir na lista
    const conversationsWithLastMessage = await Promise.all(
      conversations.map(async (conv: any) => {
        const lastMessage = await Message.findOne({ conversationId: conv._id })
          .sort({ createdAt: -1 })
          .select('text senderName createdAt')
          .lean();
        
        return {
          ...conv,
          lastMessage: lastMessage || null
        };
      })
    );

    const total = await Conversation.countDocuments({
      $and: [
        {
          $or: [
            { 'participant1.userId': userObjectId },
            { 'participant2.userId': userObjectId }
          ]
        },
        {
          $or: [
            { deletedBy: { $exists: false } },
            { deletedBy: { $nin: [userObjectId] } }
          ]
        }
      ]
    });

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
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    // Verificar autorização
    const isParticipant =
      conversation.participant1.userId.toString() === userId ||
      conversation.participant2.userId.toString() === userId;

    const activeRole = (req.user as any)?.activeRole || req.user?.role;
    const isAdminRole = ['ceo', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys'].includes(activeRole);
    const isSupportConversation = (conversation as any).type === 'suporte';

    if (!isParticipant && !(isAdminRole && isSupportConversation)) {
      return res.status(403).json({ error: 'Não autorizado' });
    }

    // 🆕 AUTO-MARCAR COMO LIDO: Mensagens do outro usuário que ainda não foram lidas
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const updateResult = await Message.updateMany(
      {
        conversationId: new mongoose.Types.ObjectId(conversationId),
        senderId: { $ne: userObjectId }, // Mensagens do OUTRO usuário
        status: { $in: ['sent', 'delivered'] } // Que ainda não foram lidas
      },
      {
        status: 'read',
        readAt: new Date()
      }
    );

    if (updateResult.modifiedCount > 0) {
      console.log(`✅ [GET MESSAGES] ${updateResult.modifiedCount} mensagens marcadas como lidas automaticamente`);
    }

    // Buscar mensagens
    const messages = await Message.find({ conversationId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();

    // 🔵 Log de debug: mostrar status de cada mensagem
    console.log(`📊 [GET MESSAGES] Mensagens com status:`, messages.map(msg => ({
      _id: msg._id,
      senderId: msg.senderId.toString(),
      text: msg.text.substring(0, 20),
      status: msg.status
    })));

    const totalMessages = await Message.countDocuments({ conversationId });

    // Obter unread count do usuário (apenas se for participante)
    const participantIndex =
      conversation.participant1.userId.toString() === userId ? 0 :
      conversation.participant2.userId.toString() === userId ? 1 : -1;

    // 🆕 Após marcar como lido, zerar o unreadCount para este usuário
    if (participantIndex !== -1 && conversation.unreadCount[participantIndex] > 0) {
      conversation.unreadCount[participantIndex] = 0;
      await conversation.save();
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
    let conversation = await Conversation.findById(conversationId);
    console.log('🔍 [SEND MESSAGE] Conversa encontrada:', {
      found: !!conversation,
      conversationId,
      participant1Id: conversation?.participant1.userId.toString(),
      participant2Id: conversation?.participant2.userId.toString(),
      userId
    });

    // 🆕 Se conversa foi deletada pelo usuário, reativar
    let wasReactivated = false;
    if (conversation && conversation.deletedBy && conversation.deletedBy.includes(new mongoose.Types.ObjectId(userId))) {
      console.log(`🔄 [SEND MESSAGE] Reativando conversa deletada para usuário: ${userId}`);
      conversation.deletedBy = conversation.deletedBy.filter(id => id.toString() !== userId);
      await conversation.save();
      wasReactivated = true;
      
      // 📢 Notificar o outro participante que a conversa foi reativada
      const otherParticipantId = conversation.participant1.userId.toString() === userId 
        ? conversation.participant2.userId.toString()
        : conversation.participant1.userId.toString();
      
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
      const user = await User.findById(userId).select('name role activeRole').lean();
      
      // 🆕 Se for conversa loja-motoboy, otherParticipantId pode ser storeId
      let otherUser;
      let otherUserIdForNotif = otherParticipantId;
      const convType = conversationType || 'loja_cliente';
      
      if (convType === 'loja_motoboy' || conversationType === 'loja_motoboy') {
        // Tentar buscar como Store primeiro
        const store = await Store.findById(otherParticipantId).select('ownerId name').lean();
        if (store) {
          otherUserIdForNotif = store.ownerId.toString();
          otherUser = await User.findById(otherUserIdForNotif).select('name role activeRole').lean();
        } else {
          // Se não for store, é userId
          otherUser = await User.findById(otherParticipantId).select('name role activeRole').lean();
        }
      } else {
        // Para outros tipos, otherParticipantId é userId
        otherUser = await User.findById(otherParticipantId).select('name role activeRole').lean();
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
      conversation = new Conversation({
        type: determinedType,
        participant1: {
          userId: user._id,
          role: normalizeRole(userRole),
          name: user.name
        },
        participant2: {
          userId: otherUser._id,
          role: normalizeRole(otherRole),
          name: otherUser.name
        },
        unreadCount: [0, 0],
        isBlocked: [false, false],
        isMuted: [false, false],
        messageCount: 0,
        lastMessageAt: new Date()
      });

      await conversation.save();
      console.log(`✅ [SEND MESSAGE] Nova conversa criada automaticamente: ${conversation._id}`);
      
      // Emitir evento de nova conversa (usando otherUserIdForNotif)
      notifier.emitNewConversation(userId, otherUserIdForNotif, conversation);
    }

    // Verificar se usuário é participante
    const isParticipant =
      conversation.participant1.userId.toString() === userId ||
      conversation.participant2.userId.toString() === userId;

    const senderActiveRole = (req.user as any)?.activeRole || req.user?.role;
    const isSenderAdmin = ['ceo', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys'].includes(senderActiveRole);
    const isSupportConv = (conversation as any).type === 'suporte';

    console.log('👤 [SEND MESSAGE] Verificação de participante:', {
      isParticipant,
      userId,
      participant1: conversation.participant1.userId.toString(),
      participant2: conversation.participant2.userId.toString()
    });

    // Para conversas de suporte: verificar status do ticket
    let supportTicket: any = null;
    if (isSupportConv) {
      const SupportTicket = (await import('../models/SupportTicket')).default;
      supportTicket = await SupportTicket.findOne({ conversationId }).lean();
      if (supportTicket?.status === 'resolvido') {
        return res.status(403).json({ error: 'Este atendimento foi encerrado' });
      }
    }

    // Para admins em conversas de suporte: checar se assumiu o ticket
    if (!isParticipant && isSenderAdmin && isSupportConv) {
      if (!supportTicket) return res.status(404).json({ error: 'Ticket não encontrado' });
      const hasAssumed = (supportTicket.assignedTo as any[]).some(
        (a: any) => a.userId.toString() === userId
      );
      if (!hasAssumed) {
        return res.status(403).json({ error: 'Assuma o ticket antes de responder' });
      }
    } else if (!isParticipant) {
      return res.status(403).json({ error: 'Não autorizado' });
    }

    // Verificar se está bloqueado (apenas para participantes diretos)
    const participantIndex =
      conversation.participant1.userId.toString() === userId ? 0 :
      conversation.participant2.userId.toString() === userId ? 1 : -1;
    if (participantIndex !== -1 && conversation.isBlocked[participantIndex]) {
      return res.status(403).json({ error: 'Esta conversa foi bloqueada' });
    }

    // Criar mensagem
    const message = new Message({
      conversationId: new mongoose.Types.ObjectId(conversationId),
      senderId: new mongoose.Types.ObjectId(userId),
      senderRole: normalizeRole(userRole),
      senderName: userName || 'Usuário',
      text: text.trim(),
      attachments: attachments || [],
      status: 'sent'
    });

    await message.save();

    // Atualizar conversa
    conversation.messageCount += 1;
    conversation.lastMessageAt = new Date();

    // Atualizar unread count (apenas para participantes diretos)
    if (participantIndex === 0) {
      conversation.unreadCount[0] = 0;
      conversation.unreadCount[1] = (conversation.unreadCount[1] || 0) + 1;
    } else if (participantIndex === 1) {
      conversation.unreadCount[1] = 0;
      conversation.unreadCount[0] = (conversation.unreadCount[0] || 0) + 1;
    } else {
      // Admin enviando: incrementa unread de ambos os participantes
      conversation.unreadCount[0] = (conversation.unreadCount[0] || 0) + 1;
      conversation.unreadCount[1] = (conversation.unreadCount[1] || 0) + 1;
    }

    await conversation.save();

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
    const result = await Message.updateMany(
      { 
        _id: { $in: messageIds || [] },
        conversationId
      },
      {
        status: 'read',
        readAt: new Date()
      }
    );

    console.log(`✅ [CHAT] ${result.modifiedCount} mensagens marcadas como lidas`);

    // Obter conversa
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    // Atualizar contador de não-lidas
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const isParticipant1 = conversation.participant1.userId.toString() === userId;
    
    if (isParticipant1) {
      conversation.unreadCount[0] = 0;
    } else {
      conversation.unreadCount[1] = 0;
    }
    
    await conversation.save();

    // Emitir evento em tempo real
    const notifier = require('../services/notifier');
    notifier.default.emitMessagesRead(conversationId, messageIds, userId);

    return res.json({
      success: true,
      modifiedCount: result.modifiedCount
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

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    // Determinar índice do participante
    const participantIndex =
      conversation.participant1.userId.toString() === userId ? 0 : 1;

    // Verificar se é participante
    if (
      conversation.participant1.userId.toString() !== userId &&
      conversation.participant2.userId.toString() !== userId
    ) {
      return res.status(403).json({ error: 'Não autorizado' });
    }

    // Atualizar
    conversation.isMuted[participantIndex] = isMuted;
    await conversation.save();

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

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    // Determinar índice do participante
    const participantIndex =
      conversation.participant1.userId.toString() === userId ? 0 : 1;

    // Verificar se é participante
    if (
      conversation.participant1.userId.toString() !== userId &&
      conversation.participant2.userId.toString() !== userId
    ) {
      return res.status(403).json({ error: 'Não autorizado' });
    }

    // Atualizar
    conversation.isBlocked[participantIndex] = isBlocked;
    await conversation.save();

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

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    // Verificar autorização
    const isParticipant =
      conversation.participant1.userId.toString() === userId ||
      conversation.participant2.userId.toString() === userId;

    if (!isParticipant) {
      return res.status(403).json({ error: 'Não autorizado' });
    }

    // Marcar como deletado apenas para este usuário (soft delete)
    console.log(`🗑️ [CHAT] Marcando conversa como deletada para usuário: ${userId}`);
    
    const userObjectId = new mongoose.Types.ObjectId(userId);
    
    // Se ambos usuários deletaram, excluir de verdade
    let deletedByArray = conversation.deletedBy || [];
    
    // Verificar se o usuário já está no array (comparando strings)
    const userAlreadyDeleted = deletedByArray.some(id => id.toString() === userId);
    if (!userAlreadyDeleted) {
      deletedByArray.push(userObjectId);
    }

    // Se ambos deletaram, excluir permanentemente
    if (deletedByArray.length === 2) {
      console.log(`🗑️ [CHAT] Ambos usuários deletaram. Removendo conversa permanentemente: ${conversationId}`);
      await Message.deleteMany({ conversationId });
      await Conversation.deleteOne({ _id: conversationId });
      
      // Notificar ambos sobre a deleção permanente
      const participant1Id = conversation.participant1.userId.toString();
      const participant2Id = conversation.participant2.userId.toString();
      const notifier = require('../services/notifier');
      notifier.default.emitConversationDeleted(participant1Id, participant2Id, conversationId);
    } else {
      // Apenas marcar para este usuário
      const updateResult = await Conversation.findByIdAndUpdate(
        conversationId,
        { deletedBy: deletedByArray },
        { new: true }
      );
      
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

    // Build filter
    const storeIdObjectId = new mongoose.Types.ObjectId(storeId);
    const filter: any = {
      type: 'loja_cliente_pre_compra',
      $and: [
        {
          $or: [
            { 'participant1.userId': storeIdObjectId },
            { 'participant2.userId': storeIdObjectId }
          ]
        },
        {
          $or: [
            { deletedBy: { $exists: false } },
            { deletedBy: { $nin: [storeIdObjectId] } }
          ]
        }
      ]
    };

    // Filtrar por tipo de conversa (produto ou usuário)
    if (conversationType === 'product' || conversationType === 'user') {
      filter.conversationType = conversationType;
    }

    // Buscar conversas ordenadas por última mensagem
    const conversations = await Conversation.find(filter)
      .sort({ lastMessageAt: -1 })
      .limit(Number(limit))
      .skip(Number(skip))
      .lean();

    // Para cada conversa, obter última mensagem
    const conversationsWithLastMessage = await Promise.all(
      conversations.map(async (conv) => {
        const lastMessage = await Message.findOne({
          conversationId: conv._id
        })
          .sort({ createdAt: -1 })
          .lean();

        const otherParticipant =
          conv.participant1.userId.toString() === storeId
            ? conv.participant2
            : conv.participant1;

        return {
          ...conv,
          otherParticipant,
          lastMessage: lastMessage
            ? {
                text: lastMessage.text,
                senderName: lastMessage.senderName,
                createdAt: lastMessage.createdAt
              }
            : null,
          unreadCount: conv.participant1.userId.toString() === storeId
            ? conv.unreadCount[1]
            : conv.unreadCount[0]
        };
      })
    );

    const total = await Conversation.countDocuments(filter);

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
    const store = await Store.findById(storeId).lean();
    
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
      conversation = await Conversation.findOne({
        type: 'loja_cliente_pre_compra',
        productId,
        $or: [
          {
            'participant1.userId': userId,
            'participant2.userId': storeOwnerId
          },
          {
            'participant1.userId': storeOwnerId,
            'participant2.userId': userId
          }
        ]
      });
    } else {
      console.log(`📨 [CONTROLLER] Buscando por USUÁRIO`);
      // Buscar por usuário (sem produto específico)
      conversation = await Conversation.findOne({
        type: 'loja_cliente_pre_compra',
        conversationType: 'user',
        $or: [
          {
            'participant1.userId': userId,
            'participant2.userId': storeOwnerId
          },
          {
            'participant1.userId': storeOwnerId,
            'participant2.userId': userId
          }
        ]
      });
    }

    if (conversation) {
      console.log(`✅ [CONTROLLER] Conversa encontrada: ${conversation._id}`);
      // Reativar se estava desativada
      if (!conversation.isActive) {
        await Conversation.findByIdAndUpdate(conversation._id, {
          isActive: true
        });
      }
      return res.json(conversation);
    }

    console.log(`📨 [CONTROLLER] Conversa não encontrada, buscando participantes`);

    // Buscar dados dos participantes
    const customer = await User.findById(userId).select('name role').lean();
    const storeOwner = await User.findById(storeOwnerId).select('name role').lean();

    console.log(`📨 [CONTROLLER] customer:`, customer ? customer.name : 'NOT FOUND');
    console.log(`📨 [CONTROLLER] storeOwner:`, storeOwner ? storeOwner.name : 'NOT FOUND');

    if (!customer || !storeOwner) {
      console.log(`❌ [CONTROLLER] Usuário não encontrado`);
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    console.log(`📨 [CONTROLLER] Criando nova conversa`);

    // Criar nova conversa
    const newConversation = new Conversation({
      type: 'loja_cliente_pre_compra',
      conversationType: validConversationType,
      participant1: {
        userId: customer._id,
        role: 'cliente',
        name: customer.name
      },
      participant2: {
        userId: storeOwner._id,
        role: 'loja',
        name: storeOwner.name
      },
      productId: validConversationType === 'product' ? productId : undefined,
      unreadCount: [0, 0],
      isBlocked: [false, false],
      isMuted: [false, false]
    });

    await newConversation.save();

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

    const query: any = {};

    if (type) query.type = type;
    if (status) query.supportStatus = status;
    if (search) {
      // Escapar caracteres especiais para evitar ReDoS
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      query.$or = [
        { 'participant1.name': regex },
        { 'participant2.name': regex },
      ];
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [conversations, total] = await Promise.all([
      Conversation.find(query)
        .sort({ lastMessageAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Conversation.countDocuments(query),
    ]);

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

    const conversation = await Conversation.findById(conversationId).lean();
    if (!conversation) return res.status(404).json({ error: 'Conversa não encontrada' });

    const messages = await Message.find({ conversationId })
      .sort({ createdAt: 1 })
      .lean();

    return res.json({ conversation, messages });
  } catch (error) {
    logger.error('Erro ao ler mensagens (admin)', error as Error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
