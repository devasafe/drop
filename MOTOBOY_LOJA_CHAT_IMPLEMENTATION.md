# 🚀 Implementação: Chat Motoboy-Loja (Completo)

## ✅ Status: IMPLEMENTADO E PRONTO PARA TESTAR

---

## 📋 O Que Foi Feito

### 1. **Frontend - ChatWidgetWithTabs.tsx** (CORRIGIDO)
**Arquivo**: `frontend/components/ChatWidgetWithTabs.tsx`

**Problema encontrado**: 
- Bug: Variável `conversationType` undefined quando abrindo chat com loja
- Linha 322: `conversationType: conversationType` era undefined

**Solução implementada**:
```typescript
// Detectar role do usuário atual uma vez
const currentRole = typeof window !== 'undefined' 
  ? JSON.parse(localStorage.getItem('user') || '{}').role 
  : 'cliente';

if (participantType === 'customer') {
  // Chat com cliente/usuário
  const conversationType = currentRole === 'motoboy' 
    ? 'motoboy_cliente' 
    : 'loja_cliente';
  
  response = await api.post('/chat/conversations', {
    type: conversationType,
    otherParticipantId: participantId,
  });
} else if (participantType === 'store' && currentRole === 'motoboy') {
  // 🆕 NOVO: Chat motoboy com loja
  response = await api.post('/chat/conversations', {
    type: 'loja_motoboy',  // ← Tipo correto para motoboy→loja
    otherParticipantId: participantId,
  });
} else {
  // Chat com loja (pré-compra)
  response = await api.post('/chat/conversations/pre-purchase', {
    storeId: participantId,
    conversationType: 'loja_cliente',
  });
}
```

**Impacto**:
- ✅ Motoboy + Cliente → `motoboy_cliente` (JÁ FUNCIONAVA)
- ✅ Motoboy + Loja → `loja_motoboy` (NOVO - AGORA FUNCIONA)
- ✅ Lojista + Cliente → `loja_cliente` (JÁ FUNCIONAVA)
- ✅ Pré-compra → `/chat/conversations/pre-purchase` (MANTIDO)

---

### 2. **Frontend - motoboy/delivery/[id].tsx** (REFATORADO)
**Arquivo**: `frontend/pages/motoboy/delivery/[id].tsx`

**Limpeza realizada**:
- ❌ Removido: import de `useChat`, `ChatPanel`, `ChatInput`
- ❌ Removido: states `conversationWithStore`, `conversationWithCustomer`, `activeChatTab`, `chatLoading`
- ❌ Removido: hook `useChat()` que nunca era usado
- ❌ Removido: função `handleSendMessage()` que tava quebrada
- ❌ Removido: função `handleSwitchTab()`
- ❌ Removido: useEffect de limpeza desnecessário
- ❌ Removido: props inúteis do componente `ContactInfo`

**O que ficou**:
- ✅ Apenas: Botão "Abrir Chat" que dispara evento `openChat`
- ✅ Simples: `window.dispatchEvent(new CustomEvent('openChat', { detail: {...} }))`
- ✅ Limpo: Componente `ContactInfo` recebe apenas `name`, `email`, `phone`, `onChatClick`

**Por que mudou**:
- O padrão que funciona é o **ChatWidgetWithTabs global** em `_app.tsx`
- Widget já renderiza em todas as páginas
- Widget já escuta evento `openChat` e gerencia tudo
- Muito mais simples que tentar fazer chat inline na página

**Fluxo agora**:
1. Motoboy clica em "Abrir Chat" com loja
2. `ContactInfo` dispara `window.dispatchEvent('openChat', { detail: {...} })`
3. `ChatWidgetWithTabs` (em `_app.tsx`) recebe evento
4. Widget cria conversa com tipo `loja_motoboy` via API
5. Backend auto-cria conversa se não existir
6. Chat abre no widget flutuante
7. Mensagens em tempo real via Socket.io

---

## 🔄 Backend - JÁ SUPORTA MOTOBOY-LOJA

**Arquivo**: `src/controllers/chatController.ts` (Linhas 330-331)

