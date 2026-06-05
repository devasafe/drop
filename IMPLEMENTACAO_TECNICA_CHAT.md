# 🛠️ Implementação Técnica de Chat - Arquitetura e API

## 📋 Índice

1. [Arquitetura Geral](#arquitetura)
2. [Modelos de Dados](#modelos)
3. [API REST Endpoints](#api)
4. [WebSocket Events](#websocket)
5. [Fluxo de Implementação](#fluxo)
6. [Componentes Frontend](#componentes)

---

## <a name="arquitetura"></a>🏗️ Arquitetura Geral

### Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ChatComponent │  │ChatComponent │  │ChatComponent │      │
│  │(Loja↔Cliente)│  │(Loja↔Motoboy)│  │(Moto↔Cliente)│      │
│  └───────┬──────┘  └───────┬──────┘  └───────┬──────┘      │
│          │                 │                 │               │
│          └────────────┬────────────┬────────┘                │
│                       │            │                         │
│                  ┌────▼───┐   ┌────▼───┐                   │
│                  │API REST │   │WebSocket│                  │
│                  │(persistir)  │(tempo real)                │
│                  └────┬───┘   └────┬───┘                   │
│                       │            │                         │
└───────────────────────┼────────────┼──────────────────────────┘
                        │            │
┌───────────────────────┼────────────┼──────────────────────────┐
│                       │            │       BACKEND            │
│                   ┌───▼────────────▼───┐                      │
│                   │    Socket.io Hub   │                      │
│                   │  (real-time relay) │                      │
│                   └───┬────────────┬───┘                      │
│                       │            │                          │
│              ┌────────▼──┐   ┌────▼────────┐                │
│              │ChatController│  │ChatService  │                │
│              │(routes, auth) │  │(lógica)     │                │
│              └────────┬──────┘  └────┬────────┘                │
│                       │              │                         │
│                   ┌───▼──────────────▼────┐                   │
│                   │   MongoDB (Chat)      │                   │
│                   │   ├─ messages         │                   │
│                   │   ├─ conversations    │                   │
│                   │   └─ participants     │                   │
│                   └──────────────────────┘                    │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Rooms (Socket.io)

```typescript
// Rooms para chat
chat:loja:{lojaId}:cliente:{clienteId}
chat:loja:{lojaId}:motoboy:{motoboyId}
chat:motoboy:{motoboyId}:cliente:{clienteId}
```

---

## <a name="modelos"></a>📊 Modelos de Dados

### Schema: Conversation

```typescript
interface Conversation {
  _id: ObjectId;
  type: 'loja_cliente' | 'loja_motoboy' | 'motoboy_cliente';
  
  // Participantes
  participant1: {
    userId: ObjectId;    // ID do usuário
    role: 'loja' | 'cliente' | 'motoboy';
    name: string;
  };
  
  participant2: {
    userId: ObjectId;
    role: 'loja' | 'cliente' | 'motoboy';
    name: string;
  };
  
  // Contexto
  orderId?: ObjectId;           // Se for sobre um pedido específico
  deliveryId?: ObjectId;        // Se for sobre uma entrega
  relatedOrderNumber?: string;  // "#12345" para referência rápida
  
  // Metadados
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date;
  
  // Estado
  isActive: boolean;
  isMuted: [boolean, boolean];  // [participant1, participant2]
  isBlocked: [boolean, boolean];
  
  // Contadores
  messageCount: number;
  unreadCount: [number, number];  // [participant1, participant2]
}
```

### Schema: Message

```typescript
interface Message {
  _id: ObjectId;
  conversationId: ObjectId;
  
  // Autor
  senderId: ObjectId;
  senderRole: 'loja' | 'cliente' | 'motoboy';
  senderName: string;
  
  // Conteúdo
  text: string;
  attachments?: {
    type: 'image' | 'location' | 'file';
    url: string;
    metadata?: {
      latitude?: number;
      longitude?: number;
      accuracy?: number;
      fileName?: string;
    };
  }[];
  
  // Status
  status: 'sent' | 'delivered' | 'read';
  readAt?: Date;
  
  // Contexto
  relatedTo?: {
    type: 'order' | 'delivery' | 'payment';
    id: ObjectId;
  };
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}
```

---

## <a name="api"></a>🔌 API REST Endpoints

### POST /api/chat/conversations

Criar ou obter conversa existente

```typescript
// Request
{
  type: 'loja_cliente' | 'loja_motoboy' | 'motoboy_cliente',
  otherParticipantId: ObjectId,
  orderId?: ObjectId,     // Opcional, para contexto
  deliveryId?: ObjectId   // Opcional, para contexto
}

// Response
{
  _id: ObjectId,
  type: 'loja_cliente',
  participant1: {...},
  participant2: {...},
  messages: Message[],
  createdAt: Date
}
```

### GET /api/chat/conversations

Listar todas as conversas do usuário

```typescript
// Response
[
  {
    _id: ObjectId,
    type: 'loja_cliente',
    participant1: {...},
    participant2: {...},
    lastMessage: Message,
    unreadCount: number,
    lastMessageAt: Date
  },
  ...
]
```

### GET /api/chat/conversations/:conversationId

Obter conversa com histórico

```typescript
// Query params
?limit=50&skip=0  // Para paginação

// Response
{
  _id: ObjectId,
  type: 'loja_cliente',
  participant1: {...},
  participant2: {...},
  messages: Message[],
  totalMessages: number
}
```

### POST /api/chat/messages

Enviar mensagem

```typescript
// Request
{
  conversationId: ObjectId,
  text: string,
  attachments?: [{
    type: 'image' | 'location',
    url?: string,
    latitude?: number,
    longitude?: number
  }]
}

// Response
{
  _id: ObjectId,
  conversationId: ObjectId,
  senderId: ObjectId,
  text: string,
  status: 'sent',
  createdAt: Date
}
```

### PUT /api/chat/messages/:messageId/read

Marcar mensagem como lida

```typescript
// Response
{
  _id: ObjectId,
  status: 'read',
  readAt: Date
}
```

### PUT /api/chat/conversations/:conversationId/mute

Silenciar conversa

```typescript
// Request
{ isMuted: true }

// Response
{ success: true }
```

### PUT /api/chat/conversations/:conversationId/block

Bloquear participante

```typescript
// Request
{ isBlocked: true }

// Response
{ success: true }
```

---

## <a name="websocket"></a>⚡ WebSocket Events (Socket.io)

### Cliente → Servidor

```typescript
// Conectar a uma conversa
socket.emit('chat:join', {
  conversationId: ObjectId,
  userId: ObjectId
});

// Enviar mensagem em tempo real
socket.emit('chat:message', {
  conversationId: ObjectId,
  text: string,
  attachments?: []
});

// Indicador de digitação
socket.emit('chat:typing', {
  conversationId: ObjectId,
  isTyping: boolean
});

// Marcar como lido
socket.emit('chat:mark_read', {
  conversationId: ObjectId,
  messageId: ObjectId
});
```

### Servidor → Cliente

```typescript
// Nova mensagem
socket.on('chat:new_message', (data) => {
  console.log('Nova mensagem:', data);
  // {
  //   _id: ObjectId,
  //   conversationId: ObjectId,
  //   senderId: ObjectId,
  //   senderName: string,
  //   text: string,
  //   createdAt: Date
  // }
});

// Indicador de digitação
socket.on('chat:user_typing', (data) => {
  // { conversationId, userName, isTyping }
});

// Mensagem lida
socket.on('chat:message_read', (data) => {
  // { messageId, readAt }
});

// Usuário saiu
socket.on('chat:user_left', (data) => {
  // { conversationId, userId }
});

// Conversa bloqueada
socket.on('chat:blocked', (data) => {
  // { conversationId, blockedBy }
});
```

---

## <a name="fluxo"></a>🔄 Fluxo de Implementação

### Fase 1: Backend

#### Passo 1: Criar Schemas (MongoDB)

```typescript
// src/models/Conversation.ts
import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
  type: { type: String, enum: ['loja_cliente', 'loja_motoboy', 'motoboy_cliente'] },
  participant1: { userId: ObjectId, role: String, name: String },
  participant2: { userId: ObjectId, role: String, name: String },
  orderId: ObjectId,
  deliveryId: ObjectId,
  messageCount: { type: Number, default: 0 },
  unreadCount: [Number],
  isActive: { type: Boolean, default: true },
  isBlocked: [Boolean],
  createdAt: { type: Date, default: Date.now },
  updatedAt: Date,
  lastMessageAt: Date
});

export default mongoose.model('Conversation', conversationSchema);
```

```typescript
// src/models/Message.ts
const messageSchema = new mongoose.Schema({
  conversationId: { type: ObjectId, ref: 'Conversation', required: true },
  senderId: ObjectId,
  senderRole: String,
  senderName: String,
  text: String,
  attachments: [{
    type: String,
    url: String,
    metadata: Object
  }],
  status: { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' },
  readAt: Date,
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Message', messageSchema);
```

#### Passo 2: Criar Controller

```typescript
// src/controllers/chatController.ts

export const createOrGetConversation = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { type, otherParticipantId, orderId, deliveryId } = req.body;
    
    // Validar tipo de conversa
    const validTypes = ['loja_cliente', 'loja_motoboy', 'motoboy_cliente'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Tipo de conversa inválido' });
    }
    
    // Buscar ou criar conversa
    let conversation = await Conversation.findOne({
      $or: [
        { 'participant1.userId': userId, 'participant2.userId': otherParticipantId },
        { 'participant1.userId': otherParticipantId, 'participant2.userId': userId }
      ]
    });
    
    if (!conversation) {
      // Buscar dados dos participantes
      const user = await User.findById(userId);
      const otherUser = await User.findById(otherParticipantId);
      
      conversation = new Conversation({
        type,
        participant1: { userId, role: user.role, name: user.name },
        participant2: { userId: otherParticipantId, role: otherUser.role, name: otherUser.name },
        orderId,
        deliveryId,
        unreadCount: [0, 0],
        isBlocked: [false, false]
      });
      
      await conversation.save();
    }
    
    return res.json(conversation);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao criar conversa' });
  }
};

export const getMessages = async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const { limit = 50, skip = 0 } = req.query;
    
    // Validar se usuário faz parte da conversa
    const conversation = await Conversation.findById(conversationId);
    const userId = req.user?.id;
    
    const isParticipant = 
      conversation.participant1.userId.toString() === userId ||
      conversation.participant2.userId.toString() === userId;
    
    if (!isParticipant) {
      return res.status(403).json({ error: 'Não autorizado' });
    }
    
    // Buscar mensagens
    const messages = await Message.find({ conversationId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit as string))
      .skip(parseInt(skip as string));
    
    const totalMessages = await Message.countDocuments({ conversationId });
    
    return res.json({
      conversation,
      messages: messages.reverse(),
      totalMessages
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao buscar mensagens' });
  }
};

export const sendMessage = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { conversationId, text, attachments } = req.body;
    const user = await User.findById(userId);
    
    // Validar se usuário faz parte da conversa
    const conversation = await Conversation.findById(conversationId);
    
    // ... validações ...
    
    const message = new Message({
      conversationId,
      senderId: userId,
      senderRole: user.role,
      senderName: user.name,
      text,
      attachments,
      status: 'sent'
    });
    
    await message.save();
    
    // Atualizar última mensagem da conversa
    conversation.lastMessageAt = new Date();
    conversation.messageCount += 1;
    await conversation.save();
    
    // Emitir via WebSocket
    emitToRoom(`chat:${conversationId}`, 'chat:new_message', {
      ...message.toObject(),
      status: 'delivered'
    });
    
    return res.status(201).json(message);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
};
```

#### Passo 3: Criar Routes

```typescript
// src/routes/chat.ts
import express from 'express';
import { authenticate } from '../middleware/auth';
import {
  createOrGetConversation,
  getMessages,
  sendMessage,
  markAsRead
} from '../controllers/chatController';

const router = express.Router();

router.post('/conversations', authenticate, createOrGetConversation);
router.get('/conversations', authenticate, listConversations);
router.get('/conversations/:conversationId', authenticate, getMessages);
router.post('/messages', authenticate, sendMessage);
router.put('/messages/:messageId/read', authenticate, markAsRead);

export default router;
```

#### Passo 4: Setup Socket.io

```typescript
// src/sockets/chat.ts
import { Socket } from 'socket.io';

export function setupChatSocket(io: any) {
  io.on('connection', (socket: Socket) => {
    console.log('Socket conectado:', socket.id);
    
    // Usuário entra em uma conversa
    socket.on('chat:join', (data) => {
      const room = `chat:${data.conversationId}`;
      socket.join(room);
      console.log(`Usuário ${data.userId} entrou em ${room}`);
    });
    
    // Receber mensagem
    socket.on('chat:message', async (data) => {
      const { conversationId, text, userId } = data;
      const room = `chat:${conversationId}`;
      
      // Broadcast para todos na conversa
      io.to(room).emit('chat:new_message', {
        ...data,
        status: 'delivered',
        createdAt: new Date()
      });
    });
    
    // Indicador de digitação
    socket.on('chat:typing', (data) => {
      const room = `chat:${data.conversationId}`;
      socket.broadcast.to(room).emit('chat:user_typing', {
        userId: data.userId,
        isTyping: data.isTyping
      });
    });
    
    // Sair da conversa
    socket.on('chat:leave', (data) => {
      const room = `chat:${data.conversationId}`;
      socket.leave(room);
    });
  });
}
```

### Fase 2: Frontend

#### Componente ChatPanel

```typescript
// frontend/components/ChatPanel.tsx
import { useEffect, useState } from 'react';
import { useSocket } from '../contexts/SocketContext';
import api from '../lib/api';

interface ChatPanelProps {
  participantId: string;
  type: 'loja_cliente' | 'loja_motoboy' | 'motoboy_cliente';
  orderId?: string;
  deliveryId?: string;
}

export default function ChatPanel({
  participantId,
  type,
  orderId,
  deliveryId
}: ChatPanelProps) {
  const { socket } = useSocket();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  useEffect(() => {
    // Criar/obter conversa
    const initChat = async () => {
      const res = await api.post('/chat/conversations', {
        type,
        otherParticipantId: participantId,
        orderId,
        deliveryId
      });
      
      setConversationId(res.data._id);
      
      // Buscar mensagens existentes
      const messagesRes = await api.get(`/chat/conversations/${res.data._id}`);
      setMessages(messagesRes.data.messages);
      
      // Entrar na sala de socket
      socket?.emit('chat:join', {
        conversationId: res.data._id
      });
    };
    
    initChat();
  }, [participantId, type]);
  
  useEffect(() => {
    if (!socket || !conversationId) return;
    
    // Ouvir mensagens
    socket.on('chat:new_message', (data) => {
      setMessages(prev => [...prev, data]);
    });
    
    // Ouvir digitação
    socket.on('chat:user_typing', (data) => {
      if (data.isTyping) {
        // Mostrar indicador
      }
    });
    
    return () => {
      socket.off('chat:new_message');
      socket.off('chat:user_typing');
    };
  }, [socket, conversationId]);
  
  const handleSend = async () => {
    if (!input.trim() || !conversationId) return;
    
    // Enviar para backend
    await api.post('/chat/messages', {
      conversationId,
      text: input
    });
    
    setInput('');
  };
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '400px' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', background: '#f3f4f6' }}>
        {messages.map(msg => (
          <div key={msg._id} style={{ marginBottom: '12px' }}>
            <strong>{msg.senderName}:</strong> {msg.text}
            <small style={{ color: '#999' }}>{new Date(msg.createdAt).toLocaleTimeString()}</small>
          </div>
        ))}
      </div>
      
      <div style={{ display: 'flex', gap: '8px', padding: '16px', borderTop: '1px solid #e5e7eb' }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Digite sua mensagem..."
          style={{
            flex: 1,
            padding: '10px',
            border: '1px solid #d1d5db',
            borderRadius: '6px'
          }}
        />
        <button
          onClick={handleSend}
          style={{
            padding: '10px 20px',
            background: '#667eea',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600
          }}
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
```

---

## <a name="componentes"></a>🎨 Componentes Frontend

### ChatIcon (Badge com unread count)

Exibir em:
- Dashboard da loja (próximo a cada pedido)
- Página de entrega do motoboy (próximo a info da loja e cliente)
- Página de status do pedido (cliente)

### ChatList (Lista de conversas)

Exibir em:
- Menu lateral
- Página dedicada `/chat`

### ChatWindow (Janela de chat)

Modal/drawer com:
- Histórico de mensagens
- Input de digitação
- Indicador de online/offline
- Anexos (foto, localização)

---

**Status:** 📋 **DOCUMENTO TÉCNICO COMPLETO**

Pronto para iniciar a implementação em fases!
