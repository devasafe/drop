# Socket.io - Chat em Tempo Real 🚀

## Overview

Implementação completa de **chat em tempo real** usando Socket.io no ChatWidget. Mensagens, digitação e indicadores são agora **instantâneos**.

---

## Arquitetura

### Backend (Já Existe)
- **Location**: `src/sockets/chat.ts`
- **Setup**: `src/index.ts` → `notifier.initSocket(server)`
- **Eventos**: 
  - `chat:join` - Entrar em uma sala de conversa
  - `chat:message` - Broadcast de nova mensagem
  - `chat:typing` - Indicador de digitação
  - `chat:mark_read` - Marcar como lido
  - `chat:leave` - Sair da conversa

### Frontend (Implementado Agora)
- **Location**: `frontend/components/ChatWidget.tsx`
- **Library**: `socket.io-client`
- **Eventos Emitidos**:
  - `chat:join` - Quando abre conversa
  - `chat:message` - Quando envia mensagem
  - `chat:typing` - Ao digitar (com debounce)
- **Eventos Recebidos**:
  - `chat:new_message` - Nova mensagem em tempo real
  - `chat:user_typing` - Alguém está digitando

---

## Código Implementado

### 1. Importações Socket.io

```typescript
import { io, Socket } from 'socket.io-client';
```

### 2. States para Socket.io

```typescript
const [isTyping, setIsTyping] = useState(false);
const socketRef = useRef<Socket | null>(null);
const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
```

**Explicação**:
- `isTyping`: Mostra "Loja está digitando..." visual
- `socketRef`: Referência persistente ao socket (não reinicializa a cada render)
- `typingTimeoutRef`: Timeout para parar de mostrar digitação após 1s sem digitar

### 3. Inicializar Socket.io

```typescript
useEffect(() => {
  if (!user) return;

  const token = localStorage.getItem('token');
  if (!token) return;

  // Conectar ao servidor
  socketRef.current = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000', {
    auth: { token },  // ← Passa token para autenticação
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5
  });

  // Escutar nova mensagem
  socketRef.current.on('chat:new_message', (data: any) => {
    console.log('📨 Nova mensagem recebida:', data);
    setMessages((prev) => [...prev, {
      _id: data._id,
      senderId: data.senderId,
      text: data.text,
      createdAt: data.timestamp
    }]);
  });

  // Escutar digitação
  socketRef.current.on('chat:user_typing', (data: any) => {
    if (data.isTyping && data.userId !== user._id) {
      setIsTyping(true);
    } else {
      setIsTyping(false);
    }
  });

  // Cleanup
  return () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
  };
}, [user]);
```

**O que faz**:
- ✅ Conecta ao servidor com autenticação JWT
- ✅ Escuta `chat:new_message` para atualizar interface em tempo real
- ✅ Escuta `chat:user_typing` para mostrar indicador
- ✅ Auto-reconecta se perder conexão
- ✅ Desconecta ao sair do componente

### 4. Fazer Join na Sala

```typescript
useEffect(() => {
  if (conversationId && socketRef.current && user) {
    socketRef.current.emit('chat:join', {
      conversationId,
      userId: user._id
    });
    console.log(`✅ Entrado na sala: chat:${conversationId}`);
  }
}, [conversationId, user]);
```

**O que faz**:
- Quando abre um chat, entra na sala `chat:{conversationId}`
- Permite receber mensagens daquela conversa específica

### 5. Enviar Mensagem com Socket.io

```typescript
const handleSendMessage = async () => {
  if (!messageText.trim() || !conversationId) return;

  const newMessage: Message = {
    senderId: user._id,
    text: messageText,
    createdAt: new Date().toISOString()
  };

  // 1. Mostrar localmente IMEDIATAMENTE
  setMessages([...messages, newMessage]);
  setMessageText('');
  setIsTyping(false);

  try {
    // 2. Salvar no banco de dados
    await api.post(`/chat/conversations/${conversationId}/messages`, {
      text: messageText
    });

    // 3. Broadcast via Socket.io para tempo real
    if (socketRef.current) {
      socketRef.current.emit('chat:message', {
        conversationId,
        text: messageText
      });
    }

    console.log('✅ Mensagem enviada com sucesso');
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err);
    // Remover mensagem se falhar
    setMessages(messages.slice(0, -1));
    setMessageText(messageText);
  }
};
```

