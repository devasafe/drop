# 🧪 GUIA DE TESTE: Motoboy-Loja Chat

## ⚡ Setup Rápido

### Backend
```bash
cd d:\PROJETOS\Drop
npm run dev
```
- Roda em `localhost:3000`
- Socket.io em `localhost:4000`

### Frontend
```bash
cd d:\PROJETOS\Drop\frontend
npm run dev
```
- Roda em `localhost:3001` (ou próxima porta livre)

---

## 🎯 Cenário 1: Motoboy Abre Chat com Loja

### Pré-requisitos
- [ ] Backend rodando
- [ ] Frontend rodando
- [ ] Você tem 2 contas: 1 Motoboy + 1 Loja

### Passos

**ABA 1 - MOTOBOY:**

1. Abrir DevTools (F12) → Console
2. Login como **Motoboy**
3. Ir para `/motoboy` (dashboard)
4. Clique em qualquer entrega ativa
5. Scroll para **"📍 Retirada na Loja"**
6. Clique no botão **"💬 Abrir Chat"**

**Esperado**:
```
✅ Widget ChatWidgetWithTabs abre (canto inferior direito)
✅ Nova aba com nome da loja
✅ Campo de input visível
✅ Console mostra:
   🎯 [Motoboy] Abrindo chat com loja:
   🎯 [EVENT LISTENER] Evento recebido:
   📡 Fazendo POST para /chat/conversations (motoboy→loja)
   ✅ Conversa criada/obtida:
```

**Se não abrir**: Procure no console por erros vermelhos ❌

---

## 🎯 Cenário 2: Motoboy Envia Primeira Mensagem

**ABA 1 - MOTOBOY (continuação):**

7. Campo de input está visível?
   - Se **não**: Clique novamente no botão "Abrir Chat"
   - Se **sim**: Continue

8. Digitar mensagem:
   ```
   Olá loja! Estou no caminho para retirar o pedido.
   ```

9. Clique em **"Enviar"** ou pressione **Enter**

**Esperado**:
```
✅ Mensagem aparece no chat acima do input
✅ Status muda: ○ → ✓ (enviado) → ✓✓ (entregue, verde)
✅ Console mostra:
   📨 Enviando mensagem...
   ✅ Mensagem enviada com status: sent
```

**Se falhar**: Procure por erro 500 na aba **Network** (F12 → Network)

---

## 🎯 Cenário 3: Loja Recebe Mensagem em Tempo Real

**ABA 2 - LOJA:**

1. **ABRA NOVA ABA** do navegador
2. Ir para `localhost:3001` (mesmo frontend)
3. **Login como Loja**
4. Clique no avatar/menu → **"Dashboard da Loja"** ou ir para `/store-dashboard`
5. Na seção de abas, procure por **"💬 Chat"**

**Esperado**:
```
✅ LISTA DE CONVERSAS mostra:
   • Motoboy (com badge "1" = 1 mensagem não lida)
   
✅ Clique em "Motoboy"
✅ DETALHE DA CONVERSA mostra:
   ○ Olá loja! Estou no caminho... (com ✓✓ verde)
   
✅ Console mostra:
   🔔 Nova mensagem recebida
   💬 [Chat] Mensagem carregada
```

**Se não aparecer**: 
- [ ] Recarregue a página (F5)
- [ ] Loja está autenticada?
- [ ] Socket.io conectou? (Procure 🟢 no console)

---

## 🎯 Cenário 4: Loja Responde

**ABA 2 - LOJA (continuação):**

6. Campo **"[Seu texto aqui]"** está visível?
   - Se **sim**: Continue
   - Se **não**: Clique na conversa do motoboy

7. Digitar resposta:
   ```
   Tudo certo! Aguardando você.
   ```

8. Clique em **"Enviar"** ou pressione **Enter**

**Esperado**:
```
✅ Mensagem aparece no chat
✅ Status: ✓✓ (verde, entregue)
✅ Console mostra:
   ✅ Mensagem enviada com status: sent
```

---

## 🎯 Cenário 5: Motoboy Recebe em Tempo Real

**ABA 1 - MOTOBOY (volta pra aba original):**

**Esperado**:
```
✅ WIDGET já mostra a resposta da loja:
   Tudo certo! Aguardando você. (com ✓✓ verde)
   
✅ SEM NECESSIDADE DE F5!
✅ Console mostra:
   💬 Nova mensagem recebida: "Tudo certo..."
```

**Se não aparecer**:
- [ ] Recarregue a página (F5)
- [ ] Socket.io conectou?
- [ ] Conversa está na room correta?

---

## 🎯 Cenário 6: Segunda Mensagem (Rápido)

**ABA 1 - MOTOBOY:**

9. Digitar nova mensagem:
   ```
   Chegando em 5 minutos!
   ```

10. Enviar

**ABA 2 - LOJA (sem recarregar):**

**Esperado**:
```
✅ Mensagem aparece AUTOMATICAMENTE
✅ SEM F5
✅ Sem delay (tempo real)
```

---

## 📊 Resultado do Teste

Se todos os 6 cenários funcionaram:

```
┌─────────────────────────────────────────┐
│ ✅ MOTOBOY-LOJA CHAT FUNCIONANDO!      │
│                                         │
│ ✓ Abertura de chat                      │
│ ✓ Primeira mensagem                     │
│ ✓ Recebimento em tempo real             │
│ ✓ Resposta automática                   │
│ ✓ Conversas persistidas                 │
│ ✓ Sem necessidade de refresh            │
│                                         │
│ 🎉 Implementação completa!             │
└─────────────────────────────────────────┘
```

