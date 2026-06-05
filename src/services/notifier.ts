import { Response } from 'express';
import { Server as IOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { onlineTracker } from './onlineTracker';

if (!process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is required');
}

const JWT_SECRET = process.env.JWT_SECRET;

type SSEClient = {
  id: string; // user id
  res: Response;
};

const clients = new Map<string, Set<Response>>();
let io: IOServer | null = null;

const send = (res: Response, event: string, data: any) => {
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (err) {
    // ignore
  }
};

export const addClient = (userId: string, res: Response) => {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId)!.add(res);
};

export const removeClient = (userId: string, res: Response) => {
  const set = clients.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(userId);
};

export const notifyMotoboys = (payload: any) => {
  // DEBUG LOG
  // eslint-disable-next-line no-console
  console.log('[notifier] notifyMotoboys called:', JSON.stringify(payload));
  // If Socket.IO is initialized, broadcast to motoboys room
  if (io) {
    try {
      io.to('motoboys').emit('notification', payload);
      // eslint-disable-next-line no-console
      console.log('[notifier] notification sent to motoboys room');
      return;
    } catch (e) {
      // fallback to SSE
      // eslint-disable-next-line no-console
      console.warn('[notifier] Socket.IO fallback to SSE', e);
    }
  }

  // fallback SSE broadcast
  for (const [, set] of clients.entries()) {
    for (const res of set) {
      send(res, 'notification', payload);
    }
  }
};

/**
 * 📨 Emitir nova mensagem de chat para a conversa
 */
export const emitChatMessage = (conversationId: string, messageData: any) => {
  if (!io) {
    console.warn('[notifier] Socket.IO not initialized');
    return;
  }

  try {
    const roomName = `conversation:${conversationId}`;
    console.log(`📨 [NOTIFIER] Emitindo chat:new_message para sala: ${roomName}`);
    io.to(roomName).emit('chat:new_message', messageData);
  } catch (e) {
    console.error('[notifier] Error emitting chat message:', e);
  }
};

export const emitNewConversation = (userId1: string, userId2: string, conversationData: any) => {
  if (!io) {
    console.warn('[notifier] Socket.IO not initialized');
    return;
  }

  try {
    console.log(`📢 [NOTIFIER] Emitindo nova conversa aos usuários: ${userId1}, ${userId2}`);
    // Emitir para ambos os usuários
    io.to(`user:${userId1}`).emit('chat:new_conversation', conversationData);
    io.to(`user:${userId2}`).emit('chat:new_conversation', conversationData);
  } catch (e) {
    console.error('[notifier] Error emitting new conversation:', e);
  }
};

/**
 * 🔄 Emitir reativação de conversa (quando conversa deletada é reativada)
 */
export const emitConversationReactivated = (userId: string, conversationData: any) => {
  if (!io) {
    console.warn('[notifier] Socket.IO not initialized');
    return;
  }

  try {
    console.log(`🔄 [NOTIFIER] Emitindo reativação de conversa para usuário: ${userId}`);
    // Emitir apenas para o usuário que a deletou (agora pode ver novamente)
    io.to(`user:${userId}`).emit('chat:conversation_reactivated', conversationData);
  } catch (e) {
    console.error('[notifier] Error emitting conversation reactivated:', e);
  }
};

export const emitConversationDeleted = (userId1: string, userId2: string, conversationId: string) => {
  if (!io) {
    console.warn('[notifier] Socket.IO not initialized');
    return;
  }

  try {
    console.log(`🗑️ [NOTIFIER] Emitindo deleção permanente de conversa aos usuários: ${userId1}, ${userId2}`);
    // Emitir para ambos os usuários que a conversa foi deletada
    io.to(`user:${userId1}`).emit('chat:conversation_deleted', { conversationId });
    io.to(`user:${userId2}`).emit('chat:conversation_deleted', { conversationId });
  } catch (e) {
    console.error('[notifier] Error emitting conversation deletion:', e);
  }
};

