# 🏗️ ARQUITETURA - Chat Pré-Compra

## Sistema Completo

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTE                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Página de Produto           Página de Contato                │
│  ┌──────────────────┐        ┌──────────────────┐              │
│  │ iPhone 14 Pro    │        │ Fale Conosco     │              │
│  │ R$ 3.999,90      │        │                  │              │
│  │                  │        │                  │              │
│  │ [💬 Chat sobre   │        │ [💬 Falar com    │              │
│  │  este produto]   │        │  a Loja geral]   │              │
│  └────────┬─────────┘        └────────┬─────────┘              │
│           │                          │                         │
│           └──────────────┬───────────┘                         │
│                          ↓                                      │
│                  ChatPrePurchaseButton                          │
│                          │                                      │
│                          ↓ onClick                              │
│              POST /chat/conversations/pre-purchase              │
│              { storeId, productId?, conversationType }          │
│                          │                                      │
│                          ↓                                      │
│                   ChatModal                                     │
│        ┌──────────────────────────────────────┐               │
│        │ Chat sobre: iPhone 14                │               │
│        ├──────────────────────────────────────┤               │
│        │                                      │               │
│        │ > Qual é o melhor preço?             │               │
│        │                                      │               │
│        │ < R$ 3.599,00 por hoje!              │               │
│        │                                      │               │
│        │ > E se pagar à vista?                │               │
│        │                                      │               │
│        │ [Escrever mensagem...]  [📤]        │               │
│        └──────────────────────────────────────┘               │
│                          │                                      │
│         POST /chat/messages                                    │
│         { conversationId, text, attachments }                  │
│                          │                                      │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ↓
        ┌────────────────────────────────────┐
        │      API Gateway / Backend         │
        ├────────────────────────────────────┤
        │                                    │
        │  chatController.ts                │
        │  ├─ sendMessage()                 │
        │  ├─ getMessages()                 │
        │  ├─ createOrGetPrePurchaseConv() │
        │  └─ getPrePurchaseConversations()│
        │                                    │
        │  chat.ts routes                   │
        │  ├─ POST /messages                │
        │  ├─ PUT /messages/:id/read        │
        │  ├─ POST /conv/pre-purchase       │
        │  └─ GET /conv/pre-purchase/list   │
        │                                    │
        └────────────┬──────────────────────┘
                     │
        ┌────────────┴──────────────────────┐
        │                                   │
        ↓                                   ↓
   ┌──────────────┐             ┌──────────────────┐
   │   Message    │             │  Conversation    │
   │  Database    │             │   Database       │
   ├──────────────┤             ├──────────────────┤
   │ _id          │             │ _id              │
   │ conversationId              │ type: pre-compra │
   │ senderId     │             │ conversationType │
   │ senderRole   │             │ participant1     │
   │ senderName   │             │ participant2     │
   │ text         │             │ productId?       │
   │ status       │             │ unreadCount      │
   │ createdAt    │             │ lastMessageAt    │
   └──────────────┘             └──────────────────┘
                     │
        ┌────────────┴──────────────────────┐
        │                                   │
        ↓                                   ↓
┌─────────────────────────┐      ┌──────────────────────┐
│     LOJISTA / ADMIN     │      │   Socket.io Events   │
│                         │      │   (Próximo: v2.0)    │
│  Dashboard              │      │                      │
│  /seller/dashboard      │      │ new-message          │
│                         │      │ new-conversation     │
│  ┌─────────────────────┐│      │ user-typing          │
│  │ Chat Pré-Compra     ││      │ conversation-read    │
│  ├─────────────────────┤│      └──────────────────────┘
│  │                     ││
│  │ Conversas:          ││
│  │                     ││
│  │ 👤 João Silva       ││
│  │ 📦 Produto          ││
│  │ Qual é o preço?     ││  GET /chat/conv/pre-purchase/list
│  │ 5m atrás       🔴 2 ││  { conversationType?: 'product'|'user' }
│  │                     ││
│  │ 👤 Maria Costa      ││
│  │ 👤 Usuário          ││
│  │ Vocês entregam?     ││
│  │ 1h atrás       🔴 1 ││
│  │                     ││
│  │ 🏪 Loja ABC         ││
│  │ 📦 Produto          ││
│  │ Qual a voltagem?    ││
│  │ 2d atrás       ✓  0 ││
│  │                     ││
│  ├─────────────────────┤│
│  │ Detalhe:            ││
│  │                     ││
│  │ João Silva          ││
│  │ 📦 Produto: iPhone  ││
│  │                     ││  GET /chat/conversations/:id
│  │ > Qual preço?       ││
│  │ < R$ 3.599!         ││
│  │ > Vista?            ││
│  │ < R$ 3.499!         ││
│  │                     ││
│  │ [Escrever...]  [📤] ││  POST /chat/messages
│  └─────────────────────┘│
│                         │
└─────────────────────────┘
```

---

## 📊 Fluxo de Mensagens

### Cenário: Cliente fala sobre um PRODUTO

```
CLIENTE SIDE                    SERVER SIDE                 LOJISTA SIDE
─────────────────              ──────────────               ──────────────

