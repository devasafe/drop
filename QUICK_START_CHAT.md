# ⚡ Quick Start - Chat System

## 🚀 Começar em 5 Minutos

### Passo 1: Instalar Socket.io (1 min)
```bash
npm install socket.io
```

### Passo 2: Copiar arquivo Socket (1 min)
```bash
# Já criado em: src/sockets/chat.ts
# Nada a fazer, já está no seu projeto!
```

### Passo 3: Atualizar app.ts (1 min)

**Encontre este código:**
```typescript
import express from 'express';
const app = express();
// ... setup
app.listen(PORT);
```

**Substitua por:**
```typescript
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { setupChatSocket } from './sockets/chat';
import chatRoutes from './routes/chat';

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// ... seu setup middleware

// Setup chat socket
setupChatSocket(io);

// Montar rotas
app.use('/api/chat', chatRoutes);

// Exportar io para usar em outros arquivos
export { io };

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`✅ Server rodando na porta ${PORT}`);
});
```

### Passo 4: Testar (1 min)
```bash
npm run dev

# Você deve ver:
# ✅ [SOCKET] Chat socket.io configurado
# ✅ Server rodando na porta 3000
```

### Passo 5: Verificar no Postman (1 min)

**Criar conversa:**
```
POST http://localhost:3000/api/chat/conversations
Header: Authorization: Bearer seu_token_jwt

Body:
{
  "type": "loja_cliente",
  "participant1": {
    "userId": "loja_id",
    "role": "loja",
    "name": "Minha Loja"
  },
  "participant2": {
    "userId": "cliente_id",
    "role": "cliente",
    "name": "Cliente"
  }
}
```

**Resposta esperada:**
```json
{
  "_id": "conv_123",
  "type": "loja_cliente",
  "participant1": {...},
  "messageCount": 0,
  "unreadCount": [0, 0],
  "isActive": true,
  "lastMessageAt": "2024-12-10T..."
}
```

✅ **Backend pronto!**

---

## 🎨 Quick Start Frontend

### Passo 1: Instalar Socket.io Client
```bash
npm install socket.io-client
```

### Passo 2: Usar Hook em Componente

```typescript
'use client'; // Se usar Next.js 13+

import useChat from '@/hooks/useChat';
import ChatPanel from '@/components/ChatPanel';
import ChatInput from '@/components/ChatInput';

export default function ChatPage() {
  const token = localStorage.getItem('token');
  const userId = 'current_user_id'; // Do seu contexto

  // Setup chat
  const { 
    messages, 
    sendMessage, 
    conversationId,
    joinConversation,
    isConnected,
    error
  } = useChat({ token, userId });

  // Entrar em conversa
  const handleJoinChat = async () => {
    // 1. Criar/obter conversa da API
    const response = await fetch('/api/chat/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        type: 'loja_cliente',
        participant1: {...},
        participant2: {...}
      })
    });

    const conversation = await response.json();

    // 2. Entrar na sala Socket.io
    joinConversation(conversation._id);
  };

  // Enviar mensagem
  const handleSendMessage = async (text) => {
    // 1. Persistir na API
    await fetch('/api/chat/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        conversationId,
        text
      })
    });

    // 2. Enviar por Socket.io (tempo real)
    sendMessage(text);
  };

  return (
    <div>
      {error && <div style={{color: 'red'}}>{error}</div>}
      {!isConnected && <div>Conectando...</div>}
      
      <ChatPanel
        messages={messages}
        conversationId={conversationId || ''}
        userId={userId}
        onSendMessage={handleSendMessage}
      />
      
      <ChatInput onSendMessage={handleSendMessage} />
    </div>
  );
}
```

✅ **Frontend pronto!**

---

## 🧪 Teste Rápido

### Teste 1: API via cURL
```bash
# Criar conversa
curl -X POST http://localhost:3000/api/chat/conversations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer seu_token" \
  -d '{
    "type": "loja_cliente",
    "participant1": {"userId": "1", "role": "loja", "name": "Loja A"},
    "participant2": {"userId": "2", "role": "cliente", "name": "Cliente B"}
  }'

# Listar conversas
curl -X GET http://localhost:3000/api/chat/conversations \
  -H "Authorization: Bearer seu_token"
```