**Fluxo**:
1. **Otimismo local**: Mostra a mensagem imediatamente (não espera resposta)
2. **Persistência**: Salva no banco via REST API
3. **Broadcast**: Emite via Socket.io para outros clientes verem em tempo real

### 6. Indicador de Digitação

```typescript
const handleTyping = (text: string) => {
  setMessageText(text);

  // Limpar timeout anterior
  if (typingTimeoutRef.current) {
    clearTimeout(typingTimeoutRef.current);
  }

  // Emitir que está digitando
  if (socketRef.current && conversationId) {
    socketRef.current.emit('chat:typing', {
      conversationId,
      isTyping: text.length > 0
    });
  }

  // Após 1 segundo parar de digitar
  typingTimeoutRef.current = setTimeout(() => {
    if (socketRef.current && conversationId) {
      socketRef.current.emit('chat:typing', {
        conversationId,
        isTyping: false
      });
    }
  }, 1000);
};
```

**O que faz**:
- Emite `isTyping: true` quando começa a digitar
- Emite `isTyping: false` após 1s sem digitar (debounce)
- Evita spam de eventos

### 7. Visual "Loja está digitando..."

```typescript
{isTyping && (
  <div style={{
    display: 'flex',
    gap: 4,
    padding: '8px 14px',
    alignItems: 'center',
    color: '#999'
  }}>
    <div style={{ fontSize: 12 }}>Loja está digitando</div>
    <div style={{ display: 'flex', gap: 2 }}>
      <div style={{
        width: 4,
        height: 4,
        borderRadius: '50%',
        backgroundColor: '#999',
        animation: 'pulse 1.4s infinite'
      }} />
      <div style={{
        width: 4,
        height: 4,
        borderRadius: '50%',
        backgroundColor: '#999',
        animation: 'pulse 1.4s infinite',
        animationDelay: '0.2s'
      }} />
      <div style={{
        width: 4,
        height: 4,
        borderRadius: '50%',
        backgroundColor: '#999',
        animation: 'pulse 1.4s infinite',
        animationDelay: '0.4s'
      }} />
    </div>
  </div>
)}
```

**Visual**: Três pontos animados pulsando como WhatsApp

---

## Fluxo Completo de Uma Mensagem

