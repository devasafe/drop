# 🔍 DEBUG: Motoboy-Loja Chat Não Abre

## 🎯 Problema
Quando clica em "💬 Abrir Chat" na seção de loja, o widget não abre a conversa.

## 🧪 Passo-a-Passo Debug

### 1. Abra DevTools
- Pressione **F12**
- Vá para **Console**
- Procure por qualquer mensagem vermelha ❌

### 2. Limpe o console
```javascript
console.clear()
```

### 3. Clique em "Abrir Chat" (Loja)
Você deve ver IMEDIATAMENTE estes logs:

```
🎯 [ContactInfo-Loja] Abrindo chat com loja: {storeId: "...", ...}
🎯 [ContactInfo-Loja] store._id: ...
🎯 [ContactInfo-Loja] store.name: ...
```

**Se NÃO vir esses logs**: O `onChatClick` não está sendo executado!
- Verifique se o botão está sendo clicado
- Verifique se há erro ao clicar

---

### 4. Se viu os logs acima, continue...
Procure por:

```
📡 [ChatWidgetWithTabs] Registrando listener de evento openChat...
✅ [ChatWidgetWithTabs] Listener registrado com sucesso
```

**Se NÃO vir esses logs**: O widget não foi renderizado!
- [ ] ChatWidgetWithTabs está em `_app.tsx`?
- [ ] É um token válido? (localStorage tem 'token'?)
- [ ] Página não é `/chat`?

---

### 5. Se viu os logs acima, procure por:

```
🎯 [EVENT LISTENER] Evento recebido: {id: "...", ...}
🎯 [EVENT LISTENER] User atual: {id: "...", ...}
```

**Se NÃO vir**: O listener não recebeu o evento!
- Refaz os passos 2-4
- Procure por erro no console

**Se VIR mas nada acontece**: Pode ser que `user` está `null`

---

## 🎯 Checklist

| Item | Status | O quê procurar |
|------|--------|----------------|
| Evento disparado? | ✅/❌ | `🎯 [ContactInfo-Loja]` logs |
| Listener registrado? | ✅/❌ | `✅ [ChatWidgetWithTabs] Listener registrado` |
| Evento recebido? | ✅/❌ | `🎯 [EVENT LISTENER] Evento recebido` |
| User carregado? | ✅/❌ | `🎯 [EVENT LISTENER] User atual: {...}` |
| Chat abriu? | ✅/❌ | Widget visível em baixo à direita |

---

## 🔧 Se Event NÃO foi disparado

**Possível causa**: Botão não está funcionando

**Ação**:
1. Procure por ContactInfo no console (F12 → Elements)
2. Procure pelo botão "Abrir Chat"
3. Clique manualmente nele no inspector
4. Ver se console tem logs

---

## 🔧 Se Event foi disparado MAS listener não recebeu

**Possível causa**: Listener não foi registrado

**Ação**:
1. Procure na aba Network (F12 → Network)
2. Veja se tem erro ao carregar `ChatWidgetWithTabs`
3. Procure por erro de imports

---

## 🔧 Se Listener recebeu MAS user é null

**Possível causa**: User não está carregado

**Ação**:
1. Verificar localStorage: `localStorage.getItem('user')`
2. Se vazio, fazer login novamente
3. Após login, clicar "Abrir Chat" novamente

---

## 📝 Output Esperado Completo

Se tudo funciona, você verá:

```javascript
// Click no botão
🎯 [ContactInfo-Loja] Abrindo chat com loja: {storeId: "123...", storeName: "Loja do João", role: "lojista", type: "store"}
🎯 [ContactInfo-Loja] store._id: 123...
🎯 [ContactInfo-Loja] store.name: Loja do João

// Listener recebe
🎯 [EVENT LISTENER] Evento recebido: {id: "123...", name: "Loja do João", role: "lojista", type: "store", eventDetail: {...}}
🎯 [EVENT LISTENER] User atual: {id: "456...", name: "João da Moto", role: "motoboy"}
🎯 [EVENT LISTENER] Mode: customer
🎯 [EVENT LISTENER] isOpen: false
🎯 [EVENT LISTENER] isMinimized: false
✅ [EVENT LISTENER] User carregado, abrindo chat com: {id: "123...", name: "Loja do João", role: "lojista", type: "store"}

// Abre chat
🔍 openChatWithStore called: {participantId: "123...", participantName: "Loja do João", participantRole: "lojista", participantType: "store", user: "456..."}
📡 Fazendo POST para /chat/conversations (motoboy→loja)
   Enviando: {type: 'loja_motoboy', otherParticipantId: '123...'}
✅ Conversa criada/obtida: {_id: "conv789...", type: 'loja_motoboy', ...}
📨 Mensagens carregadas: {messages: [...]}

// Widget visível!
```

---

## 💡 Dicas

1. **Copie o output completo** e compartilhe se não entender
2. **Limpe cache**: F12 → Application → Clear Site Data
3. **Recarregue**: F5 e tente novamente
4. **Tente no Chrome**: Às vezes browser afeta

---

## 📞 Próximo Passo

Após fazer esse debug:
1. Compartilhe qual step falhou
2. Copie o console output (Ctrl+C no console)
3. Vamos resolver!

---

**Vamos debugar!** 🚀
