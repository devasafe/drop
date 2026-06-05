# 🔧 Troubleshooting & FAQ - Chat Implementation

## 🆘 Problemas Comuns & Soluções

### Backend Issues

#### ❌ "Socket.io: CORS error on connection"

**Sintomas:**
```
WebSocket connection to 'ws://...' failed
Access-Control-Allow-Origin header missing
```

**Solução:**
```typescript
// src/app.ts
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST']
  }
});
```

**Checklist:**
- [ ] CLIENT_URL está correto (sem trailing slash)
- [ ] Usar http (not https) em desenvolvimento local
- [ ] Socket.io port deve ser acessível (firewall check)

---

#### ❌ "MongoDB duplicate key error on conversation creation"

**Sintomas:**
```
E11000 duplicate key error collection: chat.conversations
```

**Causa:**
Unique index foi criado sem permitir nulls

**Solução:**
```typescript
// src/models/Conversation.ts
conversationSchema.index(
  { 'participant1.userId': 1, 'participant2.userId': 1 },
  { unique: true, sparse: true }
);

// Ou sempre try/catch para duplicatas:
try {
  await conversation.save();
} catch (error: any) {
  if (error.code === 11000) {
    // Já existe, retornar existente
    return await Conversation.findOne({...});
  }
  throw error;
}
```

---

#### ❌ "Message not appearing in real-time"

**Sintomas:**
```
Mensagem aparece no DB mas não no chat
Socket emite mas listener não recebe
```

**Causas possíveis:**
1. Usuario não entrou na room corretamente
2. Socket event name diferente no client
3. Listener desconectado/removido

**Solução Debug:**
```typescript
// Backend: log quando entra na room
socket.on('chat:join', (data) => {
  console.log(`✅ [Socket] User ${data.userId} joined room chat:${data.conversationId}`);
  console.log(`   Rooms: ${JSON.stringify(socket.rooms)}`);
  socket.join(`chat:${data.conversationId}`);
});

// Backend: log antes de emitir
io.to(room).emit('chat:new_message', {
  ...message,
  _timestamp: new Date().toISOString(),
  _socketId: socket.id
});

// Frontend: verificar listener
socket.on('chat:new_message', (data) => {
  console.log('📨 [Chat] Received:', data);
  setMessages(prev => [...prev, data]);
});

// Frontend: log ao conectar
socket.on('connect', () => {
  console.log('✅ [Socket] Connected:', socket.id);
});
```

---

#### ❌ "Rate limiting bloqueando usuários legítimos"

**Sintomas:**
```
429 Too Many Requests
mesmo após 1 mensagem
```

**Solução:**
```typescript
// src/middleware/rateLimit.ts
import rateLimit from 'express-rate-limit';

export const chatRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 100,            // 100 requests por minuto
  keyGenerator: (req) => {
    // Usar userId ao invés de IP (melhor em proxy)
    return req.user?.id || req.ip;
  },
  skip: (req) => {
    // Não limitar GET (só POST/PUT)
    return req.method === 'GET';
  }
});

// app.ts
app.use('/api/chat/messages', chatRateLimiter, chatController.sendMessage);
```

**Testes:**
```bash
# Testar rate limit
for i in {1..101}; do
  curl -X POST http://localhost:5000/api/chat/messages \
    -H "Authorization: Bearer $TOKEN"
done

# Deve bloquear em 101 (status 429)
```

---

### Frontend Issues

#### ❌ "Memory leak: Socket listeners not cleaned up"

**Sintomas:**
```
Chrome DevTools: "3 detached DOM nodes"
Component memoria cresce indefinidamente
```

**Causa:**
Listeners não removidos em useEffect cleanup

**Solução:**
```typescript
// ❌ ERRADO
useEffect(() => {
  socket.on('chat:new_message', handleNewMessage);
}, []);

// ✅ CORRETO
useEffect(() => {
  socket.on('chat:new_message', handleNewMessage);
  
  return () => {
    socket.off('chat:new_message', handleNewMessage);
  };
}, [socket]);
```