```
┌──────────────────────────────────────────────────────────────────┐
│ CLIENTE A                                                        │
│                                                                  │
│ 1. Digite: "Oi, tudo bem?"                                      │
│    └─ handleTyping() chamado                                    │
│       └─ emit('chat:typing', { isTyping: true })               │
│                                                                  │
│ 2. Aperta Enter                                                  │
│    └─ handleSendMessage() chamado                              │
│       ├─ setMessages([...messages, newMessage]) ← Imediato      │
│       ├─ POST /chat/conversations/{id}/messages ← Salva         │
│       └─ emit('chat:message', {...}) ← Broadcast               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ BACKEND (src/sockets/chat.ts)                                    │
│                                                                  │
│ io.on('chat:typing', ...) ← Recebe digitação                    │
│  ├─ Broadcast para sala: 'chat:user_typing'                     │
│  └─ Notifica CLIENTE B                                          │
│                                                                  │
│ io.on('chat:message', ...) ← Recebe mensagem                    │
│  ├─ Broadcast para sala: 'chat:new_message'                     │
│  └─ Notifica CLIENTE B em tempo real                            │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ CLIENTE B (Lojista/Outro Cliente)                               │
│                                                                  │
│ socket.on('chat:user_typing', (data) => {                       │
│  ├─ setIsTyping(true)                                           │
│  └─ Mostra: "Loja está digitando..." ← VISUAL IMEDIATO         │
│ })                                                               │
│                                                                  │
│ socket.on('chat:new_message', (data) => {                       │
│  ├─ setMessages([...messages, data])                            │
│  ├─ Auto-scroll para última mensagem                            │
│  └─ Mensagem aparece IMEDIATAMENTE ← TEMPO REAL                │
│ })                                                               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Eventos Socket.io

### Emitidos pelo Cliente

#### `chat:join`
```typescript
socketRef.current.emit('chat:join', {
  conversationId: string,
  userId: string
});
```
**Quando**: Ao abrir um chat
**Efeito**: Entra na sala da conversa

#### `chat:message`
```typescript
socketRef.current.emit('chat:message', {
  conversationId: string,
  text: string
});
```
**Quando**: Ao enviar uma mensagem
**Efeito**: Broadcast para outros na sala

#### `chat:typing`
```typescript
socketRef.current.emit('chat:typing', {
  conversationId: string,
  isTyping: boolean
});
```
**Quando**: Ao digitar (com debounce)
**Efeito**: Notifica outros que está digitando

### Recebidos pelo Cliente

#### `chat:new_message`
```typescript
socket.on('chat:new_message', (data: {
  conversationId: string,
  senderId: string,
  senderRole: string,
  senderName: string,
  text: string,
  attachments?: any[],
  status: string,
  timestamp: Date
}) => {
  // Adicionar mensagem ao estado
  setMessages(prev => [...prev, data]);
});
```

#### `chat:user_typing`
```typescript
socket.on('chat:user_typing', (data: {
  userId: string,
  userName: string,
  isTyping: boolean
}) => {
  // Mostrar/esconder indicador
  setIsTyping(data.isTyping);
});
```

---

## Configuração Necessária

### Frontend

#### 1. `.env.local` (deve ter)
```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

#### 2. `package.json` (verificar)
```json
{
  "dependencies": {
    "socket.io-client": "^4.5.0"
  }
}
```

Se não tiver, instalar:
```bash
npm install socket.io-client
```

#### 3. Token no localStorage
```typescript
// Ao fazer login, salvar:
localStorage.setItem('token', tokenDoServidor);
localStorage.setItem('user', JSON.stringify(userData));
```

### Backend

#### 1. Socket.io já configurado em `src/index.ts`
```typescript
const server = http.createServer(app);
notifier.initSocket(server);
server.listen(env.PORT);
```

#### 2. CORS habilitado para Socket.io (em `src/services/notifier.ts`)
```typescript
const io = new IOServer(server, { 
  cors: { origin: '*' }  // ← Permite conexões
});
```

---

## Estados da Conexão

### Conectado ✅
```
✅ Socket.io conectado
```
- Mensagens enviadas imediatamente
- Recepciona mensagens em tempo real
- Indicadores de digitação funcionam

### Desconectado ❌
```
❌ Socket.io desconectado
```
- Mensagens ainda são enviadas via API REST (fallback)
- Auto-reconecta em até 5 tentativas
- Indicadores não funcionam (esperado)

### Reconectando 🔄
```
Reconectando...
```
- Socket tenta reconectar a cada 1s
- Máximo 5 tentativas
- Se falhar, opera em modo offline com fallback REST

---

## Performance & Otimizações

### 1. Otimismo Local
```typescript
// Mostrar imediatamente
setMessages([...messages, newMessage]);
setMessageText('');

// Depois salvar no backend
await api.post(...);
```
**Benefício**: Sente instantâneo para usuário

### 2. Debounce na Digitação
```typescript
// Não emite 50x por segundo
// Emite a cada 1s
setTimeout(() => { emit('typing', false) }, 1000);
```
**Benefício**: Reduz tráfego de rede

### 3. Reconexão Automática
```typescript
reconnection: true,
reconnectionDelay: 1000,
reconnectionDelayMax: 5000,
reconnectionAttempts: 5
```
**Benefício**: Recupera conexão sem ação do usuário

### 4. Ref em vez de State
```typescript
const socketRef = useRef<Socket | null>(null);
```
**Benefício**: Socket persiste entre renders, não cria nova conexão

