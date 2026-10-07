import { Response } from 'express';
import { Server as IOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { onlineTracker } from './onlineTracker';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import { authorizeRoom, canJoinMotoboysRoom, isConversationParticipant, ownedStoreIds, ADMIN_ROLES } from './socketRooms';
import { isOriginAllowed } from '../config/corsOrigins';
import { isValidCoordinate } from '../utils/geo';

const PRESENCE_MIN_INTERVAL_MS = 10_000;

// Fonte única de verdade do segredo (config/env garante obrigatoriedade em produção)
const JWT_SECRET = env.JWT_SECRET;

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

/**
 * Reavalia a sala `motoboys` das conexões abertas do usuário (após decisão de KYC).
 * Sem isso, o motoboy aprovado só passava a receber corridas depois de reconectar.
 */
export const syncMotoboysRoom = async (userId: string): Promise<void> => {
  if (!io || !userId) return;
  const sockets = (await io.in(`user:${userId}`).fetchSockets()).filter((s) => s.data.user?.role === 'motoboy');
  if (!sockets.length) return;
  const ok = await canJoinMotoboysRoom({ id: String(userId), role: 'motoboy' });
  sockets.forEach((s) => (ok ? s.join('motoboys') : s.leave('motoboys')));
};

/**
 * Derruba as conexões do usuário (bloqueio, troca de papel). O `auth:force_logout` sai
 * antes; o atraso curto deixa o evento chegar. O handshake recusa a reconexão (status/papel no banco).
 */
export const disconnectUser = (userId: string, delayMs = 500): void => {
  if (!io || !userId) return;
  setTimeout(() => io?.in(`user:${userId}`).disconnectSockets(true), delayMs);
};

export const initSocket = (server: any) => {
  // Mesma política de origem da API HTTP. `cors` só cobre o polling; o `allowRequest`
  // barra também a conexão direta por WebSocket (que autentica pelo cookie da vítima).
  io = new IOServer(server, {
    cors: {
      origin: (origin, cb) => (isOriginAllowed(origin) ? cb(null, true) : cb(new Error('Socket CORS not allowed'))),
      credentials: true,
    },
    allowRequest: (req, cb) => cb(null, isOriginAllowed(req.headers.origin)),
  });

  io.use(async (socket: Socket, next: (err?: any) => void) => {
    // Token via handshake auth (compat) OU via cookie httpOnly (novo)
    let token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      const cookieHeader = socket.handshake.headers?.cookie || '';
      const m = cookieHeader.split(';').map((c) => c.trim()).find((c) => c.startsWith('token='));
      if (m) token = decodeURIComponent(m.slice('token='.length));
    }
    if (!token) return next(new Error('Authentication error'));
    try {
      const decoded = jwt.verify(token as string, JWT_SECRET) as any;
      // Permite todos os roles (incluindo admin roles)
      const allowedRoles = ['cliente', 'motoboy', 'store', 'seller', 'lojista', 'ceo', 'marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys'];
      if (!allowedRoles.includes(decoded.role)) {
        return next(new Error('Forbidden'));
      }
      // JWT é stateless: confere no banco se a conta segue ativa e se ainda tem o papel
      // do token (papel removido/rebaixado não continua recebendo eventos da sala).
      const dbUser = await prisma.user.findUnique({
        where: { id: String(decoded.id) },
        select: { status: true, role: true, roles: true },
      });
      const dbRoles = [...(dbUser?.roles || []), dbUser?.role].filter(Boolean).map(String);
      if (!dbUser || dbUser.status === 'blocked' || !dbRoles.includes(String(decoded.role))) {
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
      // MOTOBOY — o pool (sala `motoboys`) só para quem tem KYC aprovado
      if (role === 'motoboy') {
        canJoinMotoboysRoom({ id: userId, role })
          .then((ok) => { if (ok) socket.join('motoboys'); })
          .catch((e) => console.warn('[Socket.io] falha ao avaliar sala motoboys', e));
      }
      // LOJA (store/seller/lojista) — entra nas salas das lojas de que é DONO
      if (role === 'store' || role === 'seller' || role === 'lojista') {
        ownedStoreIds(userId)
          .then((ids) => ids.forEach((id) => socket.join(`store:${id}`)))
          .catch((e) => console.warn('[Socket.io] falha ao carregar lojas do dono', e));
      }
      // ADMIN ROLES (ceo, marketing, gerentes)
      if (ADMIN_ROLES.includes(role)) {
        socket.join('admin');
        socket.join(`admin:${role}`);
        socket.join(`user:${userId}`);
        console.log(`   ├─ Sala: admin`);
        console.log(`   ├─ Sala: admin:${role}`);
        console.log(`   └─ Sala: user:${userId}`);
      }
    }

    // join pedido pelo cliente: o SERVIDOR decide (authorizeRoom). Sala não autorizada
    // é ignorada — antes qualquer usuário entrava em admin, store:<qualquer>, user:<outro>.
    socket.on('join', async (data) => {
      const room = data?.room;
      try {
        if (!(await authorizeRoom({ id: userId, role }, room))) {
          console.warn(`[Socket.io] join negado: userId=${userId} role=${role} room=${String(room)}`);
          return;
        }
        socket.join(room);
        if (typeof room === 'string' && room.startsWith('store:')) {
          socket.data.storeId = room.slice('store:'.length);
        }
      } catch (e) {
        console.warn('[Socket.io] erro ao autorizar join', e);
      }
    });

    // 💬 Abrir/fechar conversa: entra em `conversation:<id>` só quem participa.
    socket.on('chat:join', async (data) => {
      const conversationId = data?.conversationId;
      try {
        if (await isConversationParticipant(conversationId, userId)) socket.join(`conversation:${conversationId}`);
      } catch (e) {
        console.warn('[Socket.io] erro ao autorizar chat:join', e);
      }
    });
    socket.on('chat:leave', (data) => {
      if (data?.conversationId) socket.leave(`conversation:${data.conversationId}`);
    });

    // ⌨️ Typing indicator
    socket.on('chat:typing', async (data) => {
      if (data && data.conversationId && (await isConversationParticipant(data.conversationId, userId))) {
        io?.to(`conversation:${data.conversationId}`).emit('chat:user_typing', {
          userId,
          conversationId: data.conversationId,
          isTyping: data.isTyping
        });
      }
    });

    // ✓ Delivery confirmation
    socket.on('chat:delivery_confirm', async (data) => {
      if (data && data.messageId && data.conversationId && (await isConversationParticipant(data.conversationId, userId))) {
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

      const { deliveryId, latitude, longitude, accuracy, timestamp } = data || ({} as any);
      if (!deliveryId || !isValidCoordinate(latitude, longitude)) return;

      try {
        const delivery = await prisma.delivery.findUnique({
          where: { id: String(deliveryId) },
          select: { orderId: true, motoboyId: true },
        });

        // Segurança: só o motoboy atribuído pode enviar localização
        if (!delivery || delivery.motoboyId?.toString() !== userId) return;

        const order = await prisma.order.findUnique({
          where: { id: String(delivery.orderId) },
          select: { customerId: true, storeId: true },
        });

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
    // Só coordenada válida e no máximo uma a cada PRESENCE_MIN_INTERVAL_MS por conexão
    // (o app envia a cada 60 s). Posição é autodeclarada: serve ao mapa, não a decisões.
    let lastPresenceAt = 0;
    socket.on('presence:location', (data: { latitude: number; longitude: number }) => {
      if (!userId || !data || !isValidCoordinate(data.latitude, data.longitude)) return;
      const now = Date.now();
      if (now - lastPresenceAt < PRESENCE_MIN_INTERVAL_MS) return;
      lastPresenceAt = now;
      onlineTracker.updateLocation(userId, data.latitude, data.longitude);
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
  syncMotoboysRoom,
  disconnectUser,
  initSocket,
  get io() { return io; },
};
