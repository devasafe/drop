# 📊 DIAGRAMAS: Fluxos de Chat Implementados

## 1️⃣ Fluxo Motoboy → Cliente

```
┌─────────────────────────────────────────────────────────────────┐
│                      MOTOBOY → CLIENTE                          │
└─────────────────────────────────────────────────────────────────┘

MOTOBOY APP
    ↓
[Clica em "Abrir Chat" com Cliente]
    ↓
Frontend dispara POST /api/chat/conversations
    │ type: 'motoboy_cliente'
    │ otherParticipantId: clienteId
    └→ BACKEND: chatController.createOrGetConversation()
        ├─ Busca User (cliente) ✅
        ├─ Cria/busca Conversation
        ├─ Socket.io: emitNewConversation()
        └─ Retorna 201: Conversation
    ↓
Widget abre com chat do cliente ✅
    ↓
MOTOBOY                          CLIENTE
  Digita mensagem                  Recebe notificação
    ↓                              ↓
  [Envia]        Socket.io       [Abre chat]
    ├─→ POST /messages           ←─┤
    │   Backend cria Message        │
    │   Socket emite evento        ←→
    └─→ Cliente vê em tempo real
        ├─ ✓  (enviada)
        ├─ ✓✓ (lida)
        └─ Contador de não lidas: 0

Qualquer um clica delete
    ↓
Conversa removida de sua lista
Outro usuário continua vendo até deletar também
```

---

## 2️⃣ Fluxo Motoboy → Loja ✨ **[NOVO - CORRIGIDO]**

```
┌─────────────────────────────────────────────────────────────────┐
│                      MOTOBOY → LOJA (NOVO!)                     │
└─────────────────────────────────────────────────────────────────┘

MOTOBOY APP - Página Entrega
    ↓
[Clica em "💬 Abrir Chat" da Loja]
    ↓
Frontend dispara CustomEvent('openChat')
    │ detail: { storeId, storeName, type: 'store' }
    ↓
ChatWidgetWithTabs listener
    │ Abre widget
    │ Chama openChatWithStore(storeId, storeName, 'lojista', 'store')
    ↓
Frontend faz POST /api/chat/conversations
    │ type: 'loja_motoboy'
    │ otherParticipantId: storeId  ← ⚠️ É storeId, não userId!
    └→ BACKEND: chatController.createOrGetConversation()
        │
        ├─ Valida type ✅
        ├─ Detecta: type === 'loja_motoboy' ✅
        │
        ├─ Store.findById(storeId)  ✅ ← NOVO!
        │  └─ Pega store.ownerId (userId do lojista)
        │
        ├─ Busca/cria Conversation
        │  └─ participant1.userId: motoboy_id
        │  └─ participant2.userId: lojista_id  ← ✅ Correto!
        │
        ├─ Socket.io: emitNewConversation(motoboy_id, lojista_id)
        └─ Retorna 201: Conversation
    ↓
Widget abre com chat da loja ✅
    ↓
MOTOBOY                          LOJISTA
  Widget mostra loja              Widget: Nova conversa
  Digita mensagem                 Notificação: 1 não lida
    ↓                              ↓
  [Envia]        Socket.io       [Abre chat]
    ├─→ POST /messages           ←─┤
    │   Backend cria Message        │
    │   Socket emite evento        ←→
    └─→ Lojista vê em tempo real
        ├─ ✓  (enviada)
        ├─ ✓✓ (lida)
        └─ Contador volta a 0

Motoboy clica delete
    ↓
Conversa removida do motoboy
Lojista continua vendo até deletar também ✅
```

---

## 3️⃣ Fluxo Cliente → Loja

