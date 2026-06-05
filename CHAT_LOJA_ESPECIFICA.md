# 🎯 Chat com Loja Específica - Implementação

## Como Funciona Agora

### Fluxo Completo:

```
1️⃣ Você entra em /stores/abc123
   ↓
2️⃣ Clica no botão "💬 Chat com a Loja"
   ↓
3️⃣ JavaScript dispara evento global:
   window.dispatchEvent(new CustomEvent('openChat', { 
     detail: { storeId: 'abc123' } 
   }))
   ↓
4️⃣ ChatWidget recebe o evento:
   - setCurrentStoreId('abc123')
   - setConversationId(null)
   - setMessages([])
   - setIsOpen(true)
   ↓
5️⃣ Detecta que isOpen=true mas conversationId=null
   - Chama handleOpenChat()
   ↓
6️⃣ handleOpenChat() faz API call:
   POST /api/chat/conversations/pre-purchase
   {
     storeId: 'abc123',
     conversationType: 'user'
   }
   ↓
7️⃣ Backend cria conversa com a loja específica
   ↓
8️⃣ Frontend recebe conversationId: 'conv_xyz'
   ↓
9️⃣ ChatWidget carrega mensagens do histórico
   ↓
🔟 Chat abre e mostra histórico
   ↓
1️⃣1️⃣ Você consegue enviar mensagens
   ↓
1️⃣2️⃣ Loja recebe em tempo real via Socket.io
```

---

## 🔧 Mudanças Implementadas

### 1. Refatorado handleOpenChat para useCallback
```typescript
const handleOpenChat = useCallback(async () => {
  // ... lógica de abrir chat
}, [user, currentStoreId, storeId, conversationId, conversationType]);
```

**Por quê?** Para evitar criar a função toda vez que um state muda, e poder usá-la em useEffect dependency array.

---

### 2. Adicionado useEffect para detectar chat aberto sem conversationId
```typescript
useEffect(() => {
  if (isOpen && !conversationId && !loading && user) {
    console.log('🔄 Chat aberto mas sem conversationId, criando...');
    handleOpenChat();
  }
}, [isOpen, conversationId, loading, user, handleOpenChat]);
```

**O que faz?** Quando o chat é aberto (por clique no botão ou por evento global), mas ainda não tem conversationId, chama a função para criar a conversa.

---

### 3. Melhorado tratamento do storeId
```typescript
const finalStoreId = currentStoreId || storeId || user._id;

const payload = {
  storeId: finalStoreId,
  conversationType: conversationType
};
```

**O que faz?** Garante que sempre tem um storeId válido:
- Primeiro tenta `currentStoreId` (setado pelo evento global)
- Se não, usa `storeId` (prop do componente)
- Se não, usa `user._id` (seu próprio ID)

---

### 4. Evento Global da Loja
```typescript
// Em /stores/[id].tsx
<button onClick={() => {
  if (!user) {
    alert('Por favor, faça login para iniciar um chat');
    return;
  }
  window.dispatchEvent(new CustomEvent('openChat', { 
    detail: { storeId: store._id } 
  }));
}}>
  💬 Chat com a Loja
</button>
```

**O que faz?** Dispara um evento que o ChatWidget escuta, passando o ID da loja.

---

## 📊 Estados do ChatWidget

| Estado | Valor | Significado |
|--------|-------|-------------|
| `isOpen` | true | Chat está visível |
| `conversationId` | 'abc123' | Chat com loja específica |
| `currentStoreId` | 'store_id' | ID da loja a conversar |
| `messages` | [...] | Histórico de mensagens |

---

## 🔄 Cenários de Uso

### Cenário 1: Clique no botão "Chat com a Loja" em /stores/[id]
```
1. dispatchEvent('openChat', { storeId: 'store123' })
2. ChatWidget escuta e seta currentStoreId = 'store123'
3. isOpen = true, conversationId = null
4. useEffect detecta: isOpen && !conversationId
5. Chama handleOpenChat()
6. API cria conversa com store123
7. Chat abre com histórico da loja
```

### Cenário 2: Clique no botão 💬 flutuante (sem storeId)
```
1. handleOpenChatButton() é chamado
2. handleOpenChat() é executada
3. currentStoreId = undefined (não foi setado por evento)
4. Usa fallback: user._id
5. API cria conversa com seu próprio ID
6. Chat abre (seu próprio chat de teste)
```

### Cenário 3: Clica em "Chat com Loja A", depois em "Chat com Loja B"
```
1. Abre Chat com Loja A
   - conversationId = 'conv_A'
   - currentStoreId = 'loja_A'
2. Clica em Chat com Loja B
   - Dispara evento com storeId = 'loja_B'
   - setCurrentStoreId('loja_B')
   - setConversationId(null)  ← LIMPA!
   - setMessages([])           ← LIMPA!
3. useEffect detecta: conversationId = null
4. Chama handleOpenChat()
5. API cria conversa com loja_B
6. Chat muda para Loja B
```

---

## ✅ Checklist de Funcionamento

- [ ] Entrando em /stores/abc123
- [ ] Clicando em "💬 Chat com a Loja"
- [ ] Evento dispara com storeId correto
- [ ] ChatWidget recebe storeId
- [ ] API cria conversa com storeId
- [ ] Chat abre com histórico da loja
- [ ] Consegue digitar e enviar
- [ ] Mensagem aparece para ambos
- [ ] Abrindo outro chat não afeta o primeiro (cada um tem seu histórico)

---

## 🐛 Debugging

### Se o chat não abrir:

1. **Abra DevTools** (F12 → Console)

2. **Clique em "Chat com a Loja"**

3. **Procure por esses logs**:
   ```
   📢 Evento global openChat recebido: { eventStoreId: 'store123', ... }
   🔄 Chat aberto mas sem conversationId, criando...
   🔓 Abrindo chat... { user: 'user123', currentStoreId: 'store123', ... }
   📡 Criando conversa com API...
   📦 Payload: { storeId: 'store123', conversationType: 'user' }
   ✅ Resposta da API: { _id: 'conv123', ... }
   🎯 Nova conversationId: conv123
   ```

4. **Se falhar em algum ponto**, cópia aquele log e me manda!

---

## 🎉 Resumo

Agora o chat:
- ✅ Abre com a loja específica
- ✅ Mostra histórico da loja
- ✅ Permite conversar em tempo real
- ✅ Funciona com Socket.io para mensagens instantâneas
- ✅ Cada loja tem sua conversa independente