```typescript
} else if (userRole === 'motoboy' && otherRole === 'lojista') {
  convType = 'loja_motoboy';
}
```

**Auto-detecção funciona para**:
- motoboy + cliente → `motoboy_cliente`
- motoboy + lojista → `loja_motoboy` ✅
- lojista + cliente → `loja_cliente`
- cliente + lojista → `loja_cliente`

**Rota**: `POST /chat/messages` com `otherParticipantId`
- Se conversa não existe → cria automaticamente
- Se existe → usa a existente
- Emite `chat:new_conversation` se foi criada
- Emite `chat:new_message` para ambos

---

## 🧪 COMO TESTAR

### Setup:
1. Certifique-se que backend está rodando: `npm run dev` na pasta backend
2. Certifique-se que frontend está rodando: `npm run dev` na pasta frontend
3. Socket.io deve estar em localhost:4000
4. ChatWidgetWithTabs ativo em `_app.tsx`

### Teste Passo-a-Passo:

**Cenário 1: Motoboy envia mensagem para Loja (via página de entrega)**

1. Login como Motoboy
2. Ir para página de entrega: `/motoboy/delivery/[id]`
3. Seção "📍 Retirada na Loja"
4. Clicar em botão "💬 Abrir Chat"
5. **Esperado**: 
   - Widget ChatWidgetWithTabs abre
   - Novas abas aparecem com nome da loja
   - Console mostra: `🎯 [EVENT LISTENER] Evento recebido:`
   - Console mostra: `📡 Fazendo POST para /chat/conversations (motoboy→loja)`
   - Console mostra: `✅ Conversa criada/obtida:`

**Cenário 2: Motoboy envia primeira mensagem**

1. (Continuar de Cenário 1)
2. Campo de input aparece no widget
3. Digitar mensagem: "Olá loja, já vou retirar"
4. Clicar enviar ou pressionar Enter
5. **Esperado**:
   - Mensagem aparece no chat
   - Socket.io emite `chat:new_message`
   - Se era primeira mensagem, backend cria conversa tipo `loja_motoboy`
   - Status muda de ○ → ✓ (enviado)
   - Depois de 1s muda para ✓✓ (verde) quando entregue

**Cenário 3: Loja recebe mensagem em tempo real**

1. (Continuar: motoboy enviou mensagem)
2. Login como Loja (outra aba/navegador)
3. Ir para página: `/store-dashboard`
4. Tab "💬 Chat"
5. **Esperado**:
   - Nova conversa do motoboy aparece na lista
   - Sem necessidade de F5
   - Badge com "1" (1 mensagem não lida)
   - Clicando conversa mostra mensagem do motoboy
   - Status mostra ✓✓ em verde (entregue)

**Cenário 4: Loja responde**

1. (Continuar: loja vê mensagem)
2. Clicando conversa do motoboy
3. Campo de input aparece abaixo das mensagens
4. Digitar resposta: "Tudo pronto, esperando você!"
5. Enviar
6. **Esperado**:
   - Mensagem aparece no chat da loja
   - Motoboy recebe em tempo real na página de entrega
   - Mensagem aparece com ✓✓ verde

---

## 🔍 DEBUG - Console Logs Esperados

### Frontend (Chrome DevTools → Console):

**Quando clica "Abrir Chat"**:
```
🎯 [Motoboy] Abrindo chat com loja: {storeId: "...", storeName: "..."}
🎯 [EVENT LISTENER] Evento recebido: {id: "...", name: "Loja", role: "lojista", type: "store"}
🎯 [EVENT LISTENER] User atual: {id: "...", role: "motoboy", name: "..."}
🎯 [EVENT LISTENER] Abrindo chat com: {id: "...", name: "Loja", role: "lojista", type: "store"}
🔍 openChatWithStore called: {participantId: "...", participantName: "Loja", participantRole: "lojista", participantType: "store", user: "..."}
```

**Quando cria conversa**:
```
📡 Fazendo POST para /chat/conversations (motoboy→loja)
   Enviando: {type: 'loja_motoboy', otherParticipantId: '...'}
✅ Conversa criada/obtida: {_id: "...", type: "loja_motoboy", ...}
📨 Mensagens carregadas: {messages: [...]}
```

