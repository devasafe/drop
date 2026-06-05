# 💬 Chat Widget - Minimização e Notificações

## O que foi implementado:

### 1️⃣ Botão de Minimização (em vez de Fechar)
- ✅ Botão X agora **minimiza** o widget (em vez de fechar)
- ✅ As conversas **persistem** quando você reabrir
- ✅ Muda de `setIsOpen(false)` para `setIsMinimized(true)`

**Visual do botão:** − (menos) em vez de ✕ (X)

### 2️⃣ Badge de Notificação
- ✅ Aparece um **badge vermelho** no botão do chat quando há mensagens não lidas
- ✅ Mostra o **número total** de não lidas (ex: 5)
- ✅ Se for > 99, mostra "99+"
- ✅ **Desaparece** quando todas as mensagens são lidas

**Cálculo:** `totalUnread = sum(conversations.unreadCount)`

### 3️⃣ Mensagens não lidas quando minimizado
- ✅ Quando chat está **minimizado**, mensagens NÃO são marcadas como lidas automaticamente
- ✅ Apenas marca como lida quando:
  - Widget está **aberto** (`isOpen === true`)
  - Widget está **expandido** (`isMinimized === false`)
  - Uma aba está **ativa** (`activeTabId`)
  - Há mensagens para ler

### 4️⃣ Nova Rota no Backend
```
PUT /api/chat/conversations/:conversationId/mark-as-read
Body: { messageIds: [...] }
```

## Fluxo Completo:

```
Motoboy envia mensagem
    ↓
Chat está minimizado
    ↓
Mensagem chega com Badge: 💬 com "1" em vermelho
    ↓
Clica em 💬
    ↓
Widget abre com a aba da conversa
    ↓
Mensagens são marcadas como lidas (GET /mark-as-read)
    ↓
Badge desaparece
    ↓
Clica em − (minimizar)
    ↓
Widget fecha mas conversas continuam
    ↓
Próxima mensagem aparece novamente com badge
```

## Mudanças de Código:

### Frontend (`ChatWidgetWithTabs.tsx`):

1. **Novo estado para rastrear total de não-lidas:**
```typescript
const totalUnread = conversations.reduce((sum, conv) => sum + (conv.unreadCount || 0), 0);
```

2. **Botão minimizar (em vez de fechar):**
```typescript
onClick={() => {
  setIsMinimized(true);  // ← Apenas minimiza
}}
title="Minimizar"
>
  −  {/* Símbolo de menos */}
</button>
```

3. **Badge de notificação:**
```tsx
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
  }}>
    {totalUnread > 99 ? '99+' : totalUnread}
  </div>
)}
```

4. **useEffect para marcar como lido (apenas quando visível):**
```typescript
useEffect(() => {
  if (!activeTabId || !isOpen || isMinimized || !user) return;

  const unreadMessageIds = activeTab.messages
    .filter((msg) => msg.senderId !== user.id)
    .map((msg) => msg._id)
    .filter(Boolean);

  if (unreadMessageIds.length > 0) {
    api.put(`/chat/conversations/${activeTabId}/mark-as-read`, {
      messageIds: unreadMessageIds,
    });

    setConversations((prev) =>
      prev.map((conv) =>
        conv._id === activeTabId
          ? { ...conv, unreadCount: 0 }
          : conv
      )
    );
  }
}, [activeTabId, isOpen, isMinimized, user, tabs]);
```

### Backend (`src/routes/chat.ts`):

Nova rota adicionada:
```typescript
router.put('/conversations/:conversationId/mark-as-read', chatController.markAsRead);
```

## Como Testar:

1. Abra 2 navegadores (Cliente + Motoboy)
2. Crie uma conversa
3. Abra em um lado
4. **Motoboy minimiza o chat** (clica em −)
5. **Cliente envia mensagem**
6. **Motoboy vê badge com "1"** no botão 💬
7. **Motoboy clica em 💬** → widget abre
8. **Badge desaparece** (mensagem marcada como lida)
9. **Motoboy minimiza novamente** → conversa persiste

## Status:

✅ **Tudo implementado e compilado!**
✅ Frontend rodando em `http://localhost:3000`
✅ Backend rodando em `http://localhost:4000`

### Arquivos Modificados:
- ✅ `frontend/components/ChatWidgetWithTabs.tsx` (Estados + Listeners + UI)
- ✅ `src/routes/chat.ts` (Nova rota PUT)

### Funcionalidades Ativas:
- ✅ Indicador de digitação ("Digitando...")
- ✅ Status de mensagens (✓ enviada, ✓✓ entregue/lida)
- ✅ Minimização do widget
- ✅ Badge de notificação de não-lidas
- ✅ Persistência de conversas abertas
- ✅ Marcação de lido apenas quando visível

**Pronto para produção!** 🚀