```
┌─────────────────────────────────────────────────────────────────┐
│                      CLIENTE → LOJA                             │
└─────────────────────────────────────────────────────────────────┘

CLIENTE APP
    ↓
[Opção 1: Clica em Loja no Catálogo]
    └─→ Vai para /stores/[id]
        └─ Clica "Abrir Chat" ✅
           POST /conversations/pre-purchase
    
[Opção 2: Clica em Chat no Carrinho]
    └─→ Chat abre atrelado ao orderId
        POST /conversations
        type: 'loja_cliente'
    
[Opção 3: Clica em Loja após compra]
    └─→ Chat para suporte/dúvidas
        POST /conversations
        type: 'loja_cliente'
    ↓
Backend: chatController.createOrGetConversation()
    ├─ Valida tipo ✅
    ├─ Busca User (cliente) ✅
    ├─ Busca User (lojista via otherParticipantId) ✅
    ├─ Cria/busca Conversation
    └─ Retorna 201
    ↓
Widget abre com chat da loja ✅
    ↓
CLIENTE                          LOJISTA
  Digita mensagem                 Recebe notificação
    ↓                              ↓
  [Envia]        Socket.io       [Abre chat]
    ├─→ POST /messages           ←─┤
    │   Backend cria Message        │
    │   Socket emite evento        ←→
    └─→ Lojista vê em tempo real
        ├─ ✓  (enviada)
        ├─ ✓✓ (lida)
        └─ Contador de não lidas: 0

Resposta imediata do lojista
    ↓
Cliente vê mensagem chegando em tempo real ✅
```

---

## 4️⃣ Fluxo Loja → Qualquer Um

```
┌─────────────────────────────────────────────────────────────────┐
│                   LOJA → MOTOBOY/CLIENTE                        │
└─────────────────────────────────────────────────────────────────┘

LOJISTA APP / Painel Admin
    ↓
[Abre lista de Conversas]
    ├─ Conversas com clientes (loja_cliente)
    └─ Conversas com motoboys (loja_motoboy)
    ↓
[Seleciona conversa]
    ↓
[Digita resposta]
    ↓
[Clica enviar]
    ↓
Frontend: POST /api/chat/messages
    │ conversationId
    │ text: '...'
    └→ Backend: chatController.sendMessage()
        ├─ Cria Message
        ├─ Socket.io: emite para conversation:conversationId
        └─ Socket.io: notifica o outro participante
    ↓
Socket.io
    ├─ Se motoboy: Recebe notificação no motoboy app
    └─ Se cliente: Recebe notificação no cliente app
    ↓
MOTOBOY / CLIENTE
    Recebe mensagem em tempo real ✅
    Widget mostra:
    ├─ Contador de não lidas
    ├─ Mensagem da loja
    └─ Pode responder imediatamente

Tempo real garantido via Socket.io! ✅
```

---

## 📱 Vista do Widget

```
┌─────────────────────────────────┐
│  💬 Chat                         │
├─────────────────────────────────┤
│                                 │
│  ┌─ Aba 1 (Loja AsapStore)    │ ← 2 não lidas
│  │ ┌───────────────────────┐  │
│  │ │ Loja:                 │  │
│  │ │ Oi, qual sua dúvida?  │  │
│  │ │                   ✓✓  │  │
│  │ │                       │  │
│  │ │ Você:                 │  │
│  │ │ Como faço para devol..│  │
│  │ │                   ✓   │  │
│  │ └───────────────────────┘  │
│  │ ┌─ input: "Sua resposta"─┐ │
│  │ └─────────────────────────┘ │
│  │                             │
│  ├─ Aba 2 (Cliente João)     │ ← 0 não lidas
│  │ ┌───────────────────────┐  │
│  │ │ João:                 │  │
│  │ │ Posso cancelar?       │  │
│  │ │                   ✓✓  │  │
│  │ │                       │  │
│  │ │ Você: Sim!            │  │
│  │ │                   ✓✓  │  │
│  │ └───────────────────────┘  │
│  │ ┌─ input: "Sua resposta"─┐ │
│  │ └─────────────────────────┘ │
│  └─────────────────────────────┘
│                                 │
│ [_]  [X]  [×] (minimize/delete) │
└─────────────────────────────────┘

✓  = Enviada
✓✓ = Lida
```

---

## 🔄 Lifecycle de uma Conversa

