# Chat Widget - Integração Corrigida 🎯

## Problema Anterior ❌
- Botão "Chat com a Loja" abria um **modal local/diferente**
- Existiam **dois chats diferentes** no site:
  - Chat Widget flutuante (global em todas as páginas)
  - Modal separado (apenas na página da loja)
- Experiência confusa para o usuário

## Solução Implementada ✅
- **Um único chat** em todo o site
- Botão da página de loja agora **abre o mesmo ChatWidget flutuante**
- Mantém consistência visual e funcional
- Melhor UX ao minimizar/fechar

---

## Como Funciona Agora

### 1. Clica em "💬 Chat com a Loja" (na página stores/[id].tsx)

```typescript
// Button onClick na página da loja
onClick={() => {
  if (!user) {
    alert('Por favor, faça login para iniciar um chat');
    return;
  }
  // Dispara evento global para abrir o ChatWidget
  window.dispatchEvent(new CustomEvent('openChat', { detail: { storeId: store._id } }));
}}
```

### 2. ChatWidget Escuta o Evento

```typescript
// Em ChatWidget.tsx useEffect
useEffect(() => {
  const handleOpenChatEvent = (event: any) => {
    const { storeId: eventStoreId } = event.detail;
    setCurrentStoreId(eventStoreId);  // ← Muda para a loja clicada
    setConversationId(null);          // ← Reseta para buscar nova conversa
    setMessages([]);                   // ← Limpa histórico anterior
    setIsOpen(true);                   // ← Abre o widget
    setIsMinimized(false);            // ← Garante que não fica minimizado
  };

  window.addEventListener('openChat', handleOpenChatEvent);
  return () => window.removeEventListener('openChat', handleOpenChatEvent);
}, []);
```

### 3. Widget Abre com o StoreId da Loja

```typescript
// handleOpenChat agora usa currentStoreId (vem do evento)
const res = await api.post(`/chat/conversations/pre-purchase`, {
  storeId: currentStoreId || user._id,  // ← Vem do evento
  conversationType: conversationType
});
```

---

## Fluxo Completo

```
┌─────────────────────────────────────────────────────────────┐
│  PÁGINA DA LOJA (stores/[id].tsx)                           │
│                                                             │
│  [💬 Chat com a Loja] ← Botão novo comportamento           │
│      ↓                                                      │
│      dispatchEvent('openChat', { storeId: 'ABC123' })     │
│      ↓                                                      │
├─────────────────────────────────────────────────────────────┤
│  CHAT WIDGET FLUTUANTE (_app.tsx + ChatWidget.tsx)         │
│                                                             │
│  addEventListener('openChat', handleEvent) ← Escuta        │
│      ↓                                                      │
│      setCurrentStoreId('ABC123')                          │
│      setIsOpen(true)                                       │
│      setIsMinimized(false)                                 │
│      ↓                                                      │
│      handleOpenChat() ← Abre chat com a loja               │
│      ↓                                                      │
│  ┌────────────────────────┐                                │
│  │ 💬 Chat com Loja XYZ   │  ← Agora mostra a loja correta│
│  │ Responderemos em breve │                                │
│  ├────────────────────────┤                                │
│  │ Histórico de mensagens │                                │
│  │                        │                                │
│  ├────────────────────────┤                                │
│  │ Sua mensagem... │ ✓    │                                │
│  └────────────────────────┘                                │
└─────────────────────────────────────────────────────────────┘
```

---

## Estados do Widget

### Quando Fechado (Padrão)
```
Canto inferior direito:
┌────┐
│ 💬 │  ← Botão flutuante (60x60px)
└────┘
 [3]   ← Badge com mensagens não lidas
```

### Quando Clica em "Chat com a Loja"
```
┌─────────────────────────┐
│ 💬 Chat com Loja A      │  ← Widget abre
│ Responderemos em breve  │
├─────────────────────────┤
│ Mensagens...            │
├─────────────────────────┤
│ Digite aqui... │ ✓      │
└─────────────────────────┘
```

### Pode Minimizar
```
┌─────────────────────────┐
│ 💬 Chat com Loja A  [▲] │  ← Clica ▲ para minimizar
│ Responderemos em breve  │
└─────────────────────────┘
```

### Ou Fechar Completamente
```
Volta ao botão flutuante no canto
```

---

## Props do ChatWidget

```typescript
interface ChatWidgetProps {
  storeId?: string;                    // ID da loja (inicial)
  conversationType?: 'user' | 'product'; // Tipo de conversa
  mode?: 'customer' | 'seller';        // Modo do widget
}
```

