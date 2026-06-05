# 🔍 Debug: Chat Abre Mas Não Cria Conversa

## Problema
```
✅ Clica em 💬
✅ Chat abre
❌ Mas mostra "Inicie uma conversa"
❌ conversationId fica null
❌ Não consegue enviar mensagem
```

## Como Debugar

### Passo 1: Abrir DevTools
```
F12 → Console
```

### Passo 2: Clique em 💬
Procure por esses logs:

**ESPERADO - Logs de Sucesso:**
```
🔄 Chat aberto mas sem conversationId, criando...
📊 Estados: {
  isOpen: true,
  conversationId: null,
  loading: false,
  user: "user_id_aqui",
  currentStoreId: undefined,
  storeId: undefined
}
📦 Payload: {
  storeId: "user_id_aqui",  ← Deveria ter um ID
  conversationType: "user"
}
🔍 Debug - finalStoreId: "user_id_aqui" conversationType: "user"
📡 Enviando POST para /api/chat/conversations/pre-purchase...
✅ Resposta da API completa: {
  data: {
    _id: "conv_123abc...",  ← ID da conversa
    participants: [...],
    ...
  }
}
✅ Resposta data: {
  _id: "conv_123abc...",
  participants: [...],
  ...
}
🎯 Nova conversationId: conv_123abc...
📨 Mensagens carregadas: []
```

## Se Houver Erro

### Cenário 1: "Resposta não tem _id!"
```
❌ Resposta não tem _id! {
  data: {},
  fullRes: {...}
}
```

**Causa**: API retornou sucesso (200) mas sem _id
**Solução**: Ver logs do backend

---

### Cenário 2: Erro 404
```
❌ Erro ao abrir chat: {
  message: "...",
  status: 404,
  data: "Not Found"
}
```

**Causa**: Endpoint `/api/chat/conversations/pre-purchase` não existe
**Solução**: Verificar se `src/app.ts` tem:
```typescript
import chatRoutes from './routes/chat';
app.use('/api/chat', chatRoutes);
```

---

### Cenário 3: Erro 401
```
❌ Erro ao abrir chat: {
  message: "...",
  status: 401,
  data: "Unauthorized"
}
```

**Causa**: Token expirado ou não enviado
**Solução**: 
1. Fazer logout e login de novo
2. Ou: `localStorage.clear(); window.location.reload();`

---

### Cenário 4: Erro 500
```
❌ Erro ao abrir chat: {
  message: "...",
  status: 500,
  data: "Internal Server Error"
}
```

**Causa**: Erro no backend
**Solução**: Ver logs do terminal `npm start`

---

## Checklist de Funcionamento

1. **Logs aparecem quando clica?**
   - [ ] Sim → Ir para próxima
   - [ ] Não → Verificar se o botão está conectado corretamente

2. **Qual é o `storeId` no payload?**
   - [ ] Um ID válido (letras/números)
   - [ ] "undefined" → Problema! Deveria ter fallback
   - [ ] Vazio → Problema!

3. **API retorna 200?**
   - [ ] Sim → Próxima
   - [ ] Não → Qual status? (404, 401, 500?)

4. **Response tem `_id`?**
   - [ ] Sim → Conversa foi criada! ✅
   - [ ] Não → Problema na API

5. **conversationId foi setado?**
   - [ ] Sim → Chat deveria abrir! ✅
   - [ ] Não → Há um erro após a API

---

## Commands para Testar

### Testar API manualmente (no console)
```javascript
// Ver token
localStorage.getItem('token')

// Ver user
localStorage.getItem('user')

// Fazer requisição manual
fetch('http://localhost:3000/api/chat/conversations/pre-purchase', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  },
  body: JSON.stringify({
    storeId: localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user'))._id : 'test',
    conversationType: 'user'
  })
}).then(r => r.json()).then(console.log)
```

---

## Próximos Passos

1. **Abra DevTools** (F12)
2. **Clique em 💬**
3. **Copie os logs**
4. **Me mande o log completo**

Com o log, consigo descobrir exatamente onde está o problema!

---

## Exemplo de Log Completo para Enviar

```
🔄 Chat aberto mas sem conversationId, criando...
📊 Estados: { isOpen: true, conversationId: null, loading: false, user: "abc123", currentStoreId: undefined, storeId: undefined }
📦 Payload: { storeId: "abc123", conversationType: "user" }
🔍 Debug - finalStoreId: "abc123" conversationType: "user"
📡 Enviando POST para /api/chat/conversations/pre-purchase...
❌ Erro ao abrir chat: {
  message: "Network Error",
  status: undefined,
  data: undefined,
  fullError: { ... }
}
```

**Copie tudo isso para melhor debug!** 👆
