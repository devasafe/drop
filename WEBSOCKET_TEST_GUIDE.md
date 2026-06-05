# 🧪 GUIA DE TESTE - WEBSOCKET CHECKOUT

## Pré-requisitos

1. ✅ Backend compilado: `npm run build`
2. ✅ Frontend compilado
3. ✅ MongoDB rodando
4. ✅ 2+ abas do navegador (para simular múltiplos usuários)

---

## TESTE 1: Criar Pedido (Workflow 1)

### Setup:
```bash
# Terminal 1 - Backend
cd d:\PROJETOS\Drop
npm run build
npm run dev

# Terminal 2 - Frontend  
cd d:\PROJETOS\Drop\frontend
npm run dev
```

### Passos:
1. Abra `http://localhost:3000` como **CLIENTE**
2. Abra `http://localhost:3000/seller/dashboard` como **LOJISTA** (outra aba)
3. **CLIENTE**: Crie um novo pedido
   - Selecione uma loja
   - Selecione produtos
   - Clique em "Fazer Pedido"

### ✅ Esperado:
- ✨ **LOJISTA** recebe notificação em tempo real: "🔔 Novo pedido"
- ✨ Pedido aparece na dashboard da loja SEM recarregar
- ✨ **CLIENTE** vê confirmação do pedido
- 📊 Console do browser mostra evento `new_order`

### 🐛 Debug:
```javascript
// No console do navegador da LOJISTA:
socket.on('new_order', (data) => {
  console.log('📦 Novo pedido recebido:', data);
});
```

---

## TESTE 2: Loja Aceita Pedido (Workflow 2)

### Pré-requisito:
- Pedido criado (Teste 1 completo)

### Passos:
1. **LOJISTA**: Clique em "Aceitar Pedido" no pedido pendente
2. Observe a dashboard atualizando

### ✅ Esperado:
- ✨ **CLIENTE** recebe notificação: "⏳ Aguardando motoboy"
- ✨ **LOJISTA** vê status mudado para "Aguardando motoboy"
- ✨ Motoboys em `http://localhost:3000/motoboy` veem entrega disponível
- 📊 Console mostra `order:accepted_by_store` e `delivery:available`

### 🐛 Debug - Verificar emissão para cliente:
```javascript
// No console do CLIENTE:
socket.on('order:accepted_by_store', (data) => {
  console.log('✅ Loja aceitou! Dados:', data);
});

// Verificar emissão para motoboys:
socket.on('delivery:available', (data) => {
  console.log('🏍️ Nova entrega disponível:', data);
});
```

---

## TESTE 3: Motoboy Aceita Entrega (Workflow 3)

### Pré-requisito:
- Loja aceitou o pedido (Teste 2 completo)

### Setup Extra:
3. Abra `http://localhost:3000/motoboy` como **MOTOBOY** (terceira aba)

### Passos:
1. **MOTOBOY**: Veja lista de entregas disponíveis
2. **MOTOBOY**: Clique em "Aceitar Entrega"
3. Observe 3 abas simultaneamente

### ✅ Esperado:
- ✨ **CLIENTE** vê: "🏍️ João está a caminho para a loja!"
- ✨ **LOJISTA** vê: "Motoboy: João" ao lado do pedido
- ✨ **MOTOBOY** vê: "Você foi atribuído a uma entrega"
- 📊 Pedido desaparece da lista de "Disponíveis" no motoboy
- 📊 Console mostra `motoboy:assigned` em múltiplas salas

### 🐛 Debug - Verificar notificações triplas:
```javascript
// CLIENTE:
socket.on('motoboy:assigned', (data) => {
  console.log('🏍️ Motoboy atribuído:', data);
});

// LOJISTA:
socket.on('motoboy:assigned_to_order', (data) => {
  console.log('✅ Loja notificada sobre motoboy:', data);
});

// MOTOBOY:
socket.on('delivery:assigned_to_you', (data) => {
  console.log('📍 Você foi atribuído a:', data);
});
```

---

## TESTE 4: Verificar Socket Rooms

### No servidor:
```typescript
// Adicionar log no src/services/notifier.ts
io.on('connection', (socket) => {
  console.log(`✅ Cliente ${socket.id} conectado`);
  console.log(`Salas: ${socket.rooms.size}`);
  
  // Log de emissões
  const originalEmit = socket.emit;
  socket.emit = function(...args) {
    console.log(`📤 Emitindo ${args[0]} para ${socket.id}`);
    return originalEmit.apply(socket, args);
  };
});
```

