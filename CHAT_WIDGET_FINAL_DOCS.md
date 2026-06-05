# 📱 ChatWidget com Abas - Implementação Completa

## 🎯 Objetivo Alcançado

Você pediu um sistema de chat com **abas tipo navegador**, para abrir múltiplas conversas simultâneas (com loja, motoboy, etc). **✅ IMPLEMENTADO!**

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────┐
│                    Next.js Frontend                  │
│                   (Port 3000)                        │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │         ChatWidgetWithTabs Component         │  │
│  │  ┌──────────────────────────────────────┐  │  │
│  │  │  💬 Chat (0 conversas)  ▼  ✕         │  │  │
│  │  ├──────────────────────────────────────┤  │  │
│  │  │  [🏪 AsapStore ✕] [🏍️ Motoboy ✕]   │  │  │
│  │  ├──────────────────────────────────────┤  │  │
│  │  │  Mensagens do chat                   │  │  │
│  │  │  ...                                 │  │  │
│  │  ├──────────────────────────────────────┤  │  │
│  │  │  [Sua mensagem...]  [✓]              │  │  │
│  │  └──────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
└─────────────────────────────────────────────────────┘
                        │
            ┌───────────┴──────────┐
            │                      │
            ▼                      ▼
       HTTP/REST              Socket.io
    (Criar conversa,        (Mensagens
     carregar histórico)     tempo real)
            │                      │
            └───────────┬──────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │   Express Backend (4000)      │
        │                               │
        │  /api/chat/conversations...   │
        │  - POST /pre-purchase         │
        │  - GET /:id/messages          │
        │  - POST /:id/messages         │
        │                               │
        └───────────────────────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │      MongoDB Atlas            │
        │  (Conversas & Mensagens)      │
        │                               │
        │  - Conversation Document      │
        │  - Message Documents          │
        │  - User References            │
        └───────────────────────────────┘
```

---

## 🔧 Como Funciona

### 1️⃣ **Usuário Clica em "Chat com a Loja"**

```typescript
// Em stores/[id].tsx
window.dispatchEvent(new CustomEvent('openChat', { 
  detail: { 
    storeId: store._id,
    storeName: store.name,
    role: 'lojista'
  } 
}));
```

### 2️⃣ **ChatWidget Recebe o Evento**

```typescript
// ChatWidgetWithTabs.tsx
useEffect(() => {
  const handleOpenChatEvent = (event) => {
    openChatWithStore(eventStoreId, storeName, role);
    setIsOpen(true);
  };
  window.addEventListener('openChat', handleOpenChatEvent);
}, []);
```

### 3️⃣ **Cria Conversa via API**

```typescript
const response = await api.post('/chat/conversations/pre-purchase', {
  storeId: participantId,
  conversationType: 'user',
});
```

### 4️⃣ **Backend Cria/Retorna Conversa**

```typescript
// chatController.ts
export const createOrGetPrePurchaseConversation = async (req, res) => {
  const conversation = await Conversation.findOne(...) || 
                       await Conversation.create(...);
  return res.json(conversation);
}
```

### 5️⃣ **Frontend Carrega Histórico**

```typescript
const messagesResponse = await api.get(
  `/chat/conversations/${conversation._id}/messages`
);
```

### 6️⃣ **Socket.io Conecta para Tempo Real**

```typescript
socketRef.current.emit('chat:join', {
  conversationId: conversation._id,
  userId: user._id,
});
```

### 7️⃣ **Usuário Envia Mensagem**

```typescript
await api.post(`/chat/conversations/${activeTabId}/messages`, {
  text,
  senderId: user._id,
});