**Mais seguro com refs:**
```typescript
const listenerRef = useRef<(...args: any[]) => void>();

useEffect(() => {
  listenerRef.current = (data) => {
    console.log('Message:', data);
    setMessages(prev => [...prev, data]);
  };

  socket?.on('chat:new_message', listenerRef.current);

  return () => {
    if (listenerRef.current) {
      socket?.off('chat:new_message', listenerRef.current);
    }
  };
}, [socket]);
```

---

#### ❌ "Chat component always re-renders"

**Sintomas:**
```
Component renderiza múltiplas vezes
inputs perdem focus
digitação fica lenta
```

**Causa:**
Props/state mudando a cada render

**Solução:**
```typescript
// ✅ Usar useCallback para memoizar funções
const handleSend = useCallback((text: string) => {
  sendMessage(text);
}, [sendMessage]);

// ✅ Usar useMemo para objetos
const chatProps = useMemo(() => ({
  participantId,
  type
}), [participantId, type]);

// ✅ Envolver component com React.memo
export default React.memo(ChatPanel);
```

---

#### ❌ "Socket desconecta ao navegar"

**Sintomas:**
```
Socket conecta ao abrir chat
Desconecta ao navegar para outra página
Reconecta ao voltar
```

**Solução:**
```typescript
// ❌ ERRADO: Socket é criado no componente
function ChatPanel() {
  const [socket, setSocket] = useState(null);
  
  useEffect(() => {
    const newSocket = io('...');
    setSocket(newSocket);
    
    return () => newSocket.disconnect();
  }, []);
}

// ✅ CORRETO: Socket é global em Context
// contexts/SocketContext.tsx
const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const socketRef = useRef(null);
  
  useEffect(() => {
    socketRef.current = io(process.env.REACT_APP_BACKEND_URL);
    
    return () => {
      // Não desconectar aqui! Manter vivo
      // socketRef.current.disconnect();
    };
  }, []);
  
  return (
    <SocketContext.Provider value={socketRef.current}>
      {children}
    </SocketContext.Provider>
  );
}
```

---

#### ❌ "Mensagens antigas desaparecendo"

**Sintomas:**
```
Scroll up para ver histórico
Mensagens antigas sumiram
Só vê últimas 10
```

**Causa:**
Component desmontou e estado foi resetado

**Solução:**
```typescript
// Usar estado mais persistente
const [messages, setMessages] = useState<Message[]>(() => {
  // Carregar do sessionStorage
  const stored = sessionStorage.getItem('chatMessages');
  return stored ? JSON.parse(stored) : [];
});

useEffect(() => {
  // Salvar ao atualizar
  sessionStorage.setItem('chatMessages', JSON.stringify(messages));
}, [messages]);

// Ou melhor: implementar paginação
const loadMoreMessages = async (skip: number) => {
  const res = await api.get(
    `/api/chat/conversations/${conversationId}?limit=50&skip=${skip}`
  );
  setMessages(prev => [...res.data.messages, ...prev]);
};
```

---

### Database Issues

#### ❌ "Query lenta em conversations"

**Sintomas:**
```
GET /api/chat/conversations: 2000ms
MongoDB query slow
```

**Solução:**
```typescript
// Criar índices
conversationSchema.index({ 'participant1.userId': 1 });
conversationSchema.index({ 'participant2.userId': 1 });
conversationSchema.index({ lastMessageAt: -1 });
conversationSchema.index({ orderId: 1 });

// Usar explain() para debug
db.conversations.find({
  'participant1.userId': 'user123'
}).explain('executionStats');

// Verificar índices criados
db.conversations.getIndexes();
```

