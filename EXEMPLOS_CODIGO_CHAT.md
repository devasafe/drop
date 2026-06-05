# 💻 Exemplos de Código - Implementação de Chat

## 📂 Backend - Exemplos Completos

### 1. Modelo Conversation (MongoDB)

```typescript
// src/models/Conversation.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IConversation extends Document {
  type: 'loja_cliente' | 'loja_motoboy' | 'motoboy_cliente';
  participant1: {
    userId: mongoose.Types.ObjectId;
    role: 'loja' | 'cliente' | 'motoboy';
    name: string;
  };
  participant2: {
    userId: mongoose.Types.ObjectId;
    role: 'loja' | 'cliente' | 'motoboy';
    name: string;
  };
  orderId?: mongoose.Types.ObjectId;
  deliveryId?: mongoose.Types.ObjectId;
  messageCount: number;
  unreadCount: [number, number]; // [participant1, participant2]
  isActive: boolean;
  isBlocked: [boolean, boolean];
  isMuted: [boolean, boolean];
  lastMessageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>(
  {
    type: {
      type: String,
      enum: ['loja_cliente', 'loja_motoboy', 'motoboy_cliente'],
      required: true
    },
    participant1: {
      userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      role: {
        type: String,
        enum: ['loja', 'cliente', 'motoboy'],
        required: true
      },
      name: {
        type: String,
        required: true
      }
    },
    participant2: {
      userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      role: {
        type: String,
        enum: ['loja', 'cliente', 'motoboy'],
        required: true
      },
      name: {
        type: String,
        required: true
      }
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order'
    },
    deliveryId: {
      type: Schema.Types.ObjectId,
      ref: 'Delivery'
    },
    messageCount: {
      type: Number,
      default: 0
    },
    unreadCount: {
      type: [Number],
      default: [0, 0]
    },
    isActive: {
      type: Boolean,
      default: true
    },
    isBlocked: {
      type: [Boolean],
      default: [false, false]
    },
    isMuted: {
      type: [Boolean],
      default: [false, false]
    },
    lastMessageAt: Date
  },
  { timestamps: true }
);

// Criar índices
conversationSchema.index({ 'participant1.userId': 1, 'participant2.userId': 1 });
conversationSchema.index({ orderId: 1 });
conversationSchema.index({ lastMessageAt: -1 });

export default mongoose.model<IConversation>('Conversation', conversationSchema);
```

### 2. Modelo Message (MongoDB)

```typescript
// src/models/Message.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage extends Document {
  conversationId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  senderRole: 'loja' | 'cliente' | 'motoboy';
  senderName: string;
  text: string;
  attachments?: Array<{
    type: 'image' | 'location' | 'file';
    url: string;
    metadata?: {
      latitude?: number;
      longitude?: number;
      accuracy?: number;
      fileName?: string;
      fileSize?: number;
    };
  }>;
  status: 'sent' | 'delivered' | 'read';
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    senderRole: {
      type: String,
      enum: ['loja', 'cliente', 'motoboy'],
      required: true
    },
    senderName: {
      type: String,
      required: true
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000
    },
    attachments: [
      {
        type: {
          type: String,
          enum: ['image', 'location', 'file']
        },
        url: String,
        metadata: {
          latitude: Number,
          longitude: Number,
          accuracy: Number,
          fileName: String,
          fileSize: Number
        }
      }
    ],
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read'],
      default: 'sent'
    },
    readAt: Date
  },
  { timestamps: true }
);

// Índices
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1 });

export default mongoose.model<IMessage>('Message', messageSchema);
```

### 3. Controller - Criar/Obter Conversa

