# 🔧 TROUBLESHOOTING - Debug do Sistema de Lidas/Não Lidas

## 🆘 Problemas Comuns e Soluções

### ❌ Problema 1: Mensagens Não Ficam Amarelas

#### Sintoma
```
Recebo mensagem mas continua branca/normal
Não vejo o ícone 🔵
Badge não aparece
```

#### Diagnóstico

**Passo 1:** Verificar no Console (F12)
```javascript
// No DevTools → Console, procure por:
// 1. Há erros JavaScript?
// 2. Está recebendo o socket?

// Procure por:
[Socket.io] chat:message received
```

**Passo 2:** Verificar se `msg.status` está sendo recebido
```javascript
// No Console, execute:
document.body.innerText.includes('status')

// Ou abra DevTools → Network
// Procure pela requisição que traz as mensagens
// Veja se há um campo "status": "delivered"
```

**Passo 3:** Verificar a Interface Message
```typescript
// Abra o arquivo: frontend/components/ChatWidgetWithTabs.tsx
// Linhas 5-12, veja se tem:
interface Message {
  status?: 'sent' | 'delivered' | 'read';  // ← DEVE TER ISSO
}
```

#### Solução

**Se `status` não existe:**
1. Abra `ChatWidgetWithTabs.tsx` línea 5
2. Adicione: `status?: 'sent' | 'delivered' | 'read';`
3. Salve (Ctrl+S)
4. Recarregue página (Ctrl+R)

**Se ainda não funciona:**
1. Reinicie o backend: `Ctrl+C` e `npm start`
2. Reinicie o frontend: `Ctrl+C` e `npm run dev`
3. Recarregue a página

**Se AINDA não funciona:**
1. Limpe cache: DevTools → Application → Clear Storage
2. Feche e abra nova aba
3. Faça login de novo
4. Teste novamente

---

### ❌ Problema 2: Badge Aba Não Aparece

#### Sintoma
```
Recebo mensagem
Vejo amarelo na mensagem ✓
Mas não vejo o número na aba
```

#### Diagnóstico

**Passo 1:** Verificar se `unreadCount` existe
```javascript
// No Console, execute:
// Abra DevTools → Console → Elements
// Procure por: "1" ou número próximo ao nome da conversa
// Se estiver lá em HTML mas branco = problema CSS
// Se não estiver em HTML = problema lógica
```

**Passo 2:** Verificar o objeto da conversa
```typescript
// Abra: frontend/components/ChatWidgetWithTabs.tsx
// Linhas 15-20 (interface Conversation)
interface Conversation {
  unreadCount: number;  // ← DEVE TER ISSO
}
```

**Passo 3:** Verificar se está renderizando
```typescript
// Linhas 870-877, procure por:
{tab.unreadCount > 0 && (
  <span>
    {tab.unreadCount}
  </span>
)}
// SE NÃO TIVER, adicione!
```

#### Solução

**Se `unreadCount` é 0:**
1. Backend não está enviando corretamente
2. Verifique: `src/controllers/chatController.ts`
3. Procure pela função que retorna conversas
4. Confirme que `unreadCount` está sendo retornado

**Se `unreadCount > 0` mas não aparece:**
1. O código de renderização pode estar apagado
2. Vá para linhas 870-877 em `ChatWidgetWithTabs.tsx`
3. Procure por:
   ```typescript
   {tab.unreadCount > 0 && (
     <span style={{...}}>
       {tab.unreadCount}
     </span>
   )}
   ```
4. Se não houver, adicione (veja seção "Como Adicionar Manualmente")

---

### ❌ Problema 3: Badge Widget Não Aparece

#### Sintoma
```
Widget está minimizado
Recebo mensagem
Mas não vejo número no botão flutuante
```

#### Diagnóstico

**Passo 1:** Verificar se widget está REALMENTE minimizado
```javascript
// No Console:
isMinimized  // Deve ser 'true'

// Se for false, o widget está aberto
// Badge só aparece quando minimizado!
```