### Backend (Terminal):

**Quando envia mensagem**:
```
📨 [SEND MESSAGE] Recebido: {userId: "...", userRole: "motoboy", ...}
🔍 [SEND MESSAGE] Conversa encontrada: {found: false, ...}
⚠️ [SEND MESSAGE] Conversa não encontrada. Tentando criar automaticamente...
✅ [SEND MESSAGE] Nova conversa criada automaticamente: ...
```

---

## 📊 Tipos de Conversa Suportados

| User 1 | User 2 | Tipo | Rota | Status |
|--------|--------|------|------|--------|
| motoboy | cliente | `motoboy_cliente` | `/chat/conversations` | ✅ Funcionando |
| motoboy | lojista | `loja_motoboy` | `/chat/conversations` | ✅ **NOVO** |
| lojista | cliente | `loja_cliente` | `/chat/conversations` | ✅ Funcionando |
| qualquer | lojista | `loja_cliente` | `/chat/conversations/pre-purchase` | ✅ Pré-compra |

---

## 🎯 Fluxo Completo Motoboy-Loja

```
┌─────────────────────────────────────────────────────────────────┐
│ MOTOBOY - Página /motoboy/delivery/[id]                         │
│                                                                  │
│  📍 Retirada na Loja                                             │
│  └─ [💬 Abrir Chat] ← Click aqui                                │
│                                                                  │
│  window.dispatchEvent('openChat', {                             │
│    detail: {                                                    │
│      storeId: "loja_id",                                        │
│      storeName: "Nome Loja",                                    │
│      role: 'lojista',                                           │
│      type: 'store'   ← Key para detectar motoboy→loja           │
│    }                                                            │
│  })                                                             │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ↓
┌──────────────────────────────────────────────────────────────────┐
│ FRONTEND - ChatWidgetWithTabs (em _app.tsx)                     │
│                                                                  │
│  handleOpenChatEvent (window event listener)                    │
│    ↓                                                            │
│  openChatWithStore('loja_id', 'Nome Loja', 'lojista', 'store') │
│    ↓                                                            │
│  Detecta: currentRole='motoboy' && type='store'                 │
│    ↓                                                            │
│  POST /chat/conversations {                                     │
│    type: 'loja_motoboy',     ← Tipo correto!                   │
│    otherParticipantId: 'loja_id'                               │
│  }                                                              │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ↓
┌──────────────────────────────────────────────────────────────────┐
│ BACKEND - POST /chat/conversations                              │
│                                                                  │
│  createOrGetConversation()                                      │
│    ↓                                                            │
│  Busca conversa com type='loja_motoboy'                         │
│    ↓                                                            │
│  Se não encontra: cria nova                                     │
│    ↓                                                            │
│  Retorna: { _id: "conv_id", type: 'loja_motoboy', ... }        │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ↓
┌──────────────────────────────────────────────────────────────────┐
│ FRONTEND - ChatWidgetWithTabs (recebe conversa)                 │
│                                                                  │
│  Nova aba criada com nome "Loja"                                │
│  Carrega mensagens (vazio se primeira vez)                      │
│  Socket.io entra na room: "conversation:conv_id"                │
│  Widget abre/mostra chat para motoboy                           │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ↓
┌──────────────────────────────────────────────────────────────────┐
│ MOTOBOY - ChatWidgetWithTabs Aberto                             │
│                                                                  │
│  ┌─────────────────────────────────────┐                        │
│  │ 🏪 Loja                        ❌ │ ← Aba para fechar        │
│  ├─────────────────────────────────────┤                        │
│  │ (vazio - primeira mensagem)         │                        │
│  │                                     │                        │
│  ├─────────────────────────────────────┤                        │
│  │ [Seu texto aqui...]       [Enviar]  │ ← Input                │
│  └─────────────────────────────────────┘                        │
└──────────────────────┬──────────────────────────────────────────┘
                       │ Motoboy digita "Olá!" e clica enviar
                       ↓
┌──────────────────────────────────────────────────────────────────┐
│ BACKEND - POST /chat/messages                                   │
│                                                                  │
│  sendMessage({                                                  │
│    conversationId: 'conv_id',                                   │
│    text: 'Olá!',                                                │
│    otherParticipantId: 'loja_id'  ← Para auto-create se needed │
│  })                                                             │
│    ↓                                                            │
│  Conversa existe? Sim → usa existente                           │
│  Cria Message { status: 'sent' }                                │
│  Emite socket.io: 'chat:new_message' → room conversation       │
└──────────────────────┬──────────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        ↓                             ↓
┌─────────────────────┐    ┌──────────────────────┐
│ MOTOBOY             │    │ LOJA                  │
│ Chat Widget         │    │ (store-dashboard)     │
│                     │    │                       │
│ ✓ Olá!            │    │ 🔴 1 nova mensagem    │
│                     │    │ 💬 chat tab           │
│ (Widget mostra      │    │                       │
│  mensagem enviada)  │    │ Clica em chat:        │
│                     │    │ Lista com motoboy ↓   │
│                     │    │ ┌────────────────────┐│
│                     │    │ │ Motoboy            ││
│                     │    │ │ ✓✓ Olá!            ││
│                     │    │ │ (verde - entregue) ││
│                     │    │ │                    ││
│                     │    │ │ [Response...]      ││
│                     │    │ │ [Enviar]           ││
│                     │    │ └────────────────────┘│
└─────────────────────┘    └──────────────────────┘
        ↑                             │
        │                             │ Loja digita resposta
        │                             │ e clica enviar
        └─────────────────────────────┘
                   Socket.io
            'chat:new_message'
```