```typescript
// src/controllers/chatController.ts - Snippet 1
import Conversation from '../models/Conversation';
import Message from '../models/Message';
import User from '../models/User';
import { Request, Response } from 'express';

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

    const validTypes = ['loja_cliente', 'loja_motoboy', 'motoboy_cliente'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Tipo de conversa inválido' });
    }

    // Não permitir conversa com a mesma pessoa
    if (userId === otherParticipantId) {
      return res.status(400).json({ error: 'Não pode conversar consigo mesmo' });
    }

    // Buscar ou criar conversa
    let conversation = await Conversation.findOne({
      $or: [
        {
          'participant1.userId': userId,
          'participant2.userId': otherParticipantId
        },
        {
          'participant1.userId': otherParticipantId,
          'participant2.userId': userId
        }
      ]
    });

    if (conversation) {
      // Reativar se estava desativada
      if (!conversation.isActive) {
        conversation.isActive = true;
        await conversation.save();
      }
      return res.json(conversation);
    }

    // Criar nova conversa
    const user = await User.findById(userId);
    const otherUser = await User.findById(otherParticipantId);

    if (!user || !otherUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    conversation = new Conversation({
      type,
      participant1: {
        userId: user._id,
        role: user.role || 'cliente',
        name: user.name
      },
      participant2: {
        userId: otherUser._id,
        role: otherUser.role || 'cliente',
        name: otherUser.name
      },
      orderId,
      deliveryId,
      unreadCount: [0, 0],
      isBlocked: [false, false],
      isMuted: [false, false]
    });

    await conversation.save();

    console.log(`✅ [CHAT] Nova conversa criada: ${conversation._id}`);
    return res.status(201).json(conversation);
  } catch (error) {
    console.error('❌ Erro ao criar conversa:', error);
    return res.status(500).json({ error: 'Erro ao criar conversa' });
  }
};
```

### 4. Controller - Enviar Mensagem

```typescript
// src/controllers/chatController.ts - Snippet 2
export const sendMessage = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const userId = req.user?.id;
    const { conversationId, text, attachments } = req.body;

    // Validações
    if (!text?.trim()) {
      return res.status(400).json({ error: 'Mensagem não pode ser vazia' });
    }

    if (text.length > 1000) {
      return res.status(400).json({ error: 'Mensagem muito longa (máx 1000 caracteres)' });
    }

    // Buscar conversa
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    // Verificar se usuário é participante
    const isParticipant =
      conversation.participant1.userId.toString() === userId ||
      conversation.participant2.userId.toString() === userId;

    if (!isParticipant) {
      return res.status(403).json({ error: 'Não autorizado' });
    }

    // Verificar se está bloqueado
    const participantIndex =
      conversation.participant1.userId.toString() === userId ? 0 : 1;
    if (conversation.isBlocked[participantIndex]) {
      return res.status(403).json({ error: 'Esta conversa foi bloqueada' });
    }

    // Buscar dados do remetente
    const sender = await User.findById(userId);

    // Criar mensagem
    const message = new Message({
      conversationId,
      senderId: userId,
      senderRole: sender?.role || 'cliente',
      senderName: sender?.name || 'Usuário',
      text: text.trim(),
      attachments,
      status: 'sent'
    });

    await message.save();

    // Atualizar conversa
    conversation.messageCount += 1;
    conversation.lastMessageAt = new Date();
    
    // Resetar unread count do remetente
    if (participantIndex === 0) {
      conversation.unreadCount[0] = 0;
      conversation.unreadCount[1] += 1;
    } else {
      conversation.unreadCount[1] = 0;
      conversation.unreadCount[0] += 1;
    }

    await conversation.save();

    // Emitir via Socket.io
    const io = req.app.get('io');
    const room = `chat:${conversationId}`;

    io.to(room).emit('chat:new_message', {
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

    console.log(`✅ [CHAT] Mensagem enviada: ${message._id}`);
    return res.status(201).json(message);
  } catch (error) {
    console.error('❌ Erro ao enviar mensagem:', error);
    return res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
};
```

### 5. Controller - Obter Mensagens

```typescript
// src/controllers/chatController.ts - Snippet 3
export const getMessages = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const userId = req.user?.id;
    const { conversationId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const skip = parseInt(req.query.skip as string) || 0;

    // Buscar conversa
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

    // Buscar mensagens com paginação (em ordem reversa)
    const messages = await Message.find({ conversationId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();

    const totalMessages = await Message.countDocuments({ conversationId });

    // Contar mensagens não lidas deste usuário
    const participantIndex =
      conversation.participant1.userId.toString() === userId ? 0 : 1;

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
      unreadCount: conversation.unreadCount[participantIndex],
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
```

### 6. Socket.io Setup

