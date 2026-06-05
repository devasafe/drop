# 🎯 ChatWidgetWithTabs - Sistema de Chat com Abas

## ✅ O que foi implementado

Um sistema de chat **moderno com interface de abas** (como navegador), permitindo conversas simultâneas com múltiplos contatos (lojas, motoboys, etc).

### Características Principais

#### 1. **Interface de Abas**
- Cada conversa abre como uma aba dentro do chat
- Pode ter múltiplas conversas abertas simultaneamente
- Fechar abas individuais com botão "✕"
- Indicador de mensagens não lidas por aba
- Ícones para diferenciar tipo de contato (🏪 loja, 🏍️ motoboy)

#### 2. **Funcionalidades**
- ✅ Enviar e receber mensagens em tempo real (Socket.io)
- ✅ Abrir chat com store ao clicar em "Chat com a Loja"
- ✅ Histórico de mensagens persistente
- ✅ Sincronização automática entre abas
- ✅ Autenticação via JWT token
- ✅ Interface responsiva e minimizável

#### 3. **Arquitetura**

**Frontend:**
- `frontend/components/ChatWidgetWithTabs.tsx` - Componente principal com interface de abas
- Usa Axios para requisições HTTP
- Usa Socket.io para mensagens em tempo real
- Integrado em `_app.tsx` para disponibilidade global

**Backend:**
- `src/routes/chat.ts` - Definição de rotas
- `src/controllers/chatController.ts` - Lógica de conversa
- `src/middleware/auth.ts` - Autenticação com JWT
- Endpoints: POST `/conversations/pre-purchase`, GET `/conversations/:id/messages`, etc

**Base de Dados:**
- `Message` model - Armazena mensagens
- `Conversation` model - Armazena conversas
- MongoDB para persistência

---

## 🚀 Como Usar

### Para Clientes/Usuários

1. **Abrir Chat com Loja**
   - Acesse página de uma loja (`/stores/[id]`)
   - Clique em botão "💬 Chat com a Loja"
   - Chat abre como aba no widget

2. **Conversar com Múltiplos Contatos**
   - Clique em diferentes lojas para abrir novas abas
   - Mude entre abas clicando na aba desejada
   - Feche abas com "✕"

3. **Enviar Mensagem**
   - Digite na caixa "Sua mensagem..."
   - Pressione Enter ou clique botão "✓"

### Para Desenvolvedores

#### Disparar Abertura de Chat Programaticamente

```typescript
// Em qualquer página, dispara evento global
window.dispatchEvent(new CustomEvent('openChat', { 
  detail: { 
    storeId: '69b978d620f0d5c949d691b0',
    storeName: 'Padaria do João',
    role: 'lojista' // ou 'motoboy'
  } 
}));
```

#### Integrar em Nova Página

```tsx
// Adicionar em _app.tsx:
import ChatWidgetWithTabs from '../components/ChatWidgetWithTabs';

// Dentro do JSX:
{token && shouldShowChat && (
  <ChatWidgetWithTabs
    mode={isSeller ? 'seller' : 'customer'}
    storeId={isSeller ? user?._id : undefined}
    conversationType="user"
  />
)}
```

#### Adicionar Botão de Chat em Componente

```tsx
<button onClick={() => {
  window.dispatchEvent(new CustomEvent('openChat', { 
    detail: { 
      storeId: storeId,
      storeName: storeName,
      role: 'lojista'
    } 
  }));
}}>
  💬 Chat
</button>
```

---

## 📊 Fluxo de Dados

```
┌─────────────────┐
│   User Browser  │
│                 │
│ ChatWidgetWithTabs
│  ├─ Aba 1: Store A
│  ├─ Aba 2: Store B
│  └─ Aba 3: Motoboy
│                 │
└────────┬────────┘
         │
    ┌────┴────┐
    │          │
    ▼          ▼
  HTTP      Socket.io
  (REST)    (Real-time)
    │          │
    └────┬─────┘
         │
    ┌────▼───────────────┐
    │   Backend (4000)   │
    │                    │
    │ /api/chat routes   │
    │ - createConversation
    │ - getMessages
    │ - sendMessage
    │                    │
    └────┬───────────────┘
         │
    ┌────▼──────────┐
    │   MongoDB     │
    │               │
    │ Conversation  │
    │ Message       │
    │ User          │
    └───────────────┘
```

---

## 🔧 Endpoints API

### POST `/api/chat/conversations/pre-purchase`
Criar ou obter conversa com loja

**Request:**
```json
{
  "storeId": "69b978d620f0d5c949d691b0",
  "conversationType": "user"
}
```

**Response:**
```json
{
  "_id": "123abc",
  "type": "loja_cliente_pre_compra",
  "participant1": {...},
  "participant2": {...},
  "isActive": true,
  "createdAt": "2026-03-20T04:54:00Z"
}
```

### GET `/api/chat/conversations/:conversationId/messages`
Obter mensagens de uma conversa

**Response:**
```json
[
  {
    "_id": "msg1",
    "conversationId": "123abc",
    "senderId": "user1",
    "text": "Olá!",
    "timestamp": "2026-03-20T04:54:10Z"
  }
]
```

### POST `/api/chat/conversations/:conversationId/messages`
Enviar mensagem

**Request:**
```json
{
  "text": "Qual o valor do frete?",
  "senderId": "user1",
  "senderName": "João Silva"
}
```

---

## 🎨 Customização CSS

O componente usa Tailwind CSS classes. Para customizar:

1. **Cores**
   - Altere `bg-blue-600` para outra cor
   - Altere `text-blue-500` para highlight

2. **Dimensões**
   - `w-96 h-96` - Tamanho da janela
   - `bottom-4 right-4` - Posição na tela

3. **Ícones**
   - Troque emojis (💬, 🏪, 🏍️, etc)

Exemplo customizado:

```tsx
<div className="bg-green-600">  {/* Verde ao invés de azul */}
  {/* ... */}
</div>
```

---

## 🐛 Troubleshooting

### Chat retorna 404

**Solução:** Verificar se:
1. Backend está rodando em port 4000
2. Token JWT é válido
3. Request inclui header `Authorization: Bearer <token>`

### Mensagens não aparecem em tempo real

**Solução:**
1. Verificar conexão Socket.io (deve aparecer "✅ Socket.io conectado")
2. Verificar se `conversationId` está correto
3. Verificar logs do backend para eventos `chat:new_message`

### Não consegue abrir aba

**Solução:**
1. Fazer login primeiro
2. Verificar console do navegador para erros
3. Verificar se `storeId` é válido

---

## 📝 Estado do Projeto

- ✅ Backend: Chat routes funcionando
- ✅ Frontend: ChatWidgetWithTabs implementado
- ✅ Socket.io: Conexões estabelecidas
- ✅ Autenticação: JWT token validado
- ✅ UI: Interface com abas pronta
- ⚠️ Banco: Conversation model precisa de ajustes menores
- ⚠️ Testes: Validação end-to-end pendente

---

## 🎯 Próximos Passos

1. **Notificações**
   - Notificar usuário quando recebe mensagem
   - Badge com número de mensagens não lidas

2. **Persistência**
   - Salvar estado das abas abertas
   - Reabrir abas ao fazer refresh

3. **Indicadores**
   - Mostrar "Usuário está digitando..."
   - Status online/offline

4. **Busca**
   - Buscar conversas anteriores
   - Filtrar por participante

5. **Mídia**
   - Enviar imagens/documentos
   - Visualizar previews