### Esperado no console do servidor:
```
✅ LOJISTA conectou
  └─ Entrou em sala: store:65abc123
✅ CLIENTE conectou
  └─ Entrou em sala: user:65def456
✅ MOTOBOY conectou
  └─ Entrou em sala: user:65ghi789
  └─ Entrou em sala: motoboys

📤 Emitindo new_order para store:65abc123
📤 Emitindo order:created para user:65def456
📤 Emitindo delivery:available para motoboys
📤 Emitindo motoboy:assigned para user:65def456
📤 Emitindo motoboy:assigned_to_order para store:65abc123
📤 Emitindo delivery:assigned_to_you para user:65ghi789
```

---

## TESTE 5: Network Throttling (Teste de Latência)

### No DevTools do navegador:
1. F12 → Network tab
2. Throttle: "Slow 3G"
3. Repita Teste 1

### ✅ Esperado:
- Interface ainda responde
- Socket events chegam (podem demora)
- Sem crashes ou timeout

---

## TESTE 6: Desconexão e Reconexão

### Passo 1:
1. **CLIENTE**: Desconecte WiFi/Ethernet
2. Aguarde 5 segundos
3. **CLIENTE**: Reconecte à rede

### ✅ Esperado:
- Interface mostra "Reconectando..."
- Eventos não perdidos
- Socket reconecta automaticamente
- Status sincronizado

### No console:
```javascript
socket.on('reconnect', () => {
  console.log('✅ Reconectado ao servidor');
});

socket.on('disconnect', (reason) => {
  console.log('❌ Desconectado:', reason);
});
```

---

## Checklist de Teste Completo

### Funcionalidade:
- [ ] Pedido criado → Notificação na loja
- [ ] Loja aceita → Cliente notificado
- [ ] Motoboy aceita → Ambos notificados
- [ ] Status sincronizado sem F5
- [ ] Múltiplas abas recebem eventos

### Performance:
- [ ] Sem lag perceptível
- [ ] Eventos entregues < 100ms
- [ ] Suporta 3+ usuários simultâneos

### Robustez:
- [ ] Reconecta automaticamente
- [ ] Sem memory leaks
- [ ] Console sem erros de socket

### UX:
- [ ] Notificações visuais claras
- [ ] Emojis mostram status
- [ ] Mensagens em português

---

## 🔍 Troubleshooting

### Problema: Eventos não chegando
```bash
# 1. Verificar se socket está conectado
# No console do cliente:
console.log(socket.connected); // deve ser true

# 2. Verificar salas
console.log(socket.rooms); // deve ter store:xxx ou user:xxx

# 3. Verificar logs do servidor
npm run dev  # deve mostrar conexões
```

### Problema: Loja não vê novo pedido
```
✅ Verificar:
- Lojista está logado?
- Lojista entrou na sala store:{storeId}?
- Pedido tem storeId correto?
- Socket.io rodando na porta 4000?
```

### Problema: Motoboy vê entrega mas não consegue aceitar
```
✅ Verificar:
- Motoboy tem role='motoboy'?
- Entrega tem deliveryId válido?
- Store existe?
```

---

## 📊 Métricas para Monitorar

```javascript
// Performance do Socket
setInterval(() => {
  const latency = socket.io.engine.transport.pollDuration;
  const connected = socket.connected ? '✅' : '❌';
  console.log(`Status: ${connected}, Latência: ${latency}ms`);
}, 5000);
```

---

## 📝 Relatório de Teste

Após completar todos os testes, documentar:

```markdown
# Relatório de Teste - WebSocket Checkout

## Data: __/__/____
## Testador: _______________

### Resultados:
- [ ] Teste 1 (Criar Pedido): PASSOU / FALHOU
- [ ] Teste 2 (Aceitar): PASSOU / FALHOU  
- [ ] Teste 3 (Motoboy): PASSOU / FALHOU
- [ ] Teste 4 (Rooms): PASSOU / FALHOU
- [ ] Teste 5 (Latência): PASSOU / FALHOU
- [ ] Teste 6 (Reconexão): PASSOU / FALHOU

### Bugs encontrados:
1. _______________
2. _______________

### Performance:
- Latência média: _____ ms
- Pico de memória: _____ MB
- Erros de console: _____ 

### Observações:
_____________________________
```

---

**Status: READY FOR TESTING** ✅