**Importante**: O `storeId` pode ser **atualizado dinamicamente** via evento `openChat`!

---

## Eventos Globais

### Disparando Abertura do Chat

```typescript
// De qualquer lugar do site:
window.dispatchEvent(new CustomEvent('openChat', {
  detail: { storeId: 'ID_DA_LOJA' }
}));
```

### Aonde Usar?

1. **Página de loja** (stores/[id].tsx) ✅
2. **Página de produto** (products/[id].tsx) - Futura integração
3. **Lista de lojas** (stores/index.tsx) - Futura integração
4. **Chat do lojista** (dashboard/chat) - Já funciona com props

---

## Estado Dinâmico do Widget

### Novo State Adicionado

```typescript
const [currentStoreId, setCurrentStoreId] = useState<string | undefined>(storeId);
```

**Comportamento**:
- Inicia com `storeId` dos props
- Muda quando evento `openChat` é disparado
- Reseta conversa quando muda de loja
- Carreguem novo histórico da loja

---

## Exemplo: Navegação Entre Lojas

### Usuário em Loja A
```
1. Clica em "💬 Chat com a Loja A"
2. Widget abre mostrando mensagens da Loja A
3. Conversa com Loja A...
```

### Navega para Loja B
```
4. Clica em "💬 Chat com a Loja B"
5. Event dispara com storeId de B
6. Widget:
   - Muda currentStoreId para B
   - Reseta conversationId (null)
   - Limpa messages []
   - Carrega novo histórico da Loja B
7. Conversa com Loja B... (histórico limpinho)
```

### Volta para Loja A
```
8. Clica em "💬 Chat com a Loja A" novamente
9. Event dispara com storeId de A
10. Widget abre chat com Loja A (busca histórico novamente)
```

---

## Arquivos Modificados

### ✅ frontend/pages/stores/[id].tsx

**Removido**:
- States de modal: `showChatModal`, `chatMessages`, `chatMessage`, `chatLoading`
- Função: `handleOpenChat()` (era async, agora é event dispatch)
- JSX: Modal de chat inteiro (~150 linhas)

**Adicionado**:
- Botão com `onClick` que dispara `openChat` event

**Resultado**: -150 linhas de código desnecessário

### ✅ frontend/components/ChatWidget.tsx

**Adicionado**:
- State: `currentStoreId` (pode ser atualizado dinamicamente)
- useEffect: Event listener para `openChat`
- Lógica: Reseta conversação ao trocar de loja

**Modificado**:
- `handleOpenChat()`: Agora usa `currentStoreId` em vez de `storeId` prop

**Resultado**: Mais inteligente, dinâmico, reutilizável

---

## Benefícios da Integração

✅ **Consistência Visual** - Um único chat em todo o site
✅ **Melhor UX** - Usuário não precisa aprender 2 interfaces
✅ **Menos Código** - Removidas ~150 linhas de modal duplicado
✅ **Dinâmico** - Pode trocar de loja sem recarregar página
✅ **Escalável** - Fácil adicionar botão em outras páginas
✅ **Performance** - Menos componentes no DOM
✅ **Mantível** - Uma única implementação de chat

---

## Testes Recomendados

- [ ] Clica em "Chat com a Loja" na página da loja
- [ ] Widget abre corretamente
- [ ] Mostra nome da loja no header
- [ ] Carrega histórico de mensagens
- [ ] Pode minimizar e maximizar
- [ ] Pode fechar
- [ ] Navega para outra loja
- [ ] Clica em "Chat com a Loja" novamente
- [ ] Widget carrega histórico da NOVA loja (não a anterior)
- [ ] Badge de mensagens não lidas atualiza
- [ ] Mobile responsivo (100% width)
- [ ] Desktop (max 380px)

---

## Próximas Melhorias

🔄 **Socket.io Real-time** - Auto-refresh de mensagens
🔔 **Notificações** - Som/badge para novas mensagens
⌨️ **Typing Indicators** - "Loja está digitando..."
✅ **Read Receipts** - Marcar como lido
🔍 **Search** - Buscar em histórico de chats
📱 **Avatar** - Mostrar foto da loja
🖼️ **Imagens** - Suporte para envio de imagens

---

## Conclusão

O chat agora é **unificado, dinâmico e intuitivo**! 🎉

Usuário clica em qualquer botão de chat → **Mesmo widget abre** → Conversa com a loja/pessoa certa.

Simples, elegante e funciona em todo o site!