// Emite via Socket.io para entrega em tempo real
socketRef.current.emit('chat:send_message', {
  conversationId: activeTabId,
  text,
  ...
});
```

---

## 📁 Arquivos Criados/Modificados

### **Frontend:**
- ✅ `frontend/components/ChatWidgetWithTabs.tsx` - Novo componente com abas
- ✅ `frontend/pages/_app.tsx` - Integra ChatWidgetWithTabs globalmente
- ✅ `frontend/pages/stores/[id].tsx` - Botão "Chat com a Loja" atualizado
- ✅ `frontend/lib/api.ts` - Axios configurado com baseURL

### **Backend:**
- ✅ `src/routes/chat.ts` - Rotas de chat
- ✅ `src/controllers/chatController.ts` - Lógica de conversas
- ✅ `src/middleware/auth.ts` - Autenticação JWT
- ✅ `src/models/Conversation.ts` - Schema de conversa
- ✅ `src/models/Message.ts` - Schema de mensagem

### **Configuração:**
- ✅ `src/app.ts` - Montagem de rotas `/api/chat`

---

## 🎨 Interface Visual

### **Estado Fechado:**
```
[💬]  ← Botão flutuante no canto inferior direito
```

### **Estado Aberto (Sem Conversas):**
```
┌─────────────────────────┐
│ 💬 Chat        ▼  ✕    │
│ 0 conversas            │
├─────────────────────────┤
│                         │
│        👋              │
│   Comece uma           │
│   conversa!            │
│                         │
│  Clique em "Chat       │
│  com a loja" nos       │
│  produtos              │
│                         │
└─────────────────────────┘
```

### **Estado Aberto (Com Conversas):**
```
┌──────────────────────────────────────┐
│ 💬 Chat            ▼  ✕              │
│ 2 conversas                          │
├──────────────────────────────────────┤
│ [🏪 AsapStore ✕]  [🏍️ Motoboy ✕]  │
├──────────────────────────────────────┤
│ João: Oi, tem esse produto?     19:30│
│                                      │
│          Sim, temos em estoque 19:31 │
│                                      │
│ João: Qual o valor do frete?   19:32 │
│                                      │
│ [Sua mensagem...]         [✓]        │
└──────────────────────────────────────┘
```

---

## 📊 Fluxo de Dados (Exemplo Real)

```
1. Usuário em /stores/asapstore (logado como João)
   ↓
2. Clica em "💬 Chat com a Loja"
   ↓
3. Evento: window.dispatchEvent('openChat', {
     storeId: '69b978d620f0d5c949d691b0',
     storeName: 'AsapStore',
     role: 'lojista'
   })
   ↓
4. ChatWidgetWithTabs recebe evento
   ↓
5. POST http://localhost:4000/api/chat/conversations/pre-purchase
   Payload: {
     storeId: '69b978d620f0d5c949d691b0',
     conversationType: 'user'
   }
   Headers: Authorization: Bearer <token_jwt>
   ↓
6. Backend autentica token (JWT)
   ↓
7. Backend procura Conversation com (userId=João, storeId=AsapStore)
   ↓
8. Se não existe, cria nova Conversation
   ↓
9. Response: {
     _id: '507f1f77bcf86cd799439011',
     type: 'loja_cliente_pre_compra',
     participant1: { userId, name, role },
     participant2: { userId, name, role },
     isActive: true,
     createdAt: '2026-03-20T05:02:00Z'
   }
   ↓
10. Frontend cria nova aba com conversationId
    ↓
11. GET http://localhost:4000/api/chat/conversations/507f1f77bcf86cd799439011/messages
    ↓
12. Carrega histórico de mensagens (Array[])
    ↓
13. Socket.io faz join na sala: conversationId
    ↓
14. Usuário digita "Oi, tem esse produto?"
    ↓
15. POST /conversations/507f1f77bcf86cd799439011/messages
    Payload: {
      text: 'Oi, tem esse produto?',
      senderId: 'joaoId',
      senderName: 'João Silva'
    }
    ↓
16. Backend cria Message document
    ↓
17. Socket.io emite: 'chat:new_message' com dados
    ↓
18. Lojista recebe em tempo real via Socket.io
    ↓
19. Lojista responde "Sim, temos em estoque"
    ↓
