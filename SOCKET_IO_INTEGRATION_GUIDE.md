# Socket.io Chat Integration Guide

## 📋 Passos de Integração no app.ts

### 1. Instalar Socket.io (se ainda não instalado)
```bash
npm install socket.io
```

### 2. Atualizar o app.ts

**ANTES:** Seu app.ts provavelmente tem:
```typescript
import express from 'express';

const app = express();

// ... routes e middleware

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server rodando na porta ${PORT}`);
});
```

**DEPOIS:** Deve ter:
```typescript
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { setupChatSocket } from './sockets/chat';

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// ... routes e middleware

// Setup chat socket
setupChatSocket(io);

// Exportar io se precisar em outros arquivos
export { io };

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server com Socket.io rodando na porta ${PORT}`);
});
```

### 3. Adicionar ao arquivo de rotas (chat.ts)

Se precisar emitir eventos a partir das rotas:

```typescript
import { io } from '../app';
import { emitToRoom } from '../sockets/chat';

// Dentro de sendMessage():
const message = await Message.create({
  conversationId,
  senderId: userId,
  senderRole: user.role,
  senderName: user.name,
  text: text.trim(),
  status: 'delivered',
  createdAt: new Date()
});

// Emitir para Socket.io em tempo real
emitToRoom(io, conversationId, 'chat:new_message', {
  _id: message._id,
  conversationId: message.conversationId,
  senderId: message.senderId,
  senderName: message.senderName,
  text: message.text,
  status: message.status,
  timestamp: message.createdAt
});

res.status(201).json({
  success: true,
  data: message
});
```

## 🔌 Eventos Socket.io

### Cliente → Servidor

#### 1. chat:join
Conectar a uma conversa
```typescript
socket.emit('chat:join', {
  conversationId: 'conv_123',
  userId: 'user_123'
});
```

#### 2. chat:message
Enviar mensagem (após POST na API)
```typescript
socket.emit('chat:message', {
  conversationId: 'conv_123',
  text: 'Olá!',
  attachments: []
});
```

#### 3. chat:typing
Indicador de digitação
```typescript
socket.emit('chat:typing', {
  conversationId: 'conv_123',
  isTyping: true
});
```

#### 4. chat:mark_read
Marcar como lido (após PUT na API)
```typescript
socket.emit('chat:mark_read', {
  conversationId: 'conv_123',
  messageId: 'msg_123'
});
```

#### 5. chat:leave
Sair da conversa
```typescript
socket.emit('chat:leave', {
  conversationId: 'conv_123',
  userId: 'user_123'
});
```

### Servidor → Cliente

#### 1. chat:new_message
Nova mensagem recebida
```typescript
socket.on('chat:new_message', (data) => {
  console.log('Mensagem:', data.text);
  // Adicionar à UI
});
```

#### 2. chat:user_typing
Outro usuário está digitando
```typescript
socket.on('chat:user_typing', (data) => {
  console.log(`${data.userName} está digitando...`);
});
```

#### 3. chat:message_read
Mensagem marcada como lida
```typescript
socket.on('chat:message_read', (data) => {
  console.log(`Mensagem lida por ${data.userId}`);
});
```

#### 4. chat:user_joined
Usuário entrou na conversa
```typescript
socket.on('chat:user_joined', (data) => {
  console.log(`${data.userName} entrou no chat`);
});
```

#### 5. chat:user_left
Usuário saiu da conversa
```typescript
socket.on('chat:user_left', (data) => {
  console.log(`${data.userName} saiu do chat`);
});
```

#### 6. chat:error
Erro ocorreu
```typescript
socket.on('chat:error', (data) => {
  console.error('Erro:', data.message);
});
```

## 🔐 Autenticação

O Socket.io autentica usando JWT token no handshake:

```typescript
// Frontend ao conectar:
const socket = io(SOCKET_URL, {
  auth: {
    token: localStorage.getItem('token') // Seu JWT token
  }
});

// Backend valida automaticamente no middleware do Socket.io
// Se token inválido, conexão é rejeitada
```

## 📊 Rooms e Namespaces

### Chat Rooms
- **Formato:** `chat:${conversationId}`
- **Exemplo:** `chat:507f1f77bcf86cd799439011`
- **Uso:** Cada conversa tem sua própria room
- **Quando entrar:** Logo após abrir o chat
- **Quando sair:** Ao fechar o chat

### User Notifications (Opcional)
- **Formato:** `user:${userId}`
- **Exemplo:** `user:507f1f77bcf86cd799439012`
- **Uso:** Notificações pessoais (nova conversa, etc)
- **Implementação:** Use `notifyUser(io, userId, event, data)`

## 🧪 Testar Socket.io

### Com Socket.io Admin UI (Recomendado)

```bash
npm install @socket.io/admin-ui
```

```typescript
// No app.ts
import { instrument } from '@socket.io/admin-ui';

instrument(io, {
  auth: false, // Apenas desenvolvimento! Desabilitar em produção
  mode: 'development'
});
```

Acesse: http://localhost:3000/admin

### Com Cliente de Teste (socket.io-client)

```typescript
import io from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: {
    token: 'seu_jwt_token'
  }
});

socket.on('connect', () => {
  console.log('Conectado!');
  socket.emit('chat:join', { conversationId: 'test_123' });
});

socket.on('chat:new_message', (data) => {
  console.log('Nova mensagem:', data);
});
```

## 🚀 Checklist de Integração

- [ ] Instalou socket.io: `npm install socket.io`
- [ ] Atualizou app.ts com createServer() e SocketIOServer
- [ ] Importou setupChatSocket()
- [ ] Chamou setupChatSocket(io)
- [ ] Exportou { io } de app.ts
- [ ] Integrou emitToRoom() nas rotas (sendMessage, markAsRead, etc)
- [ ] Configurou CORS para frontend
- [ ] Testou com Socket.io Admin UI ou cliente de teste
- [ ] Verificou logs: ✅ [SOCKET] Usuário conectado
- [ ] Frontend conectando com JWT token

## 🐛 Troubleshooting

### "io is not defined"
- Certifique-se que exportou `export { io }` do app.ts
- Importe: `import { io } from '../app'`

### "CORS error"
- Atualize CORS no SocketIOServer:
```typescript
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});
```

### Socket não conecta
- Verifique se JWT token é válido
- Verifique se token está sendo enviado no auth
- Veja logs do servidor (✅ [SOCKET] messages)

### Mensagens não aparecem em tempo real
- Certifique-se que evento é emitido após salvar no BD
- Verifique se cliente está escutando o evento correto
- Verifique se está na room correta: `chat:${conversationId}`

## 📚 Próximos Passos

1. **Frontend Hooks:** Criar `useChat.ts` custom hook
2. **Frontend Components:** ChatPanel, ChatBubble, ChatInput
3. **Integração:** Adicionar chat nas páginas de pedido
4. **Tests:** Unit e integration tests
5. **Monitoramento:** Setup de logging e alertas