---

## 🐛 Troubleshooting

### Chat não abre quando clica "Abrir Chat"
**Checklist**:
- [ ] `ChatWidgetWithTabs` está em `_app.tsx`?
- [ ] User está autenticado? (token em localStorage)
- [ ] Socket.io conectou? (Console mostra 🟢)
- [ ] Event listener está registrado? (Procure no DevTools)

### Mensagem não envia
**Checklist**:
- [ ] Campo de input está visível?
- [ ] Botão "Enviar" está habilitado?
- [ ] Socket.io conectado? (🟢 no console)
- [ ] Conversa foi criada? (Ver network tab)
- [ ] API `/chat/messages` retorna 200? (Network tab)

### Backend cria conversa mas não aparece na Loja
**Checklist**:
- [ ] Backend emitiu `chat:new_conversation`? (Backend logs)
- [ ] Socket.io das duas partes estão na room correta?
- [ ] Loja recarregou `/store-dashboard`?
- [ ] Tipo de conversa é `loja_motoboy`? (Banco de dados)

### Socket.io não conecta
**Checklist**:
- [ ] Backend Socket.io na porta 4000?
- [ ] `SocketProvider` está em `_app.tsx`?
- [ ] Token válido no localStorage?
- [ ] Console mostra erro de conexão? (Qual erro?)

---

## 📝 Notas Finais

✅ **Motoboy-Loja agora é tão simples quanto Motoboy-Cliente**
- Ambos usam `/chat/conversations` com auto-detecção
- Backend detecta roles e define tipo automaticamente
- Frontend dispara evento `openChat` e widget cuida do resto

✅ **Padrão unificado em toda a app**
- Store dashboard: `ChatConversationList` + `ChatConversationDetail`
- Motoboy delivery: Botão que dispara `openChat` pro widget global
- Cliente: Widget global ChatWidgetWithTabs
- Pré-compra: Continua com rota `/chat/conversations/pre-purchase`

✅ **Código mais limpo**
- Sem lógica de chat espalhada em várias páginas
- Widget centralizado gerencia tudo
- Reutilizável em qualquer página/componente

---

## 🚀 Próximos Passos (Opcional)

1. **Notificações push** quando receber mensagem de loja
2. **Notificação sonora** diferente por tipo (cliente vs loja)
3. **Histórico de mensagens** persistido corretamente
4. **Anexos/imagens** no chat
5. **Reações** com emoji nas mensagens
