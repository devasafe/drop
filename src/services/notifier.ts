import { Response } from 'express';
import { Server as IOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { onlineTracker } from './onlineTracker';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import { authorizeRoom, canJoinMotoboysRoom, isConversationParticipant, ownedStoreIds, adminRolesOf } from './socketRooms';
import { isOriginAllowed } from '../config/corsOrigins';
import { isValidCoordinate } from '../utils/geo';
import logger from '../config/logger';
import { notifyAdmins } from './pushService';

const PRESENCE_MIN_INTERVAL_MS = 10_000;

// Fonte única de verdade do segredo (config/env garante obrigatoriedade em produção)
const JWT_SECRET = env.JWT_SECRET;

const clients = new Map<string, Set<Response>>();
// Papel com que cada usuário abriu o SSE (o fallback de motoboys filtra por ele).
const clientRoles = new Map<string, string>();
let io: IOServer | null = null;

const send = (res: Response, event: string, data: any) => {
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (err) {
    // ignore
  }
};

export const addClient = (userId: string, res: Response, role?: string) => {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId)!.add(res);
  if (role) clientRoles.set(userId, role);
};

export const removeClient = (userId: string, res: Response) => {
  const set = clients.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) {
    clients.delete(userId);
    clientRoles.delete(userId);
  }
};

/** `excludedUserIds`: motoboys que o admin tirou da corrida (excludedMotoboyIds) não recebem o aviso. */
export const notifyMotoboys = (payload: any, excludedUserIds: string[] = []) => {
  // If Socket.IO is initialized, broadcast to motoboys room
  if (io) {
    try {
      io.to('motoboys').except(excludedUserIds.map((id) => `user:${id}`)).emit('notification', payload);
      // eslint-disable-next-line no-console
      logger.debug('[notifier] notification sent to motoboys room');
      return;
    } catch (e) {
      // fallback to SSE
      // eslint-disable-next-line no-console
      console.warn('[notifier] Socket.IO fallback to SSE', e);
    }
  }

  // fallback SSE: só para quem poderia estar na sala `motoboys` (antes: todos os clientes SSE)
  for (const [userId, set] of clients.entries()) {
    if (clientRoles.get(userId) !== 'motoboy' || excludedUserIds.includes(userId)) continue;
    canJoinMotoboysRoom({ id: userId, role: 'motoboy' })
      .then((ok) => { if (ok) set.forEach((res) => send(res, 'notification', payload)); })
      .catch(() => undefined);
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
    logger.debug(`📨 [NOTIFIER] Emitindo chat:new_message para sala: ${roomName}`);
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
    logger.debug(`📢 [NOTIFIER] Emitindo nova conversa aos usuários: ${userId1}, ${userId2}`);
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
    logger.debug(`🔄 [NOTIFIER] Emitindo reativação de conversa para usuário: ${userId}`);
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
    logger.debug(`🗑️ [NOTIFIER] Emitindo deleção permanente de conversa aos usuários: ${userId1}, ${userId2}`);
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
    logger.debug(`🗑️ [NOTIFIER] Emitindo deleção de conversa para um usuário: ${userId}`);
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
    logger.debug(`✓✓ [NOTIFIER] Emitindo mensagens como lidas em conversa: ${conversationId}`);
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
/**
 * Posição do motoboy numa corrida: grava o ponto do caminho (antifraude, DeliveryTrackPoint),
 * tira a corrida do estado "sinal perdido" e repassa ao cliente e à loja
 * (`delivery:location_updated`). Só o motoboy atribuído, só com a corrida em andamento.
 * Usado pelo socket (app aberto) e pelo POST /deliveries/location (app Android com a tela
 * apagada, onde o socket cai).
 */
export async function relayRideLocation(
  motoboyId: string,
  deliveryId: string,
  pos: { latitude: number; longitude: number; accuracy?: number; timestamp?: string; simulated?: boolean },
): Promise<void> {
  try {
    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: { orderId: true, motoboyId: true, status: true, signalLostAt: true },
    });
    // Segurança: só o motoboy atribuído pode enviar localização
    if (!delivery || delivery.motoboyId?.toString() !== motoboyId) return;
    if (delivery.status !== 'assigned' && delivery.status !== 'picked') return;

    await prisma.deliveryTrackPoint.create({
      data: {
        deliveryId, motoboyId, lat: pos.latitude, lng: pos.longitude,
        accuracy: Number.isFinite(pos.accuracy) ? pos.accuracy : null, simulated: pos.simulated === true,
      },
    });
    if (delivery.signalLostAt) await signalBack(deliveryId, motoboyId);
    if (!io) return;

    const order = await prisma.order.findUnique({
      where: { id: String(delivery.orderId) },
      select: { customerId: true, storeId: true },
    });
    if (!order) return;

    const locationPayload = {
      _id: deliveryId,
      location: { latitude: pos.latitude, longitude: pos.longitude, accuracy: pos.accuracy },
      estimatedTime: null,
      timestamp: pos.timestamp || new Date().toISOString(),
    };
    io.to(`user:${order.customerId}`).emit('delivery:location_updated', locationPayload);
    io.to(`store:${order.storeId}`).emit('delivery:location_updated', locationPayload);
    logger.debug(`📍 Location relayed: delivery=${deliveryId} lat=${pos.latitude} lng=${pos.longitude}`);
  } catch (err) {
    console.error('[relayRideLocation] erro:', err);
  }
}

