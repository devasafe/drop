# 🚀 Chat em Tempo Real - Guia Prático de Implementação

## Status Atual

✅ **Backend**: Socket.io já configurado (`src/sockets/chat.ts`)
✅ **Frontend**: ChatWidget com Socket.io integrado
✅ **Autenticação**: JWT tokens
✅ **Eventos**: Join, Message, Typing

**Próximo Passo**: Testar e resolver problemas

---

## Como Testar Agora

### Opção 1: Manual (Recomendado)

#### 1. Abrir 2 abas do navegador
```
Tab 1: Cliente (http://localhost:3000)
Tab 2: Lojista/Outra conta (http://localhost:3000)
```

#### 2. Fazer login em ambas
```
Tab 1: Login como cliente
Tab 2: Login como lojista (ou outro cliente)
```

#### 3. Na Tab 1: Abrir chat da loja
```
→ Clique em "💬 Chat com a Loja"
→ Widget abre no canto inferior direito
```

#### 4. Na Tab 2: Abrir dashboard/chat da loja
```
→ Vá para "Dashboard" → "Chat com Clientes"
```

#### 5. Testar comunicação
```
Tab 1: Digite "Oi, tudo bem?"
→ Vê "Loja está digitando..." na Tab 2?
→ Tab 2 recebe mensagem em tempo real?

Tab 2: Responda "Oi! Tudo certo!"
→ Tab 1 vê "Loja está digitando..."?
→ Tab 1 recebe resposta em tempo real?
```

#### 6. Verificar no Console
```
F12 → Console
Procure por:
- "✅ Socket.io conectado"
- "✅ Entrado na sala: chat:abc123"
- "📨 Nova mensagem recebida:"
```

---

## Checklist de Funcionalidades

### Chat Widget Básico
- [ ] Widget abre ao clicar em "💬 Chat com a Loja"
- [ ] Widget fecha com botão "×"
- [ ] Widget minimiza com "▼"
- [ ] Widget maximiza com "▲"
- [ ] Histórico de mensagens carrega ao abrir

### Envio/Recepção em Tempo Real
- [ ] Mensagem enviada aparece imediatamente na aba que enviou
- [ ] Mensagem aparece na OUTRA aba em tempo real (sem refresh)
- [ ] Timestamp correto em ambas as mensagens
- [ ] Cor diferente para mensagens enviadas vs recebidas

### Digitação em Tempo Real
- [ ] Ao digitar na Tab 1: "Cliente está digitando..." aparece na Tab 2
- [ ] Após 1s parado: indicador desaparece
- [ ] Ao digitar na Tab 2: "Loja está digitando..." aparece na Tab 1
- [ ] Animação dos 3 pontos funciona

### Persistência & Histórico
- [ ] Fechar widget, abrir novamente: histórico persiste
- [ ] Recarregar página: histórico carrega do banco
- [ ] Múltiplos chats abertos: cada um com seu histórico

### Mobile Responsivo
- [ ] Testar em device móvel
- [ ] Widget ocupa 100% da width em mobile
- [ ] Botões clicáveis (não muito pequenos)
- [ ] Scroll de mensagens funciona

---

## Debug & Logs

### Ativar Logs Detalhados

No `ChatWidget.tsx`, mude:
```typescript
// Antes:
console.log('📨 Nova mensagem recebida:', data);

// Depois (mais detalhado):
console.log('📨 Nova mensagem recebida:', {
  conversationId: data.conversationId,
  senderId: data.senderId,
  text: data.text.slice(0, 50),
  timestamp: data.timestamp
});
```

### Verificar Socket Status

Abrir console e executar:
```javascript
// Substituir 'socket' pelo nome da variável
console.log('Socket conectado?', socketRef.current?.connected);
console.log('Socket ID:', socketRef.current?.id);
console.log('Socket URL:', socketRef.current?.io?.uri);
```

### Monitorar Eventos Emitidos

```javascript
// No ChatWidget useEffect:
if (socketRef.current) {
  socketRef.current.onAnyOutgoing((event, ...args) => {
    console.log(`📤 Evento emitido: ${event}`, args);
  });
  
  socketRef.current.onAny((event, ...args) => {
    console.log(`📥 Evento recebido: ${event}`, args);
  });
}
```

---

## Problemas Comuns & Soluções

### ❌ "Socket não conecta"

**Sintoma**: Console mostra `❌ Socket.io desconectado` e não reconecta

**Causas**:
1. ❌ Servidor não está rodando
2. ❌ URL errada em `.env.local`
3. ❌ Token inválido ou expirado
4. ❌ CORS bloqueando

**Soluções**:
```bash
# 1. Verificar se servidor está rodando
npm run dev  # frontend
npm start    # backend

# 2. Verificar .env.local
echo $env:NEXT_PUBLIC_API_URL  # PowerShell
# Deve ser: http://localhost:3000

# 3. Verificar token
localStorage.getItem('token')  # No console do browser

# 4. Verificar CORS
# Deve estar configurado em src/services/notifier.ts
const io = new IOServer(server, { cors: { origin: '*' } });
```