**Passo 2:** Verificar se `totalUnread` está calculado
```javascript
// Procure pela variável:
totalUnread > 0  // Deve ser true

// Se for 0, nenhuma conversa tem não-lida
// Teste enviando mensagem de novo
```

**Passo 3:** Verificar o HTML da badge
```javascript
// DevTools → Elements
// Procure por:
<div style="...#ff4444...">
  5
</div>

// Se estiver lá mas invisível = CSS problem
// Se não estiver = lógica problem
```

#### Solução

**Se `totalUnread` é 0:**
1. As conversas podem não ter `unreadCount` definido
2. Teste enviando 3+ mensagens
3. Aguarde 2 segundos
4. Verifique o console

**Se badge não renderiza:**
1. Vá para linhas 745-761 em `ChatWidgetWithTabs.tsx`
2. Procure por:
   ```tsx
   {totalUnread > 0 && (
     <div style={{...#ff4444...}}>
   )}
   ```
3. Se não estiver, adicione (veja seção "Como Adicionar Manualmente")

**Se aparece mas está fora de posição:**
1. Verifique o CSS: `position: 'absolute'`
2. Verifique: `top: -8, right: -8`
3. Parent deve ter `position: 'relative'`
4. Procure no botão flutuante pelo estilo

---

### ❌ Problema 4: Mensagens Não Marcam Como Lida

#### Sintoma
```
Abro o widget
Mensagens continuam amarelas
Ícone 🔵 não desaparece
```

#### Diagnóstico

**Passo 1:** Verificar se markAsRead() foi chamado
```javascript
// No Console, verifique se há log:
markAsRead called for conversation:...

// Se não houver, o useEffect não rodou
// Se houver, vá para passo 2
```

**Passo 2:** Verificar a requisição HTTP
```javascript
// DevTools → Network
// Procure por: "mark-as-read"
// Verifique:
// - Status: 200 (sucesso)
// - Response tem {success: true}

// Se tiver erro, vá para passo 3
```

**Passo 3:** Verificar se Socket.io emite evento
```javascript
// DevTools → Console
// Procure por:
chat:messages_read received

// Se não houver, backend não enviou
```

#### Solução

**Se markAsRead() não foi chamado:**
1. Verifique se widget está ABERTO (`isOpen === true`)
2. Verifique se widget NÃO está MINIMIZADO (`isMinimized === false`)
3. Procure no código pelo useEffect:
   ```typescript
   useEffect(() => {
     if (isOpen && !isMinimized && activeTabId) {
       markAsRead(activeTabId)
     }
   }, [isOpen, isMinimized, activeTabId])
   ```
4. Se não tiver, adicione

**Se requisição falha:**
1. Verifique se backend está rodando: `npm start`
2. Verifique URL em `api.ts`: `http://localhost:4000`
3. Verifique se rota existe: `src/routes/chat.ts`
4. Procure por: `PUT /conversations/:id/mark-as-read`

**Se Socket.io não emite:**
1. Verifique: `src/services/notifier.ts`
2. Procure por: `emitMessagesRead()`
3. Confirme que está sendo chamado no controller
4. Reinicie backend: `npm start`

---

### ❌ Problema 5: Status Fica "Delivered" Para Sempre

#### Sintoma
```
Mensagem chega com status 'delivered' ✓
Abro widget ✓
Mas status não muda para 'read' ✗
```

#### Diagnóstico

**Passo 1:** Verificar no MongoDB
```bash
# Terminal (com MongoDB rodando)
use your_database_name
db.messages.findOne({text: "sua mensagem"})

# Verifique o campo "status"
# Deve ser: "read" depois de abrir
# Se for "delivered", backend não atualizou
```

**Passo 2:** Verificar função markAsRead() no Backend
```typescript
// Abra: src/controllers/chatController.ts
// Procure por: async markAsRead(...)
// Deve ter:
// - Encontrar mensagens
// - Atualizar status: 'read'
// - Salvar no DB
// - Emitir socket
```

**Passo 3:** Verificar se está sendo chamado
```javascript
// DevTools → Network → mark-as-read
// Verifique:
// - Request foi enviada?
// - Response é 200?
// - Body tem conversationId?
```