```
1. CRIAÇÃO
   ┌─────────────────────┐
   │ createOrGetConversation
   ├─ Valida tipo de conversa
   ├─ Se loja_motoboy: Store → ownerId
   ├─ Busca User ambos participantes
   ├─ Cria novo Conversation no MongoDB
   ├─ Socket.io: emitNewConversation()
   └─ Retorna 201 com dados
   └─→ Widget abre nova aba

2. TROCA DE MENSAGENS
   ┌─────────────────────┐
   │ sendMessage
   ├─ Cria Message no MongoDB
   ├─ Incrementa messageCount
   ├─ Atualiza lastMessageAt
   ├─ Socket.io: emite para conversation room
   └─ Socket.io: notifica outro participante
   └─→ Ambos veem em tempo real

3. LEITURA DE MENSAGEM (Opcional)
   ┌─────────────────────┐
   │ markAsRead
   ├─ Marca Message como lido
   ├─ Atualiza unreadCount
   ├─ Socket.io: emite atualização
   └─→ Outro usuário vê ✓✓

4. SOFT DELETE
   ┌─────────────────────┐
   │ deleteConversation
   ├─ Adiciona userId a deletedBy
   ├─ Se deletedBy.length === 2:
   │  └─ Marca isActive = false
   ├─ Salva no MongoDB
   └─→ Conversa desaparece para esse usuário
   
   Outro usuário ainda vê até deletar também!
```

---

## 🎯 Todos os Fluxos Funcionando! ✅

| Fluxo | Status | Tipo | Notificação |
|-------|--------|------|-------------|
| Motoboy → Cliente | ✅ | motoboy_cliente | Sim |
| Motoboy → Loja | ✅ | loja_motoboy | Sim |
| Cliente → Loja | ✅ | loja_cliente | Sim |
| Loja → Motoboy | ✅ | loja_motoboy | Sim |
| Loja → Cliente | ✅ | loja_cliente | Sim |

**Todos com:**
- ✅ Mensagens em tempo real
- ✅ Notificações de não lidas
- ✅ Soft delete per-user
- ✅ Histórico persistido
- ✅ Widget global

---

## 🚀 Arquitetura Final

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js)                        │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           ChatWidgetWithTabs.tsx (Global)           │   │
│  │  ├─ Multiple Tabs (loja, cliente, motoboy)          │   │
│  │  ├─ Socket.io listener: newMessage, unreadCount    │   │
│  │  ├─ API calls: POST /chat/conversations             │   │
│  │  │                POST /chat/messages                │   │
│  │  └─ CustomEvent listener: 'openChat'                │   │
│  └──────────────────────────────────────────────────────┘   │
│                         ↕ Socket.io                           │
└─────────────────────────────────────────────────────────────┘
                          ↕↕↕ HTTP/WebSocket
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (Express.js)                      │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │            routes/chat.ts (7 rotas)                 │   │
│  │  ├─ POST   /conversations (create/get)              │   │
│  │  ├─ GET    /conversations (list user's)             │   │
│  │  ├─ POST   /conversations/:id/messages              │   │
│  │  ├─ PUT    /conversations/:id/mute                  │   │
│  │  ├─ PUT    /conversations/:id/block                 │   │
│  │  ├─ DELETE /conversations/:id (soft delete)         │   │
│  │  └─ POST   /conversations/pre-purchase (loja)       │   │
│  └──────────────────────────────────────────────────────┘   │
│                         ↕                                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │        controllers/chatController.ts                │   │
│  │  ├─ createOrGetConversation() [CORRIGIDO]          │   │
│  │  │  └─ Detecta: otherParticipantId = storeId?      │   │
│  │  │     └─ Store.findById() → .ownerId              │   │
│  │  ├─ sendMessage()                                   │   │
│  │  ├─ listConversations()                             │   │
│  │  └─ deleteConversation() (soft delete)              │   │
│  └──────────────────────────────────────────────────────┘   │
│                         ↕                                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │          services/notifier.ts (Socket.io)           │   │
│  │  ├─ emitNewConversation(userId1, userId2)          │   │
│  │  ├─ emitMessage(conversationId, message)            │   │
│  │  ├─ emitUnreadCount(userId, count)                  │   │
│  │  └─ Join/Leave rooms                                │   │
│  └──────────────────────────────────────────────────────┘   │
│                         ↕                                     │
└─────────────────────────────────────────────────────────────┘
                          ↕↕↕ HTTP
┌─────────────────────────────────────────────────────────────┐
│                    DATABASE (MongoDB)                        │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  collections/                                       │   │
│  │  ├─ Conversation (com deletedBy, type, isActive)   │   │
│  │  ├─ Message (com createdAt, isRead)                │   │
│  │  └─ User (com activeRole, role)                     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## ✨ Pronto para Produção!

Todos os fluxos implementados, testados e funcionando em tempo real! 🚀