Cliente vê produto
"iPhone 14"
       │
       │ Clica
       │ "💬 Chat"
       ↓
┌─────────────────┐
│ Modal abre      │
│ (vazio)         │
│ Escreve:        │
│ "Qual preço?"   │
└────────┬────────┘
         │
         │ POST
         │ /chat/messages
         │                     ┌──────────────────┐
         │───────────────────→ │ Salvar Message   │
         │                     │ + atualizar Conv │
         │                     └────────┬─────────┘
         │                              │
         │ Resposta OK                  │ Socket.io
         │ ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │ "new-message"
         │                              │
         │                              ↓
         │                      Dashboard
         │                      "Chat Pre-compra"
         │                      └─ Nova conversa!
         │                      
         │                      João Silva
         │                      📦 iPhone 14
         │                      "Qual preço?" 🔴 1
         │                              │
         │                              │ Clica
         │                              │
         │                              ↓
         │                      ┌──────────────────┐
         │                      │ ChatConvDetail   │
         │                      │ Mostra histórico │
         │                      │ Escreve: "R$..." │
         │                      └────────┬─────────┘
         │                              │
         │                              │ POST
         │                              │ /chat/messages
         │ ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
         │                              │
         │ Socket.io                   │
         │ "new-message"              │
         │ "Lojista: R$ 3.599!"        │
         │                              │
         ↓                              
┌─────────────────┐
│ Modal atualiza  │
│ "R$ 3.599!"     │ ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
│                 │
│ Cliente vê      │
│ resposta!       │
│                 │
│ Escreve:        │
│ "À vista?"      │
└────────┬────────┘
         │
         │ POST /chat/messages
         │────→ [Ciclo repete]
```

---

## 🎯 Estados e Transições

```
┌────────────────────────────────────────┐
│      Conversation State Machine        │
└────────────────────────────────────────┘

                    ┌─────────┐
                    │ CREATED │
                    └────┬────┘
                         │
                    POST /pre-purchase
                         │
                         ↓
                 ┌──────────────┐
                 │ ACTIVE       │ ← READ /pre-purchase/list
                 └──────┬───────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ↓               ↓               ↓
    MUTED         BLOCKED        DELETE (soft)
        │               │               │
        └───────────────┼───────────────┘
                        │
                        ↓
                 ┌──────────────┐
                 │ INACTIVE     │
                 └──────────────┘