export const emitConversationDeletedForUser = (userId: string, conversationId: string) => {
  if (!io) {
    console.warn('[notifier] Socket.IO not initialized');
    return;
  }

  try {
    console.log(`🗑️ [NOTIFIER] Emitindo deleção de conversa para um usuário: ${userId}`);
    // Emitir apenas para o usuário que deletou
    io.to(`user:${userId}`).emit('chat:conversation_deleted', { conversationId });
  } catch (e) {
    console.error('[notifier] Error emitting conversation deletion for user:', e);
  }
};

export const emitMessagesRead = (conversationId: string, messageIds: string[], userId: string) => {
  if (!io) {
    console.warn('[notifier] Socket.IO not initialized');
    return;
  }

  try {
    console.log(`✓✓ [NOTIFIER] Emitindo mensagens como lidas em conversa: ${conversationId}`);
    // Emitir para todos na sala da conversa
    io.to(`conversation:${conversationId}`).emit('chat:messages_read', { 
      messageIds, 
      userId,
      readAt: new Date().toISOString()
    });
  } catch (e) {
    console.error('[notifier] Error emitting messages read:', e);
  }
};

export const initSocket = (server: any) => {
  io = new IOServer(server, { cors: { origin: '*' } });

  io.use((socket: Socket, next: (err?: any) => void) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Authentication error'));
    try {
      const decoded = jwt.verify(token as string, JWT_SECRET) as any;
      // Permite todos os roles (incluindo admin roles)
      const allowedRoles = ['cliente', 'motoboy', 'store', 'seller', 'lojista', 'ceo', 'marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys'];
      if (!allowedRoles.includes(decoded.role)) {
        return next(new Error('Forbidden'));
      }
      socket.data.user = { id: decoded.id, role: decoded.role };
      return next();
    } catch (err) {
      return next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.user?.id;
    const role = socket.data.user?.role;
    console.log(`✅ [Socket.io] Conectado: userId=${userId}, role=${role}`);

    // 📊 Registrar no tracker de presença em tempo real (para analytics do CEO)
    if (userId && role) {
      onlineTracker.set(userId, { role, socketId: socket.id });
      emitPresenceUpdateThrottled();
    }

    // 📍 Entrar automaticamente na sala do usuário para receber notificações pessoais
    if (userId) {
      socket.join(`user:${userId}`);
      console.log(`🔌 [Socket.io] Usuário ${userId} entrou na sala user:${userId}`);
    }
    
    if (userId && role) {
      // CLIENTE (customer)
      if (role === 'cliente') {
        socket.join(`user:${userId}`);
        console.log(`   └─ Sala: user:${userId}`);
      }
      // MOTOBOY
      if (role === 'motoboy') {
        socket.join('motoboys');
        socket.join(`user:${userId}`);
        console.log(`   ├─ Sala: motoboys`);
        console.log(`   └─ Sala: user:${userId}`);
      }
      // LOJA (store/seller/lojista) - Will join custom room via 'join' event
      if (role === 'store' || role === 'seller' || role === 'lojista') {
        socket.join(`user:${userId}`); // Keep personal room for fallback
        console.log(`   └─ Sala: user:${userId} (aguardando join customizado)`);
      }
      // ADMIN ROLES (ceo, marketing, gerentes)
      if (['ceo', 'marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys'].includes(role)) {
        socket.join('admin');
        socket.join(`admin:${role}`);
        socket.join(`user:${userId}`);
        console.log(`   ├─ Sala: admin`);
        console.log(`   ├─ Sala: admin:${role}`);
        console.log(`   └─ Sala: user:${userId}`);
      }
    }

    // Permite join customizado para qualquer sala
    socket.on('join', (data) => {
      if (data && data.room) {
        socket.join(data.room);
        console.log(`\n✅ [SOCKET][BACKEND-NOTIFIER] Socket entrou na sala: ${data.room}`);
        console.log(`   UserId: ${userId}`);
        console.log(`   Role: ${role}`);
        
        // ✅ FIX #6: Se for store/lojista, também armazenar storeId para futuro uso
        if (data.storeId) {
          socket.data.storeId = data.storeId;
          console.log(`   StoreId: ${data.storeId}`);
          console.log(`✅ Pronto para receber eventos na sala: store:${data.storeId}\n`);
        }
      } else {
        console.error(`❌ [SOCKET][BACKEND-NOTIFIER] Join com data inválida:`, data);
      }
    });

    // ⌨️ Typing indicator
    socket.on('chat:typing', (data) => {
      if (data && data.conversationId) {
        io?.to(`conversation:${data.conversationId}`).emit('chat:user_typing', {
          userId,
          conversationId: data.conversationId,
          isTyping: data.isTyping
        });
      }
    });

    // ✓ Delivery confirmation
    socket.on('chat:delivery_confirm', (data) => {
      if (data && data.messageId && data.conversationId) {
        io?.to(`conversation:${data.conversationId}`).emit('chat:message_delivered', {
          messageId: data.messageId,
          deliveredAt: new Date().toISOString()
        });
      }
    });

    // 📍 Relay localização do motoboy para cliente e loja
    socket.on('delivery:location_updated', async (data: {
      deliveryId: string;
      latitude: number;
      longitude: number;
      accuracy?: number;
      timestamp?: string;
    }) => {
      if (role !== 'motoboy') return; // só motoboys emitem localização

      const { deliveryId, latitude, longitude, accuracy, timestamp } = data;
      if (!deliveryId || latitude == null || longitude == null) return;

      try {
        const Delivery = require('../models/Delivery').default;
        const Order = require('../models/Order').default;

        const delivery = await Delivery.findById(deliveryId)
          .select('orderId motoboyId')
          .lean();

        // Segurança: só o motoboy atribuído pode enviar localização
        if (!delivery || delivery.motoboyId?.toString() !== userId) return;

        const order = await Order.findById(delivery.orderId)
          .select('customerId storeId')
          .lean();

        if (!order) return;

        const locationPayload = {
          _id: deliveryId,
          location: { latitude, longitude, accuracy },
          estimatedTime: null,
          timestamp: timestamp || new Date().toISOString(),
        };

        // Enviar para cliente
        io!.to(`user:${order.customerId}`).emit('delivery:location_updated', locationPayload);
        // Enviar para loja
        io!.to(`store:${order.storeId}`).emit('delivery:location_updated', locationPayload);

        console.log(`📍 [Socket] Location relayed: delivery=${deliveryId} lat=${latitude} lng=${longitude}`);
      } catch (err) {
        console.error('[Socket] Error relaying location:', err);
      }
    });

    // 📍 Presence location update (alimenta o mapa ao vivo do CEO)
    socket.on('presence:location', (data: { latitude: number; longitude: number }) => {
      if (!userId || !data) return;
      const { latitude, longitude } = data;
      if (typeof latitude !== 'number' || typeof longitude !== 'number') return;
      onlineTracker.updateLocation(userId, latitude, longitude);
      emitPresenceUpdateThrottled();
    });

    socket.on('disconnect', () => {
      console.log(`❌ [Socket.io] Desconectado: userId=${userId}`);
      if (userId) {
        onlineTracker.remove(userId);
        emitPresenceUpdateThrottled();
      }
    });
  });
  return io;
};

// 📊 Throttled broadcast de snapshot de presença para a room admin
let presenceEmitTimer: NodeJS.Timeout | null = null;
const PRESENCE_THROTTLE_MS = 2000;
function emitPresenceUpdateThrottled() {
  if (!io) return;
  if (presenceEmitTimer) return;
  presenceEmitTimer = setTimeout(() => {
    presenceEmitTimer = null;
    try {
      io?.to('admin').emit('presence:updated', onlineTracker.snapshot());
    } catch (e) {
      console.warn('[notifier] Failed to emit presence:updated', e);
    }
  }, PRESENCE_THROTTLE_MS);
}

export { io };
export default {
  addClient,
  removeClient,
  notifyMotoboys,
  emitChatMessage,
  emitNewConversation,
  emitConversationReactivated,
  emitConversationDeleted,
  emitConversationDeletedForUser,
  emitMessagesRead,
  initSocket,
  get io() { return io; },
};