---

### ❌ "Mensagens não aparecem em tempo real"

**Sintoma**: Envia mensagem, só aparece no próximo refresh

**Causa**: Socket.io desconectado ou evento não emitido

**Solução**:
```typescript
// Verificar se socket está emitindo
if (!socketRef.current) {
  console.error('❌ Socket não inicializado');
  return;
}

if (!socketRef.current.connected) {
  console.error('❌ Socket desconectado');
  return;
}

console.log('✅ Socket pronto, emitindo...');
socketRef.current.emit('chat:message', { ... });
```

---

### ❌ "Indicador de digitação fica preso"

**Sintoma**: "Loja está digitando..." não some

**Causa**: `typingTimeoutRef` não funcionando

**Solução**:
```typescript
// Adicionar log
console.log('🔤 Digitando:', text.length > 0);
console.log('⏱️ Timeout ID:', typingTimeoutRef.current);

// Se ainda não funcionar, adicionar fallback:
useEffect(() => {
  if (isTyping) {
    const timer = setTimeout(() => {
      setIsTyping(false);
      console.log('⏱️ Timeout forcível: typing = false');
    }, 3000);
    return () => clearTimeout(timer);
  }
}, [isTyping]);
```

---

### ❌ "Múltiplas conexões Socket.io"

**Sintoma**: Console mostra "Conectado" várias vezes

**Causa**: Socket.io inicializando em cada render

**Solução**: Já está feito! Mas se ainda acontecer:
```typescript
// Verificar se cleanup está funcionando
useEffect(() => {
  console.log('🔌 Inicializando socket...');
  
  return () => {
    console.log('🔌 Limpando socket...');
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
  };
}, [user]); // ← Só executa quando user muda
```

---

## Performance & Otimizações

### Monitorar Latência

```typescript
// Ao enviar mensagem
const startTime = Date.now();

socketRef.current.emit('chat:message', { ... });

socketRef.current.on('chat:new_message', (data) => {
  const latency = Date.now() - startTime;
  console.log(`⚡ Latência: ${latency}ms`);
});
```

### Medir Tamanho de Dados

```typescript
// Antes de emitir
const messageSize = JSON.stringify({ text: messageText }).length;
console.log(`📦 Tamanho da mensagem: ${messageSize} bytes`);
```

### Verificar Frequência de Eventos

```typescript
// Debounce de digitação já implementado
// Mas se precisar mais agressivo:
const TYPING_DEBOUNCE = 2000; // 2 segundos em vez de 1
```

---

## Teste de Carga

### Simular múltiplas mensagens

```javascript
// No console do browser:
for (let i = 0; i < 50; i++) {
  socketRef.current.emit('chat:message', {
    conversationId: 'test',
    text: `Mensagem de teste ${i}`
  });
}
```

**Esperado**: Todas as mensagens aparecem rapidamente

---

## Integrando no App Completo

### 1. Verificar que ChatWidget está renderizado em `_app.tsx`

```typescript
// frontend/pages/_app.tsx
import ChatWidget from '../components/ChatWidget';

// No AppWrapper component:
{token && shouldShowChat && (
  <ChatWidget
    mode={isSeller ? 'seller' : 'customer'}
    storeId={isSeller ? user?._id : undefined}
    conversationType="user"
  />
)}
```

### 2. Testar em diferentes páginas

- [ ] HomePage: widget aparece e funciona
- [ ] ProductPage: widget aparece e funciona
- [ ] StoreProfile: botão "Chat" abre widget
- [ ] Dashboard: widget funciona (se for lojista)

### 3. Testar fluxo completo de checkout

```
1. Cliente navega produtos
2. Clica em "Chat com a Loja"
3. Conversa com loja em tempo real
4. Volta a adicionar produtos ao carrinho
5. Widget continua funcionando
6. Finaliza compra
7. Chat persiste (histórico salvo)
```

---

## Próximas Features (TODO)

- [ ] Notificação sonora de nova mensagem
- [ ] Badge com número de mensagens não lidas
- [ ] Reações com emojis
- [ ] Upload de imagens
- [ ] Busca em histórico
- [ ] Pinned messages
- [ ] Message read receipts (✅✅)
- [ ] Typing indicators mais realistas
- [ ] Sugestões automáticas

---

## Contatos de Suporte

Se algo não funcionar:

1. **Verificar console** (F12)
   - Procure por erros em vermelho
   - Procure por logs de socket

2. **Verificar Network** (F12 → Network)
   - WS (WebSocket) deve estar verde
   - Não deve haver erros HTTP

3. **Verificar Backend logs**
   - Terminal deve mostrar `✅ [SOCKET] Usuario conectado`
   - Deve mostrar eventos sendo emitidos

4. **Resetar tudo**
   - Limpar localStorage: `localStorage.clear()`
   - Recarregar página: F5
   - Reconectar servidor

---

## Conclusão

✨ **Chat em tempo real está vivo!** ✨

Agora é testar, encontrar bugs, e iterar!

Bora testar? 🚀