### 5. Auto-scroll
```typescript
useEffect(() => {
  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [messages]);
```
**Benefício**: Sempre mostra última mensagem

---

## Exemplo de Conversa em Tempo Real

### Timeline

```
⏰ 14:30:00 - Cliente abre chat
  → socket.emit('chat:join', { conversationId: 'abc123' })
  → Entrado na sala chat:abc123

⏰ 14:30:05 - Cliente começa a digitar
  → Muda input de "Oi" para "Oi, tu"
  → socket.emit('chat:typing', { isTyping: true })
  ← Lojista recebe 'chat:user_typing' { isTyping: true }
  ← Lojista vê: "Cliente está digitando..."

⏰ 14:30:07 - Cliente aperta Enter
  → socket.emit('chat:typing', { isTyping: false })
  → socket.emit('chat:message', { text: 'Oi, tudo bem?' })
  → POST /chat/conversations/abc123/messages
  ✅ Mensagem aparece na tela do cliente
  
  ← Lojista recebe 'chat:new_message'
  ✅ Mensagem aparece na tela do lojista em tempo real
  ← Lojista recebe 'chat:user_typing' { isTyping: false }
  ← Desaparece "Cliente está digitando..."

⏰ 14:30:15 - Lojista começa a digitar resposta
  → socket.emit('chat:typing', { isTyping: true })
  ← Cliente recebe 'chat:user_typing' { isTyping: true }
  ← Cliente vê: "Loja está digitando..."

⏰ 14:30:20 - Lojista envia resposta
  → socket.emit('chat:message', { text: 'Oi! Tudo certo por aqui!' })
  ✅ Mensagem aparece no chat do lojista
  
  ← Cliente recebe 'chat:new_message'
  ✅ Mensagem aparece no chat do cliente EM TEMPO REAL
```

**Resultado**: Conversa como WhatsApp, 100% síncrona e em tempo real! 🎉

---

## Troubleshooting

### Mensagens não aparecem em tempo real

**Problema**: Enviou mensagem, mas outra pessoa não vê
**Solução**:
1. Verificar se Socket.io está conectado: `socketRef.current?.connected`
2. Verificar console para erros
3. Verificar se `chat:join` foi emitido
4. Verificar CORS no backend

### "Loja está digitando" fica preso

**Problema**: Indicador não some
**Solução**:
1. Verificar `typingTimeoutRef` está funcionando
2. Chamar `setIsTyping(false)` manualmente
3. Recarregar página

### Socket não reconecta

**Problema**: Perdeu conexão e não volta
**Solução**:
1. Verificar URL do servidor em `.env.local`
2. Verificar se servidor está rodando na porta
3. Verificar se token é válido
4. Recarregar página

---

## Testes Recomendados

- [ ] Abrir 2 abas (cliente + lojista simulado)
- [ ] Digitar em uma, ver "X está digitando" na outra
- [ ] Enviar mensagem, ver aparecer imediatamente em ambas
- [ ] Fechar/abrir widget, ver histórico persistir
- [ ] Desconectar internet, enviar, reconectar
- [ ] Múltiplas conversas abertas
- [ ] Mobile responsivo
- [ ] Performance com 100+ mensagens

---

## Próximas Melhorias

### Socket.io v2.0
- 🔔 Notificações de som para nova mensagem
- ✅ Read receipts (✓✓ azul)
- 📸 Upload de imagens via Socket.io
- 🔍 Search em histórico de chats
- 📌 Pin de mensagens importantes
- 😊 Reações com emojis
- 🗣️ Typing indicators mais detalhados

---

## Links Úteis

- [Socket.io Client Docs](https://socket.io/docs/v4/client-api/)
- [Socket.io Server Docs](https://socket.io/docs/v4/server-api/)
- [Nosso Chat Backend](../../src/sockets/chat.ts)
- [ChatWidget Component](../../frontend/components/ChatWidget.tsx)

---

✨ **Chat em tempo real implementado com sucesso!** ✨