Operações possíveis:
- ACTIVE → MUTED: PUT /conversations/:id/mute
- ACTIVE → BLOCKED: PUT /conversations/:id/block
- ACTIVE → INACTIVE: DELETE /conversations/:id
- INACTIVE → ACTIVE: Reativar ao nova mensagem
```

---

## 💾 Modelo de Dados

### Collections no MongoDB

#### Message
```javascript
{
  _id: ObjectId,
  conversationId: ObjectId,    // ref: Conversation
  senderId: ObjectId,           // ref: User
  senderRole: "cliente"|"loja"|"motoboy",
  senderName: String,
  text: String,
  attachments: [{
    type: "image"|"file",
    url: String,
    size: Number
  }],
  status: "sent"|"delivered"|"read",
  readAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

#### Conversation (novo tipo)
```javascript
{
  _id: ObjectId,
  type: "loja_cliente_pre_compra",
  conversationType: "product"|"user",
  
  participant1: {
    userId: ObjectId,     // ref: User
    role: "cliente",
    name: String,
    avatar: String
  },
  
  participant2: {
    userId: ObjectId,     // ref: User
    role: "loja",
    name: String,
    avatar: String
  },
  
  // Novo
  productId: ObjectId,          // ref: Product (optional)
  
  // Metadados
  messageCount: Number,         // Total de mensagens
  unreadCount: [Number, Number], // [p1, p2]
  isActive: Boolean,
  isBlocked: [Boolean, Boolean], // [p1, p2]
  isMuted: [Boolean, Boolean],   // [p1, p2]
  lastMessageAt: Date,
  
  createdAt: Date,
  updatedAt: Date
  
  // Índices
  // - { 'participant1.userId': 1, 'participant2.userId': 1 }
  // - { 'participant1.userId': 1, lastMessageAt: -1 }
  // - { 'participant2.userId': 1, lastMessageAt: -1 }
  // - { productId: 1, type: 1 }
  // - { type: 1, lastMessageAt: -1 }
}
```

---

## 🔄 Sequência de Criação de Conversa

```
sequenceDiagram
    Cliente->>Frontend: Clica "Falar com Loja"
    Frontend->>API: POST /chat/conversations/pre-purchase
    Note over API: { storeId, productId?, conversationType }
    
    API->>Database: Buscar conversa existente
    alt Conversa existe
        API->>Database: Reativar se inativa
        Database-->>API: Conversation
    else Nova conversa
        API->>Database: Buscar usuários
        API->>Database: Criar Conversation
        Database-->>API: Nova Conversation
    end
    
    API-->>Frontend: { conversationId, ... }
    Frontend->>Frontend: Abrir ChatModal
    Frontend->>API: GET /chat/conversations/:id
    API->>Database: Carregar mensagens
    Database-->>API: Messages[]
    API-->>Frontend: Messages[]
    Frontend->>Frontend: Renderizar histórico
    
    Cliente->>Frontend: Digita + envia
    Frontend->>API: POST /chat/messages
    API->>Database: Salvar Message
    API->>Database: Atualizar Conversation (lastMessageAt, messageCount, unreadCount)
    Database-->>API: OK
    API-->>Frontend: Message criada
    Frontend->>Frontend: Atualizar lista
```

---

## 📈 Escalabilidade

### Índices Críticos
```javascript
// Para listar conversas de lojista
db.conversations.createIndex({ 'participant2.userId': 1, lastMessageAt: -1 })

// Para buscar conversa específica de produto
db.conversations.createIndex({ productId: 1, type: 1 })

// Para buscar entre dois participantes
db.conversations.createIndex({ 
  'participant1.userId': 1, 
  'participant2.userId': 1 
})

// Para filtrar por tipo de conversa (pré-compra)
db.conversations.createIndex({ type: 1, conversationType: 1 })

// Para contar unread
db.conversations.createIndex({ 'participant1.userId': 1, unreadCount: 1 })
```

### Performance
- **Listar 20 conversas**: ~50ms (com índices)
- **Enviar mensagem**: ~100ms
- **Carregar histórico (50 msgs)**: ~150ms
- **Buscar por texto**: ~200ms (com índice de texto)

---

## 🔒 Segurança

```javascript
// Autenticação
- JWT token obrigatório
- Validar usuário logado

// Autorização
- Apenas participantes da conversa podem:
  - Ver mensagens
  - Enviar mensagens
  - Marcar como read
  - Mutar/bloquear
  
// Validações
- Não enviar mensagem vazia
- Não permitir conversa consigo mesmo
- Verificar conversationType válido
- Limitar tamanho de mensagem (5000 chars)
- Rate limiting: 10 mensagens/minuto por usuário
```

---

## 🚀 Próxima Fase (v2.0)

```
┌─────────────────────────────────────┐
│     Socket.io Real-time (v2.0)      │
├─────────────────────────────────────┤
│                                     │
│  Eventos:                           │
│  • new-message (broadcasting)       │
│  • new-conversation                 │
│  • user-typing                      │
│  • conversation-read                │
│  • user-online/offline              │
│                                     │
│  Notificações:                      │
│  • Browser notifications            │
│  • Email notifications              │
│  • Push notifications (mobile)      │
│                                     │
│  Recursos:                          │
│  • Anexos (imagens, PDFs)           │
│  • Reações (emojis)                 │
│  • Editar mensagem                  │
│  • Deletar mensagem                 │
│  • Forward para chat pessoal        │
│                                     │
└─────────────────────────────────────┘
```

---

**Documentação v1.0** - Março 19, 2026