#### Solução

**Se MongoDB mostra 'delivered' (não é 'read'):**
1. A função markAsRead() pode estar errada
2. Abra: `src/controllers/chatController.ts`
3. Procure por: `markAsRead(conversationId: string)`
4. Confirme que tem:
   ```typescript
   await Message.updateMany(
     {conversationId, senderId: {$ne: userId}},
     {status: 'read'}
   )
   ```
5. Se não tem, adicione ou corrija

**Se Request falha (status !== 200):**
1. Verifique autenticação
2. Verifique se rota está protegida corretamente
3. Verifique se token JWT é válido
4. Recarregue página para obter novo token

---

### ❌ Problema 6: Múltiplas Conversas com Contagem Errada

#### Sintoma
```
Conversa A: 3 não-lidas
Conversa B: 2 não-lidas
Badge widget mostra: 4 (deveria ser 5)
```

#### Diagnóstico

**Passo 1:** Verificar cálculo totalUnread
```typescript
// Abra: ChatWidgetWithTabs.tsx
// Procure por:
const totalUnread = tabs.reduce((sum, tab) => sum + (tab.unreadCount || 0), 0)

// Verifique se todos os tabs têm unreadCount
```

**Passo 2:** Verificar cada conversa
```javascript
// No Console:
tabs.forEach(tab => console.log(tab.otherParticipantName, tab.unreadCount))

// Veja se algum tem:
// - undefined
// - null
// - NaN
```

**Passo 3:** Verificar Backend
```javascript
// Na requisição GET conversas, resposta deve ser:
[
  {conversationId: "123", unreadCount: 3},
  {conversationId: "456", unreadCount: 2},
]
// Total: 5
```

#### Solução

**Se algum conversa tem undefined:**
1. Backend não está retornando unreadCount
2. Abra: `src/controllers/chatController.ts`
3. Procure pela função que retorna conversas
4. Adicione o cálculo de unreadCount para cada conversa

**Se total está errado:**
1. Verifique a fórmula:
   ```javascript
   total = conv1.unreadCount + conv2.unreadCount + ...
   ```
2. Use a função reduce corretamente:
   ```typescript
   tabs.reduce((sum, tab) => sum + (tab.unreadCount || 0), 0)
   ```
3. O `|| 0` trata undefined como zero

---

## 🔍 Debug Avançado

### Ativar Logs Detalhados

**No Frontend (ChatWidgetWithTabs.tsx):**
```typescript
// Adicione no início da renderização:
console.log('📊 Chat State:', {
  isOpen,
  isMinimized,
  activeTabId,
  totalUnread,
  tabs: tabs.map(t => ({
    name: t.otherParticipantName,
    unread: t.unreadCount,
  })),
});

// Adicione na renderização de cada mensagem:
console.log('📨 Message:', {
  text: msg.text,
  status: msg.status,
  isUnread,
  senderId: msg.senderId,
});
```

**No Backend (chatController.ts):**
```typescript
// Adicione na função markAsRead:
console.log('✅ Marking as read:', {
  conversationId,
  userId,
  timestamp: new Date().toISOString(),
});

// Adicione depois de atualizar:
console.log('📝 Updated messages:', result);
```

### Monitorar Socket.io

**No Console:**
```javascript
// Verificar eventos recebidos:
socket.onAny((eventName, ...args) => {
  console.log(`📡 Socket Event: ${eventName}`, args);
});

// Verificar eventos enviados:
socket.on('*', (event) => {
  console.log(`📤 Emitted: ${event}`);
});
```

### Inspecionar MongoDB

```bash
# Terminal
mongosh
use your_db
db.messages.find({conversationId: "id"}).pretty()

# Veja o campo "status" para cada mensagem
db.messages.countDocuments({status: "delivered"})
db.messages.countDocuments({status: "read"})
```

---

## 🛠️ Como Adicionar Manualmente

### Se Badge Aba Desapareceu