20. João recebe em tempo real via Socket.io
    ↓
21. Ambos veem mensagens atualizadas
```

---

## 🚀 Como Usar

### **Para Clientes/Usuários:**

1. Faça login no aplicativo
2. Navegue até uma loja (ex: `/stores/69b978d620f0d5c949d691b0`)
3. Clique no botão "💬 Chat com a Loja"
4. O widget abrirá com uma aba da loja
5. Abra outras lojas/motoboys para criar mais abas
6. Clique entre abas para trocar de conversa
7. Feche abas com "✕"

### **Para Desenvolvedores:**

#### Abrir chat programaticamente:
```javascript
window.dispatchEvent(new CustomEvent('openChat', { 
  detail: { 
    storeId: 'ID_DA_LOJA',
    storeName: 'Nome da Loja',
    role: 'lojista' // ou 'motoboy'
  } 
}));
```

#### Monitorar eventos:
```javascript
// Console do navegador
// Ao clicar em chat, verá logs como:
// 🎯 [EVENT LISTENER] Evento recebido: {storeId: '...', storeName: '...', role: '...'}
// 🔍 openChatWithStore called: {...}
// 📡 Fazendo POST para /chat/conversations/pre-purchase
// ✅ Conversa criada/obtida: {...}
// 📨 Mensagens carregadas: [...]
```

---

## ✅ Features Implementadas

- ✅ Widget flutuante com botão 💬
- ✅ Interface de abas (como navegador)
- ✅ Múltiplas conversas simultâneas
- ✅ Fechar abas individuais
- ✅ Indicadores de tipo de contato (🏪/🏍️)
- ✅ Enviar/receber mensagens
- ✅ Histórico de mensagens
- ✅ Autenticação via JWT
- ✅ Socket.io para tempo real
- ✅ CSS puro (sem dependências)
- ✅ Responsivo

---

## 🔄 Próximas Melhorias Sugeridas

1. **Notificações**
   - Badge com número de mensagens não lidas
   - Notificação do navegador quando chega mensagem

2. **Persistência**
   - Salvar abas abertas em localStorage
   - Restaurar abas ao fazer refresh

3. **Indicadores Avançados**
   - Status "Usuário está digitando..."
   - Online/Offline status
   - "Visto em XX minutos atrás"

4. **Busca & Filtro**
   - Buscar conversas antigas
   - Filtrar por contato

5. **Mídia**
   - Enviar imagens/documentos
   - Visualizar previews
   - Download de arquivos

6. **Notificação de Leitura**
   - Marcar como lido
   - Mostrar quem leu

---

## 🐛 Debugging

### Se o chat não funciona:

1. **Abra o console do navegador (F12)**
2. **Procure por logs como:**
   - `🎯 [EVENT LISTENER] Evento recebido` - evento disparado?
   - `🔍 openChatWithStore called` - função chamada?
   - `📡 Fazendo POST` - requisição feita?
   - `✅ Conversa criada` - resposta do backend?
   - `❌ Erro ao ...` - há erros?

3. **Verifique Network tab (F12 > Network)**
   - POST `/api/chat/conversations/pre-purchase` retorna 200?
   - Headers incluem `Authorization: Bearer <token>`?
   - Response tem `_id` da conversa?

4. **Verifique Backend Logs:**
   - `npm start` mostra requisições chegando?
   - `🔐 [AUTH] POST /conversations/pre-purchase`
   - `✅ [AUTH OK]` ou `❌ [AUTH FAIL]`?

---

## 📞 Suporte

Se algo não funcionar:
1. Verifique se backend está rodando: `npm start` na pasta Drop
2. Verifique se frontend está rodando: `npm run dev` na pasta frontend
3. Verifique console do navegador para erros
4. Verifique Network tab para requisições falhando
5. Verifique logs do backend para erros de autenticação

---

**Status:** ✅ **COMPLETO E FUNCIONAL**

O sistema de chat com abas está pronto para uso em produção!