---

## 🐛 Troubleshooting

### Widget não abre ao clicar "Abrir Chat"

**Checklist**:
```
1. Autenticado?
   - Procure por "user" em localStorage (F12 → Application → Storage)
   
2. Socket.io conectado?
   - Console deve mostrar algo como:
     Socket connected: xyz123abc...
     
3. Event disparado?
   - Console não mostra nenhum log?
   - Adicionar: console.log('CLICOU');
   
4. ChatWidgetWithTabs renderizado?
   - Procure por div com role="dialog" na página
   - Ou procure no DevTools por "ChatWidgetWithTabs"
```

### Mensagem não envia

**Checklist**:
```
1. Campo de input visível?
   - Se não, clique novamente no botão de chat
   
2. Botão "Enviar" habilitado?
   - Se disabled (cinza), socket não conectou
   
3. API error?
   - F12 → Network → Procure por POST /chat/messages
   - Status deve ser 200 ou 201
   - Se 400/500, ver resposta de erro
   
4. Conversa criada?
   - Backend mostra: "✅ Nova conversa criada automaticamente"?
   - Se não, envio da primeira mensagem não criou?
```

### Loja não vê mensagem

**Checklist**:
```
1. Loja recarregou a página?
   - F5 em /store-dashboard → Chat
   - Nova conversa deve aparecer
   
2. Conversa tipo correto?
   - Backend mostra: type: 'loja_motoboy'?
   - Se for 'loja_cliente', algo deu errado
   
3. Socket.io ambos conectados?
   - Motoboy: socket.io/1/?... (motoboy user)
   - Loja: socket.io/1/?... (loja user)
   - Devem ser users diferentes!
   
4. Room Socket.io correto?
   - Motoboy deve estar em: conversation:xxx
   - Loja deve estar em: conversation:xxx
   - MESMO ID!
```

### Mensagem envia mas volta como não entregue

**Checklist**:
```
1. Status fica em ○?
   - API não respondeu com sucesso
   - Ver Network tab → Response
   
2. Status fica em ✓ cinza?
   - Backend não emitiu 'chat:message_delivered'
   - Socket.io não propagou o evento
   
3. Não fica verde (✓✓)?
   - Não foi marcado como read
   - Espere 1-2 segundos
   - Ou abra o chat no outro lado pra marcar como read
```

---

## 📝 Logs Esperados

### Frontend Console (Motoboy)

```javascript
🎯 [Motoboy] Abrindo chat com loja: {storeId: "123...", storeName: "Loja do João"}
🎯 [EVENT LISTENER] Evento recebido: {id: "123...", name: "Loja do João", role: "lojista", type: "store"}
🎯 [EVENT LISTENER] User atual: {id: "456...", role: "motoboy", name: "João da Moto"}
🎯 [EVENT LISTENER] Abrindo chat com: {id: "123...", name: "Loja do João", role: "lojista", type: "store"}
🔍 openChatWithStore called: {...}
📡 Fazendo POST para /chat/conversations (motoboy→loja)
   Enviando: {type: 'loja_motoboy', otherParticipantId: '123...'}
✅ Conversa criada/obtida: {_id: "conv789...", type: 'loja_motoboy', ...}
📨 Mensagens carregadas: {messages: []}
📨 Enviando mensagem: "Olá loja!..."
✅ Mensagem enviada com status: sent
```

### Frontend Console (Loja)

```javascript
🔔 Nova mensagem recebida: {from: "João da Moto", text: "Olá loja!..."}
💬 [Chat] Mensagem carregada
✅ Conversa do motoboy adicionada à lista: "João da Moto"
📨 Enviando mensagem: "Tudo certo!..."
✅ Mensagem enviada com status: sent
```

### Backend Logs

```
📨 [SEND MESSAGE] Recebido: {userId: "moto456", userRole: "motoboy", conversationId: null}
⚠️ [SEND MESSAGE] Conversa não encontrada. Tentando criar automaticamente...
✅ [SEND MESSAGE] Nova conversa criada automaticamente: conv789...
✅ Chat emitted: new_message → conversation:conv789
✅ Chat emitted: new_conversation → user:loja123

[Segunda mensagem]
📨 [SEND MESSAGE] Recebido: {userId: "loja123", userRole: "lojista", conversationId: "conv789"}
✅ Mensagem salva
✅ Chat emitted: new_message → conversation:conv789
```

---

## 🎓 Dicas Úteis

1. **Abrir DevTools em abas diferentes**:
   - Aba 1 (Motoboy): F12
   - Aba 2 (Loja): F12 (em outra aba)
   - Comparar logs em tempo real

2. **Limpar localStorage se tiver bugs**:
   - F12 → Application → Local Storage → clear all
   - Fazer login novamente

3. **Testar Socket.io**:
   - F12 → Network → WS (WebSocket)
   - Procure por `socket.io?transport=websocket`
   - Deve estar conectado (status 101)

4. **Ver banco de dados**:
   - MongoDB Compass ou similar
   - Coleção "conversations"
   - Procure por type: "loja_motoboy"
   - Verifique participants

---

## ✅ Conclusão

Se os 6 cenários acima funcionarem, a implementação está **100% correta** e pronta para usar em produção!

Qualquer problema? Consulte a seção **Troubleshooting** acima.

**Bom teste!** 🚀