**Arquivo:** `frontend/components/ChatWidgetWithTabs.tsx`  
**Linhas:** ~870-880

```typescript
// PROCURE POR:
<span>
  {tab.otherParticipantRole === 'lojista' ? '🏪' : '🏍️'}{' '}
  {tab.otherParticipantName.substring(0, 12)}
  {/* ADICIONE ISSO AQUI: */}
  {tab.unreadCount > 0 && (
    <span style={{
      marginLeft: 4,
      backgroundColor: '#ff6b6b',
      color: 'white',
      fontSize: 10,
      padding: '1px 4px',
      borderRadius: 3,
    }}>
      {tab.unreadCount}
    </span>
  )}
</span>
```

### Se Badge Widget Desapareceu

**Arquivo:** `frontend/components/ChatWidgetWithTabs.tsx`  
**Linhas:** ~745-761

```typescript
// PROCURE POR:
{(!isOpen || isMinimized) && (
  <div ...>
    <button>💬</button>
    {/* ADICIONE ISSO DEPOIS DO BOTÃO: */}
    {totalUnread > 0 && (
      <div style={{
        position: 'absolute',
        top: -8,
        right: -8,
        backgroundColor: '#ff4444',
        color: 'white',
        borderRadius: '50%',
        width: 24,
        height: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 'bold',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      }}>
        {totalUnread > 99 ? '99+' : totalUnread}
      </div>
    )}
  </div>
)}
```

### Se Estilos Amarelos Desapareceram

**Arquivo:** `frontend/components/ChatWidgetWithTabs.tsx`  
**Linhas:** ~1027-1075

```typescript
// PROCURE POR:
{activeTab.messages.map((msg, idx) => {
  const isOwn = msg.senderId === user.id;
  // ADICIONE ISTO:
  const isUnread = msg.status !== 'read' && !isOwn;
  
  return (
    <div ...>
      <div style={{
        // MODIFIQUE O backgroundColor:
        backgroundColor: isOwn 
          ? '#d4f5d4' 
          : isUnread 
            ? '#fff3cd'  // ← AMARELO
            : '#fff',
        // ADICIONE border e boxShadow:
        border: isOwn 
          ? 'none' 
          : isUnread
            ? '2px solid #ffc107'  // ← BORDA AMARELA
            : '1px solid #e9ecef',
        boxShadow: isUnread ? '0 2px 8px rgba(255, 193, 7, 0.3)' : 'none',
      }}>
        {!isOwn && (
          <p>
            {msg.senderName} {isUnread && '🔵'}  {/* ← ÍCONE */}
          </p>
        )}
      </div>
    </div>
  );
})}
```

---

## ✅ Checklist de Verificação

Antes de reportar erro, cheque:

- [ ] Backend está rodando (`npm start`)
- [ ] Frontend está rodando (`npm run dev`)
- [ ] MongoDB está ativo
- [ ] Port 3000 está disponível
- [ ] Port 4000 está disponível
- [ ] Sem erros no console (F12)
- [ ] Sem erros no terminal
- [ ] Cache limpo (Ctrl+Shift+Delete)
- [ ] Página recarregada (Ctrl+R)
- [ ] Backend reiniciado
- [ ] Frontend reiniciado
- [ ] Novo login/logout
- [ ] Abra conversation correta
- [ ] Widget aberto E expandido (não minimizado)

---

## 📞 Informações para Reportar Erro

Se nada funcionar, reúna estas informações:

```
1. Qual o erro exato que vê?
   ____________________________________

2. Quando começou?
   ____________________________________

3. Último comando que rodou:
   ____________________________________

4. Output do console (F12):
   ____________________________________

5. Output do terminal backend:
   ____________________________________

6. Output do terminal frontend:
   ____________________________________

7. Número de mensagens não-lidas:
   ____________________________________

8. Widget está minimizado ou aberto?
   ____________________________________

9. Alguma abra está aberta?
   ____________________________________

10. Qual versão do Node? (node -v)
    ____________________________________
```

---

**Última Atualização:** 2024  
**Versão:** 1.0