**Otimização de query:**
```typescript
// ❌ LENTO
const conversations = await Conversation.find({
  $or: [
    { 'participant1.userId': userId },
    { 'participant2.userId': userId }
  ]
}).populate('participant1.userId').populate('participant2.userId');

// ✅ RÁPIDO
const conversations = await Conversation.find({
  $or: [
    { 'participant1.userId': userId },
    { 'participant2.userId': userId }
  ]
})
.select('type participant1 participant2 lastMessageAt messageCount unreadCount')
.limit(50)
.sort({ lastMessageAt: -1 })
.lean();
```

---

#### ❌ "Disk space cheio com histórico de mensagens"

**Sintomas:**
```
Banco crescendo muito rápido
Backups ficando enormes
```

**Solução: Auto-delete**
```typescript
// Adicionar TTL index (auto-delete após 30 dias)
messageSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 }
);

// Ou limpeza manual
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
await Message.deleteMany({
  createdAt: { $lt: thirtyDaysAgo }
});

// Ou arquivar em separate collection
const archivedMessage = await ArchivedMessage.create({
  ...message,
  archivedAt: new Date()
});
await Message.findByIdAndDelete(message._id);
```

---

### Socket.io Issues

#### ❌ "Socket events chegando fora de ordem"

**Sintomas:**
```
Mensagem 1 enviada primeiro
Mas Mensagem 2 aparece primeiro no chat
```

**Solução:**
```typescript
// Adicionar sequence number
interface Message {
  _id: string;
  conversationId: string;
  text: string;
  sequence: number; // Adicionar
  createdAt: Date;
}

// Backend
let messageSequence = 0;

const message = new Message({
  ...data,
  sequence: ++messageSequence
});

// Frontend: ordenar por sequence
messages.sort((a, b) => a.sequence - b.sequence);
```

---

#### ❌ "Múltiplas conexões Socket por usuário"

**Sintomas:**
```
Mesmo usuário conectado 2-3x
Mensagens duplicadas
```

**Solução:**
```typescript
// Backend: autorizar por user
const authenticateSocket = (socket: Socket) => {
  const token = socket.handshake.auth.token;
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    socket.role = decoded.role;
  } catch {
    socket.disconnect();
  }
};

// Desconectar antigas conexões do mesmo user
const userSockets = new Map<string, Set<string>>();

io.on('connection', (socket) => {
  const userId = socket.userId;
  
  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  
  const userSocketIds = userSockets.get(userId)!;
  
  // Desconectar sockets antigos
  userSocketIds.forEach(socketId => {
    io.sockets.sockets.get(socketId)?.disconnect();
  });
  
  userSocketIds.add(socket.id);
  
  socket.on('disconnect', () => {
    userSocketIds.delete(socket.id);
  });
});
```

---

## ❓ FAQ

### Performance

**Q: Por que o chat está lento?**
A: Verificar:
1. Índices MongoDB (conversationId, createdAt)
2. Rate limiting muito agressivo
3. Memory leak em Socket listeners
4. Carregando muitas mensagens (usar paginação)

**Q: Quantas mensagens por segundo o sistema aguenta?**
A: Depende da infra:
- Single MongoDB: ~1000 msg/s
- Sharded MongoDB: ~10.000 msg/s
- Com Redis: ~50.000 msg/s

**Q: Como otimizar para produção?**
A: 
1. Redis para cache de conversas ativas
2. Message queue (RabbitMQ) para garantir entrega
3. CDN para attachments
4. Elasticsearch para search de histórico

---

### Security

**Q: Como evitar que um usuário veja mensagens de outro?**
A: Sempre verificar autorização:
```typescript
const isParticipant = 
  conversation.participant1.userId === userId ||
  conversation.participant2.userId === userId;

if (!isParticipant) throw new Error('Unauthorized');
```

**Q: Mensagens precisam ser criptografadas?**
A: Depende:
- MVP: Não (confiar em HTTPS)
- Fase 2+: Sim (usar TweetNaCl.js para E2E)