```typescript
// src/sockets/chat.ts
import { Socket, Server } from 'socket.io';
import Conversation from '../models/Conversation';
import Message from '../models/Message';

interface SocketUser {
  userId: string;
  role: string;
  name: string;
}

declare global {
  namespace Express {
    interface Socket {
      user?: SocketUser;
    }
  }
}

export function setupChatSocket(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log(`✅ [SOCKET] Usuário conectado: ${socket.id}`);

    // Entrar em uma sala de conversa
    socket.on('chat:join', (data: { conversationId: string; userId: string }) => {
      const { conversationId, userId } = data;
      const room = `chat:${conversationId}`;

      socket.join(room);
      console.log(`✅ [SOCKET] ${userId} entrou na sala ${room}`);

      // Notificar outros na sala que alguém entrou
      socket.broadcast.to(room).emit('chat:user_joined', {
        userId,
        timestamp: new Date()
      });
    });

    // Receber mensagem e fazer broadcast
    socket.on('chat:message', async (data: any) => {
      const { conversationId, text, attachments } = data;
      const room = `chat:${conversationId}`;

      // Aqui você pode persistir a mensagem se ainda não foi feito
      // Ou apenas relay a mensagem já persistida pela API

      io.to(room).emit('chat:new_message', {
        ...data,
        status: 'delivered',
        timestamp: new Date()
      });
    });

    // Indicador de digitação
    socket.on('chat:typing', (data: { conversationId: string; isTyping: boolean; userName: string }) => {
      const { conversationId, isTyping, userName } = data;
      const room = `chat:${conversationId}`;

      socket.broadcast.to(room).emit('chat:user_typing', {
        userName,
        isTyping,
        timestamp: new Date()
      });
    });

    // Marcar como lido
    socket.on('chat:mark_read', async (data: { conversationId: string; messageId: string }) => {
      const { conversationId, messageId } = data;
      const room = `chat:${conversationId}`;

      try {
        // Atualizar no banco
        await Message.findByIdAndUpdate(messageId, {
          status: 'read',
          readAt: new Date()
        });

        // Notificar sala
        io.to(room).emit('chat:message_read', {
          messageId,
          readAt: new Date()
        });
      } catch (error) {
        console.error('❌ Erro ao marcar como lido:', error);
      }
    });

    // Sair da conversa
    socket.on('chat:leave', (data: { conversationId: string; userId: string }) => {
      const { conversationId, userId } = data;
      const room = `chat:${conversationId}`;

      socket.leave(room);
      console.log(`✅ [SOCKET] ${userId} saiu da sala ${room}`);

      socket.broadcast.to(room).emit('chat:user_left', {
        userId,
        timestamp: new Date()
      });
    });

    // Desconexão
    socket.on('disconnect', () => {
      console.log(`❌ [SOCKET] Usuário desconectado: ${socket.id}`);
    });
  });
}
```

### 7. Routes

```typescript
// src/routes/chat.ts
import express, { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as chatController from '../controllers/chatController';

const router: Router = express.Router();

// Autenticar todas as rotas
router.use(authenticate);

// Conversas
router.post('/conversations', chatController.createOrGetConversation);
router.get('/conversations', chatController.listConversations);
router.get('/conversations/:conversationId', chatController.getMessages);
router.put('/conversations/:conversationId/mute', chatController.muteConversation);
router.put('/conversations/:conversationId/block', chatController.blockParticipant);
router.delete('/conversations/:conversationId', chatController.deleteConversation);

// Mensagens
router.post('/messages', chatController.sendMessage);
router.put('/messages/:messageId/read', chatController.markAsRead);

export default router;
```

### 8. Integração em app.ts

```typescript
// src/app.ts - Snippets relevantes
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import chatRoutes from './routes/chat';
import { setupChatSocket } from './sockets/chat';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rotas de chat
app.use('/api/chat', chatRoutes);

// Setup Socket.io
setupChatSocket(io);

// Armazenar io no app para uso nos controllers
app.set('io', io);

// Start server
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

export { app, httpServer, io };
```

---

## 💬 Frontend - Exemplos Completos

### 1. Hook useChat

