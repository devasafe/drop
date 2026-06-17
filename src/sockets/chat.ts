import { Socket, Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import Conversation from '../models/Conversation';
import logger from '../config/logger';
import env from '../config/env';

interface SocketUser {
  userId: string;
  role: string;
  name: string;
}

interface JwtChatPayload {
  id: string;
  activeRole?: string;
  role: string;
  name: string;
}

// Rate limiter simples por socket (em memória, reseta por minuto)
const eventRateLimits = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(socketId: string, event: string, maxPerMinute = 20): boolean {
  const key = `${socketId}:${event}`;
  const now = Date.now();
  const entry = eventRateLimits.get(key);

  if (!entry || now > entry.resetAt) {
    eventRateLimits.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }

  if (entry.count >= maxPerMinute) return true;

  entry.count++;
  return false;
}

// Limpar rate limit map a cada 2 minutos para evitar memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of eventRateLimits.entries()) {
    if (now > entry.resetAt) eventRateLimits.delete(key);
  }
}, 120_000);

/**
 * Verifica se o usuário é participante da conversa
 */
async function isConversationParticipant(
  conversationId: string,
  userId: string
): Promise<boolean> {
  const conversation = await Conversation.findById(conversationId)
    .select('participant1 participant2 deletedBy isActive')
    .lean();

  if (!conversation) return false;

  const p1Id = (conversation as any).participant1?.userId?.toString();
  const p2Id = (conversation as any).participant2?.userId?.toString();

  return p1Id === userId || p2Id === userId;
}

/**
 * Setup Socket.io para chat em tempo real
 */
export function setupChatSocket(io: Server) {
  // Middleware de autenticação
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error('Auth token required'));
    }

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as JwtChatPayload;

      socket.data.user = {
        userId: decoded.id,
        role: decoded.activeRole || decoded.role,
        name: decoded.name,
      } satisfies SocketUser;

      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as SocketUser;
    logger.debug(`Socket conectado: ${user.userId} (${user.role})`);

    /**
     * Entrar em sala de conversa — com verificação de participante
     */
    socket.on('chat:join', async (data: { conversationId: string }) => {
      const { conversationId } = data;

      if (!conversationId) {
        return socket.emit('chat:error', { message: 'conversationId obrigatório' });
      }

      try {
        const allowed = await isConversationParticipant(conversationId, user.userId);
        const adminRoles = ['ceo', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys'];
        const isAdmin = adminRoles.includes(user.role);

        if (!allowed && !isAdmin) {
          logger.warn(`Tentativa de acesso não autorizado à sala ${conversationId} por ${user.userId}`);
          return socket.emit('chat:error', { message: 'Acesso negado a esta conversa' });
        }

        const room = `chat:${conversationId}`;
        socket.join(room);
        logger.debug(`${user.userId} entrou na sala ${room}`);

        socket.broadcast.to(room).emit('chat:user_joined', {
          userId: user.userId,
          userName: user.name,
          timestamp: new Date(),
        });
      } catch (err) {
        logger.error('Erro ao verificar participante:', err);
        socket.emit('chat:error', { message: 'Erro ao entrar na conversa' });
      }
    });

    /**
     * Broadcast de mensagem com rate limiting
     */
    socket.on(
      'chat:message',
      async (data: { conversationId: string; text: string; attachments?: unknown[] }) => {
        if (isRateLimited(socket.id, 'chat:message', 20)) {
          return socket.emit('chat:error', { message: 'Muitas mensagens. Aguarde um momento.' });
        }

        const { conversationId, text } = data;

        if (!conversationId || !text?.trim()) {
          return socket.emit('chat:error', { message: 'conversationId e text são obrigatórios' });
        }

        if (text.length > 2000) {
          return socket.emit('chat:error', { message: 'Mensagem muito longa (máx. 2000 caracteres)' });
        }

        const room = `chat:${conversationId}`;

        // Garantir que está na sala antes de broadcast
        if (!socket.rooms.has(room)) {
          return socket.emit('chat:error', { message: 'Entre na conversa antes de enviar mensagens' });
        }

        try {
          io.to(room).emit('chat:new_message', {
            _id: `tmp_${Date.now()}_${socket.id}`,
            conversationId,
            senderId: user.userId,
            senderRole: user.role,
            senderName: user.name,
            text: text.trim(),
            attachments: data.attachments ?? [],
            status: 'delivered',
            createdAt: new Date(),
          });
        } catch (err) {
          logger.error('Erro ao fazer broadcast de mensagem:', err);
          socket.emit('chat:error', { message: 'Erro ao enviar mensagem' });
        }
      }
    );

    /**
     * Indicador de digitação com rate limiting
     */
    socket.on('chat:typing', (data: { conversationId: string; isTyping: boolean }) => {
      if (isRateLimited(socket.id, 'chat:typing', 30)) return;

      const { conversationId, isTyping } = data;
      if (!conversationId) return;

      const room = `chat:${conversationId}`;
      if (!socket.rooms.has(room)) return;

      socket.broadcast.to(room).emit('chat:user_typing', {
        userId: user.userId,
        userName: user.name,
        isTyping,
        timestamp: new Date(),
      });
    });

    /**
     * Marcar mensagem como lida
     */
    socket.on('chat:mark_read', async (data: { conversationId: string; messageId: string }) => {
      const { conversationId, messageId } = data;
      if (!conversationId || !messageId) return;

      const room = `chat:${conversationId}`;
      // ✅ SEGURANÇA: só pode marcar como lida quem está na sala (já autorizado no join)
      if (!socket.rooms.has(room)) return;

      try {
        io.to(room).emit('chat:message_read', {
          messageId,
          userId: user.userId,
          readAt: new Date(),
        });
      } catch (err) {
        logger.error('Erro ao marcar como lida:', err);
      }
    });

    /**
     * Sair da conversa
     */
    socket.on('chat:leave', (data: { conversationId: string }) => {
      const { conversationId } = data;
      if (!conversationId) return;

      const room = `chat:${conversationId}`;
      socket.leave(room);

      socket.broadcast.to(room).emit('chat:user_left', {
        userId: user.userId,
        userName: user.name,
        timestamp: new Date(),
      });
    });

    socket.on('disconnect', () => {
      logger.debug(`Socket desconectado: ${user.userId}`);
      // Limpar entradas de rate limit deste socket
      for (const key of eventRateLimits.keys()) {
        if (key.startsWith(socket.id)) eventRateLimits.delete(key);
      }
    });

    socket.on('error', (err) => {
      logger.error(`Erro de socket para ${user.userId}:`, err);
    });
  });

  logger.info('Chat Socket.io configurado');
}

/**
 * Emite notificação para usuário específico (fora do chat)
 */
export function notifyUser(io: Server, userId: string, event: string, data: unknown): void {
  io.to(`user:${userId}`).emit(event, data);
}

/**
 * Emite evento para uma sala de conversa
 */
export function emitToRoom(io: Server, conversationId: string, event: string, data: unknown): void {
  io.to(`chat:${conversationId}`).emit(event, data);
}