/** A posição voltou depois do alerta de sinal perdido: limpa a marca e avisa o admin. */
async function signalBack(deliveryId: string, motoboyId: string): Promise<void> {
  const cleared = await prisma.delivery.updateMany({ where: { id: deliveryId, signalLostAt: { not: null } }, data: { signalLostAt: null } });
  if (cleared.count === 0) return;
  const m = await prisma.user.findUnique({ where: { id: motoboyId }, select: { name: true } });
  const payload = { title: 'Sinal do motoboy voltou', body: `${m?.name || 'O motoboy'} voltou a mandar a posição.`, url: '/admin/mapa', tag: `sinal-${deliveryId}` };
  io?.to('admin').emit('admin:notification', payload);
  notifyAdmins(payload);
}

/** Repassa a posição para todas as corridas em andamento (assigned/picked) do motoboy. */
export async function relayActiveRidesLocation(
  motoboyId: string,
  pos: { latitude: number; longitude: number; accuracy?: number; simulated?: boolean },
): Promise<void> {
  try {
    const rides = await prisma.delivery.findMany({
      where: { motoboyId, status: { in: ['assigned', 'picked'] } },
      select: { id: true },
    });
    await Promise.all(rides.map((r) => relayRideLocation(motoboyId, r.id, pos)));
  } catch (err) {
    console.error('[relayActiveRidesLocation] erro:', err);
  }
}

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
      if (!dbUser || dbUser.status === 'blocked' || dbUser.status === 'deleted' || !dbRoles.includes(String(decoded.role))) {
        return next(new Error('Forbidden'));
      }
      // `roles` do banco: papéis de equipe somam as salas de admin (acréscimo, não área ativa).
      socket.data.user = { id: decoded.id, role: decoded.role, roles: (dbUser.roles || []).map(String) };
      return next();
    } catch (err) {
      return next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.user?.id;
    const role = socket.data.user?.role;
    const roles: string[] = socket.data.user?.roles || [];
    logger.debug(`✅ [Socket.io] Conectado: userId=${userId}, role=${role}`);

    // 📊 Registrar no tracker de presença em tempo real (para analytics do CEO)
    if (userId && role) {
      onlineTracker.set(userId, { role, socketId: socket.id });
      emitPresenceUpdateThrottled();
    }

    // 📍 Entrar automaticamente na sala do usuário para receber notificações pessoais
    if (userId) {
      socket.join(`user:${userId}`);
      logger.debug(`🔌 [Socket.io] Usuário ${userId} entrou na sala user:${userId}`);
    }
    
    if (userId && role) {
      // CLIENTE (customer)
      if (role === 'cliente') {
        socket.join(`user:${userId}`);
        logger.debug(`   └─ Sala: user:${userId}`);
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
      // ADMIN (ceo ativo, marketing, gerentes): papel ativo + papéis de equipe da conta
      const adminRoles = adminRolesOf({ id: userId, role, roles });
      if (adminRoles.length > 0) {
        socket.join('admin');
        adminRoles.forEach((r) => socket.join(`admin:${r}`));
        logger.debug(`   ├─ Salas: admin, ${adminRoles.map((r) => `admin:${r}`).join(', ')}`);
      }
    }

    // join pedido pelo cliente: o SERVIDOR decide (authorizeRoom). Sala não autorizada
    // é ignorada — antes qualquer usuário entrava em admin, store:<qualquer>, user:<outro>.
    socket.on('join', async (data) => {
      const room = data?.room;
      try {
        if (!(await authorizeRoom({ id: userId, role, roles }, room))) {
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
      await relayRideLocation(String(userId), String(deliveryId), { latitude, longitude, accuracy, timestamp });
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
      logger.debug(`❌ [Socket.io] Desconectado: userId=${userId}`);
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