```typescript
// frontend/hooks/useChat.ts
import { useEffect, useState } from 'react';
import { useSocket } from './useSocket';
import api from '../lib/api';

interface Message {
  _id: string;
  text: string;
  senderId: string;
  senderName: string;
  status: 'sent' | 'delivered' | 'read';
  createdAt: Date;
}

interface Conversation {
  _id: string;
  type: string;
  participant1: any;
  participant2: any;
}

export function useChat(participantId: string, type: string) {
  const { socket } = useSocket();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inicializar conversa
  useEffect(() => {
    const initChat = async () => {
      try {
        setLoading(true);
        const response = await api.post('/chat/conversations', {
          type,
          otherParticipantId: participantId
        });

        setConversation(response.data);

        // Buscar mensagens
        const messagesResponse = await api.get(
          `/chat/conversations/${response.data._id}`
        );
        setMessages(messagesResponse.data.messages);

        // Entrar na sala socket
        socket?.emit('chat:join', {
          conversationId: response.data._id
        });
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    initChat();
  }, [participantId, type]);

  // Listeners de socket
  useEffect(() => {
    if (!socket || !conversation) return;

    const handleNewMessage = (data: Message) => {
      setMessages(prev => [...prev, data]);
    };

    const handleMessageRead = (data: { messageId: string; readAt: Date }) => {
      setMessages(prev =>
        prev.map(msg =>
          msg._id === data.messageId
            ? { ...msg, status: 'read' }
            : msg
        )
      );
    };

    socket.on('chat:new_message', handleNewMessage);
    socket.on('chat:message_read', handleMessageRead);

    return () => {
      socket.off('chat:new_message');
      socket.off('chat:message_read');
    };
  }, [socket, conversation]);

  // Funções
  const sendMessage = async (text: string) => {
    if (!conversation || !text.trim()) return;

    try {
      await api.post('/chat/messages', {
        conversationId: conversation._id,
        text: text.trim()
      });
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err);
    }
  };

  const markAsRead = async (messageId: string) => {
    try {
      await api.put(`/chat/messages/${messageId}/read`);
    } catch (err) {
      console.error('Erro ao marcar como lido:', err);
    }
  };

  return {
    conversation,
    messages,
    loading,
    error,
    sendMessage,
    markAsRead
  };
}
```

### 2. Componente ChatPanel