**Q: Como proteger contra spam?**
A: 
1. Rate limiting (100 msg/min)
2. Keyword blocking (palavras proibidas)
3. Report system (usuários reportam)
4. Auto-block após N reports

---

### Features

**Q: Como adicionar anexos (fotos)?**
A: 
1. Upload para S3/Google Cloud
2. Armazenar URL no Message
3. Validar tipo e tamanho

**Q: Como implementar voice messages?**
A:
1. Usar Web Audio API
2. Gravar como blob
3. Upload para storage
4. Play com <audio> tag

**Q: Como fazer video calls?**
A:
1. Integrar Twilio/Agora SDK
2. Gerar token no backend
3. Iniciar call do chat

---

### Debugging

**Q: Como debugar Socket.io?**
A:
```typescript
// 1. Abrir Chrome DevTools (F12)
// 2. Ir em Network → WS
// 3. Ver mensagens em tempo real

// 2. Ou usar Socket.io DevTools
// npm install @socket.io/admin-ui
import { instrument } from '@socket.io/admin-ui';
instrument(io, { auth: false });
// Acessar: http://localhost:5000/admin/
```

**Q: Como ver logs de Socket?**
A:
```typescript
// Backend
import debug from 'debug';
const socketDebug = debug('socket.io');

socket.onAny((event, ...args) => {
  socketDebug(`Event: ${event}`, args);
});

// Terminal
DEBUG=socket.io npm start
```

**Q: Como testar Socket localmente?**
A:
```bash
# Terminal 1: Backend
npm run dev

# Terminal 2: Socket client test
node -e "
const io = require('socket.io-client');
const socket = io('http://localhost:5000');
socket.emit('chat:join', { conversationId: '123' });
socket.on('chat:new_message', (msg) => console.log(msg));
"
```

---

## 📊 Monitoring Checklist

### Logs Essenciais

```typescript
// Sempre logar:
console.log('✅ [CHAT] User joined conversation');
console.log('✅ [CHAT] Message sent', { messageId, userId });
console.log('✅ [CHAT] Socket connected', { socketId, userId });

// Alertas críticos:
console.error('❌ [CHAT] Auth failed for user');
console.error('❌ [CHAT] Database error saving message');
console.error('❌ [CHAT] Socket disconnected unexpectedly');
```

### Métricas para Datadog/NewRelic

```typescript
// Tempo de resposta
const start = Date.now();
await api.post('/api/chat/messages', ...);
const duration = Date.now() - start;
recordMetric('chat.message.latency_ms', duration);

// Taxa de sucesso
try {
  await sendMessage(...);
  recordMetric('chat.message.sent', 1);
} catch {
  recordMetric('chat.message.error', 1);
}

// Conexões ativas
recordMetric('chat.socket.connected', io.engine.clientsCount);
```

---

## 🚨 Escalabilidade

### Single Server (até 1000 usuarios)
```
Frontend ↔ Backend (single)
            ↓
         MongoDB (single)
```

### Multi-Server (1000-10k usuarios)
```
Frontend ↔ Load Balancer
           ├─ Backend 1
           ├─ Backend 2
           └─ Backend 3
           
           + Redis (socket adapter)
           + MongoDB sharded
```

### Enterprise (10k+ usuarios)
```
Frontend ↔ CDN edge ↔ Load Balancer
                     ├─ Backend cluster
                     ├─ Redis cluster
                     ├─ MongoDB cluster
                     └─ Message queue (RabbitMQ)
```

---

## ✅ Checklist de Produção

- [ ] Testes passando 100%
- [ ] Cobertura > 80%
- [ ] Logging implementado
- [ ] Monitoring ativo
- [ ] Alertas configurados
- [ ] Backup automático
- [ ] HTTPS/WSS ativo
- [ ] Rate limiting testado
- [ ] Load test executado
- [ ] Disaster recovery plan
- [ ] Documentation updated
- [ ] Team trained

---

**Última atualização:** 2024
**Versão:** 1.0
**Status:** ✅ Pronto para Produção