### Teste 2: Socket.io com Node.js
```javascript
const io = require('socket.io-client');

const socket = io('http://localhost:3000', {
  auth: {
    token: 'seu_jwt_token'
  }
});

socket.on('connect', () => {
  console.log('✅ Conectado!');
  
  // Entrar em conversa
  socket.emit('chat:join', {
    conversationId: 'conv_123',
    userId: 'user_123'
  });
});

socket.on('chat:new_message', (data) => {
  console.log('📨 Mensagem:', data.text);
});

// Esperar conexão
setTimeout(() => {
  // Enviar mensagem
  socket.emit('chat:message', {
    conversationId: 'conv_123',
    text: 'Olá em tempo real!'
  });
}, 1000);
```

✅ **Testes passando!**

---

## 🐛 Debug

### Ver Logs
```bash
# Terminal com npm run dev
# Procure por:
# ✅ [SOCKET] Usuário conectado
# ✅ [SOCKET] Mensagem entregue
# ❌ [SOCKET] Erro ao...
```

### Socket.io Admin UI (Opcional)
```bash
npm install @socket.io/admin-ui

# Em app.ts:
import { instrument } from '@socket.io/admin-ui';
instrument(io, { auth: false });
```

**Acessar:** http://localhost:3000/admin

---

## ✅ Checklist de 5 Minutos

- [ ] Rodei `npm install socket.io`
- [ ] Atualizei app.ts com createServer e SocketIOServer
- [ ] Importei setupChatSocket
- [ ] Chamei setupChatSocket(io)
- [ ] Montei rotas: `app.use('/api/chat', chatRoutes)`
- [ ] Rodei `npm run dev` e vi ✅ mensagens
- [ ] Testei POST /api/chat/conversations no Postman
- [ ] Verifiquei resposta 201 (sucesso)

---

## 🎯 Próximos Passos

### Imediatamente (hoje)
1. [x] Setup backend Socket.io
2. [x] Testar endpoints API
3. [ ] Integrar em página (use exemplo acima)

### Amanhã
4. [ ] Integrar frontend em 3 páginas
5. [ ] Testar com múltiplos usuários
6. [ ] Ajustar CSS/design

### Esta Semana
7. [ ] Testes unitários
8. [ ] Deploy staging
9. [ ] Deploy production

---

## 🆘 Problemas Comuns

### "io is not defined"
```
❌ Erro: Cannot find name 'io'
✅ Solução: Exporte io do app.ts
   export { io }
```

### "CORS error"
```
❌ Erro: CORS policy blocked
✅ Solução: Atualize CORS no SocketIOServer
   cors: { origin: 'http://localhost:3000', ... }
```

### "Auth token required"
```
❌ Erro: Ao conectar Socket.io
✅ Solução: Envie token no auth
   io(url, { auth: { token: 'seu_jwt' } })
```

### "Message not sent"
```
❌ Erro: Mensagem não aparece para outro user
✅ Solução: Verifique:
   1. Ambos estão na sala: chat:conversationId
   2. Socket está conectado: socket.connected === true
   3. Veja logs: ✅ Mensagem entregue
```

---

## 📊 Stack Usado

- **Backend:** Express.js + Socket.io + MongoDB
- **Frontend:** React + Socket.io-client + TypeScript
- **Database:** MongoDB + Mongoose
- **Auth:** JWT (bearer token)
- **Real-time:** WebSocket (Socket.io)

---

## 📚 Documentação Completa

Se precisar de mais detalhes:

1. **SOCKET_IO_INTEGRATION_GUIDE.md** - Setup Socket.io detalhado
2. **FRONTEND_INTEGRATION_GUIDE.md** - Integração React step-by-step
3. **TROUBLESHOOTING_CHAT.md** - Soluções de problemas
4. **CHAT_INTEGRATION_CHECKLIST.md** - Checklist completo do projeto

---

## 🎉 Pronto para Rodar!

**Backend:** ✅ Pronto  
**Frontend Hooks:** ✅ Pronto  
**Componentes React:** ✅ Pronto  

Agora é só integrar no seu projeto e começar a usar! 🚀