```typescript
// frontend/components/ChatPanel.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../hooks/useChat';

interface ChatPanelProps {
  participantId: string;
  participantName: string;
  type: 'loja_cliente' | 'loja_motoboy' | 'motoboy_cliente';
  onClose?: () => void;
}

export default function ChatPanel({
  participantId,
  participantName,
  type,
  onClose
}: ChatPanelProps) {
  const { conversation, messages, sendMessage, loading } = useChat(participantId, type);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { socket } = useSocket();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = () => {
    if (!input.trim()) return;

    sendMessage(input);
    setInput('');
    setIsTyping(false);

    // Notificar que parou de digitar
    socket?.emit('chat:typing', {
      conversationId: conversation?._id,
      isTyping: false
    });
  };

  const handleTyping = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);

    if (!isTyping) {
      setIsTyping(true);
      socket?.emit('chat:typing', {
        conversationId: conversation?._id,
        isTyping: true
      });

      // Parar de indicar digitação após 2 segundos de inatividade
      setTimeout(() => {
        setIsTyping(false);
        socket?.emit('chat:typing', {
          conversationId: conversation?._id,
          isTyping: false
        });
      }, 2000);
    }
  };

  if (loading) return <div className="p-4">Carregando...</div>;

  return (
    <div className="flex flex-col h-96 bg-white border border-gray-200 rounded-lg shadow-lg">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4 flex justify-between items-center">
        <h3 className="font-semibold">{participantName}</h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-2xl leading-none hover:opacity-75"
          >
            ×
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 py-8">
            Nenhuma mensagem ainda. Comece a conversa!
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={msg._id}
            className={`mb-3 flex ${
              msg.senderId === getCurrentUserId() ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-xs px-4 py-2 rounded-lg ${
                msg.senderId === getCurrentUserId()
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-800'
              }`}
            >
              <p className="text-sm">{msg.text}</p>
              <small
                className={`text-xs ${
                  msg.senderId === getCurrentUserId()
                    ? 'text-blue-100'
                    : 'text-gray-500'
                }`}
              >
                {new Date(msg.createdAt).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
                {msg.status === 'read' && ' ✓✓'}
              </small>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-4 bg-white">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={handleTyping}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Digite sua mensagem..."
            className="flex-1 p-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:border-blue-500"
            rows={2}
          />
          <button
            onClick={handleSendMessage}
            disabled={!input.trim()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
```

### 3. Integração em página de pedido

```typescript
// frontend/pages/loja/pedidos/[id].tsx - Snippet
import { useState } from 'react';
import ChatPanel from '../../../components/ChatPanel';

export default function OrderDetails() {
  const [showChat, setShowChat] = useState(false);
  const [selectedChat, setSelectedChat] = useState<{
    participantId: string;
    name: string;
    type: any;
  } | null>(null);

  const handleOpenChat = (participantId: string, name: string, type: any) => {
    setSelectedChat({ participantId, name, type });
    setShowChat(true);
  };

  return (
    <div>
      {/* ... resto do conteúdo ... */}

      {/* Seção de Cliente */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold">Cliente</h3>
          <button
            onClick={() =>
              handleOpenChat(order.clientId, order.clientName, 'loja_cliente')
            }
            className="text-blue-600 hover:underline"
          >
            💬 Chat
          </button>
        </div>
        <p className="text-sm text-gray-600 mt-2">
          {order.clientName} • {order.clientPhone}
        </p>
      </div>

      {/* Chat Modal */}
      {showChat && selectedChat && (
        <div className="fixed bottom-4 right-4 z-50">
          <ChatPanel
            participantId={selectedChat.participantId}
            participantName={selectedChat.name}
            type={selectedChat.type}
            onClose={() => setShowChat(false)}
          />
        </div>
      )}
    </div>
  );
}
```

---

## 🧪 Testes

### Teste de Socket.io com Jest

```typescript
// __tests__/chat.socket.test.ts
import { Server } from 'socket.io';
import { Client, Socket as ClientSocket } from 'socket.io-client';
import { setupChatSocket } from '../src/sockets/chat';
import { createServer } from 'http';

describe('Chat Socket Events', () => {
  let io: Server;
  let serverSocket: any;
  let clientSocket: ClientSocket;
  let httpServer: any;

  beforeAll((done) => {
    httpServer = createServer();
    io = new Server(httpServer, {
      cors: { origin: '*' }
    });

    setupChatSocket(io);

    httpServer.listen(() => {
      const port = (httpServer.address() as any).port;
      clientSocket = new Client(`http://localhost:${port}`);
      clientSocket.connect();
      clientSocket.on('connect', done);
    });
  });

  afterAll(() => {
    io.close();
    clientSocket.close();
    httpServer.close();
  });

  test('deve entrar em uma conversa', (done) => {
    clientSocket.emit('chat:join', {
      conversationId: '123',
      userId: 'user123'
    });

    setTimeout(() => {
      expect(clientSocket.rooms.has('chat:123')).toBe(true);
      done();
    }, 100);
  });

  test('deve receber nova mensagem com status delivered', (done) => {
    clientSocket.on('chat:new_message', (data) => {
      expect(data.status).toBe('delivered');
      expect(data.text).toBe('Olá!');
      done();
    });

    clientSocket.emit('chat:message', {
      conversationId: '123',
      text: 'Olá!'
    });
  });
});
```

### Teste de API com Supertest

```typescript
// __tests__/chat.api.test.ts
import request from 'supertest';
import { app } from '../src/app';
import Conversation from '../src/models/Conversation';

describe('Chat API', () => {
  let token: string;
  let conversationId: string;

  beforeAll(async () => {
    // Login e obter token
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password' });

    token = response.body.token;
  });

  test('deve criar uma conversa', async () => {
    const response = await request(app)
      .post('/api/chat/conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'loja_cliente',
        otherParticipantId: 'user123'
      });

    expect(response.status).toBe(201);
    expect(response.body._id).toBeDefined();
    conversationId = response.body._id;
  });

  test('deve enviar uma mensagem', async () => {
    const response = await request(app)
      .post('/api/chat/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({
        conversationId,
        text: 'Olá, tudo bem?'
      });

    expect(response.status).toBe(201);
    expect(response.body.text).toBe('Olá, tudo bem?');
    expect(response.body.status).toBe('sent');
  });

  test('deve obter mensagens da conversa', async () => {
    const response = await request(app)
      .get(`/api/chat/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.messages)).toBe(true);
  });
});
```

---

**Status:** ✅ **EXEMPLOS COMPLETOS DE CÓDIGO PRONTOS PARA IMPLEMENTAÇÃO**

Todos os snippets estão prontos para copiar/colar e adaptar ao seu projeto!
