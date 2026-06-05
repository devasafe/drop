# 🔍 ESTUDO COMPLETO DO FLUXO DE CHECKOUT

## Resumo Executivo

Seu sistema tem **5 etapas principais** que envolvem Cliente → Loja → Motoboy → Cliente novamente. Cada etapa tem eventos de WebSocket para atualizar tudo em tempo real.

---

## 📊 OS 5 PASSOS DO FLUXO

```
CLIENTE cria pedido → LOJA aceita → MOTOBOY busca → MOTOBOY entrega → CLIENTE avalia
   (criado)           (pago)        (assigned)       (picked→delivered)  (entregue)
```

---

## 🔴 ETAPA 1: CLIENTE CRIA O PEDIDO

### O que o cliente faz:
- Entra na loja virtual
- Adiciona produtos ao carrinho
- Faz checkout → escolhe endereço de entrega
- Confirma pagamento
- Clica em "Finalizar Pedido"

### Backend faz (createOrder):
```
POST /orders
├─ Salva Order com status 'criado'
├─ Decrementa estoque dos produtos
├─ Calcula taxa de entrega (R$7 + R$1/km)
├─ Calcula totalValue
└─ Emite:
   ├─ Socket: 'order:created' (para LOJA via room `store:{storeId}`)
   ├─ Socket: 'new_order' (notificação visual para LOJA)
   └─ Socket: 'order:created' (para CLIENTE via room `user:{customerId}`)
```

### Status no Frontend:
- Cliente vê: "⏳ Aguardando loja confirmar seu pedido..."
- Loja recebe notificação + novo pedido aparece na lista
- Order.status = 'criado'
- Delivery ainda NÃO existe

---

## 🟡 ETAPA 2: LOJA ACEITA O PEDIDO

### O que o lojista faz:
- Vê a notificação "novo pedido"
- Abre a página de gerenciamento de pedidos
- Clica em "Aceitar Pedido" (validação de distância)
- Informa distância até cliente (ou API calcula)

### Backend faz (acceptOrder):
```
POST /orders/{orderId}/accept
├─ Valida autorização (só store owner)
├─ Cria nova DELIVERY com status 'pending'
│  ├─ Gera PIN de retirada (5 dígitos aleatório) → delivery.pinRetirada
│  ├─ Gera PIN de entrega (5 dígitos) → delivery.pin
│  ├─ Calcula fee = R$7 + R$1 * distance
│  └─ Status = 'pending' (esperando motoboy)
│
├─ Atualiza Order:
│  ├─ Cria referência deliveryId
│  └─ (⚠️ NÃO muda status da Order para 'pago' no banco!)
│
└─ Emite VÁRIOS eventos de socket:
   ├─ Event 1: 'order:accepted_by_store' → room `user:{customerId}`
   │  └─ Dados: {orderId, deliveryId, status: 'pago', message}
   │
   ├─ Event 2: 'order:accepted_confirmation' → room `store:{storeId}`
   │  └─ Confirma ao lojista que foi processado
   │
   ├─ Event 3: 'delivery:created' → broadcast para TODOS os motoboys
   │  └─ Notifica que há nova entrega disponível
   │
   └─ Event 4: 'delivery:available' → room 'motoboys'
      └─ Via notifyMotoboys() - notificação push/mobile
```

### Status no Frontend:
- **Cliente recebe 'order:accepted_by_store'**:
  - setOrder({ status: 'pago', deliveryId })
  - refetchDelivery() atualiza dados
  - Vê: "⏱️ Aguardando um motoboy aceitar a entrega..."
  - PIN não aparece ainda (delivery.status = 'pending')
  
- **Loja recebe 'order:accepted_confirmation'**:
  - Pedido some da lista de pendentes
  - Aparece em "Pedidos em Andamento"
  
- **Motoboys recebem 'delivery:created'**:
  - Notificação: "Nova entrega disponível - R$X de taxa"
  - Aparece na lista de entregas disponíveis

- **IMPORTANTE**: Order.status no BANCO ainda é 'criado' na visão da Order (confuso!)
  - Mas a Delivery foi criada com status 'pending'
  - O frontend usa Order + Delivery para montar o status real

---

## 🟢 ETAPA 3: MOTOBOY ACEITA A ENTREGA

### O que o motoboy faz:
- Vê a notificação "Nova entrega"
- Abre o app de entregas
- Na lista de "Entregas Disponíveis", clica em "Aceitar Entrega"

### Backend faz (claimDelivery):
```
POST /deliveries/{deliveryId}/claim
├─ Valida que motoboy está autenticado
├─ ATOMIC UPDATE:
│  ├─ Verifica se Delivery.status = 'pending'
│  ├─ Verifica se motoboyId é nulo/não existe
│  └─ Atualiza atomicamente:
│     ├─ motoboyId = {motoboy ID}
│     ├─ status = 'assigned'
│     └─ pin = gera novo PIN de 5 dígitos (PIN para CLIENTE confirmar entrega)
│
├─ (Garante que SÓ UMA pessoa consegue claim - first-come-wins)
│
└─ Emite eventos:
   ├─ Socket: 'delivery:status_changed' → broadcast
   └─ Socket: 'order_update' → room `store:{storeId}` (com tipo 'motoboy_assigned')
```

### O que NÃO acontece aqui:
- ❌ Frontend do cliente não é notificado diretamente
- ❌ PIN do cliente não aparece ainda
- ❌ Cliente continua vendo "Aguardando motoboy..." até frontend refetch

### Status no Frontend:
- **Cliente** (manual refetch ou polling):
  - refetchDelivery()
  - Vê delivery.status = 'assigned'
  - Vê: "🚗 Motoboy a caminho para buscar seu pedido na loja!"
  - PIN ainda NÃO aparece (só mostra se status = 'assigned' OR 'picked')
  - Espera... segundo o código:
    ```jsx
    {delivery && delivery.pin && (delivery.status === 'assigned' || delivery.status === 'picked') && (
      // mostra PIN
    )}
    ```
  - Então O PIN DEVERIA APARECER neste ponto!
  - PIN vem de claimDelivery() que gera um novo
  
- **Loja**:
  - Recebe 'delivery:status_changed' ou 'order_update'
  - Vê que motoboy foi atribuído
  - Aparecem informações do motoboy na página de pedido

- **Motoboy**:
  - Entrega aparece em "Minhas Entregas" com status 'assigned'
  - Vê: "🏍️ Siga para o endereço da loja"
  - Precisa validar PIN de RETIRADA (pinRetirada) com a loja

---

## 🔵 ETAPA 4: MOTOBOY RETIRA O PEDIDO NA LOJA

### O que acontece na loja:
1. Motoboy chega na loja
2. Pede para o lojista o pedido
3. Lojista pergunta: "Qual é o PIN de retirada?"
4. Motoboy fala o PIN que recebeu
5. Lojista digita na interface "Validar PIN"

### Backend faz (validarPinRetirada):
```
POST /deliveries/{deliveryId}/validate-pin
├─ Lojista informa: pinRetirada
├─ Backend valida:
│  ├─ Delivery.pinRetirada deve corresponder
│  ├─ Delivery.status deve ser 'assigned'
│  └─ Só loja pode fazer isso
│
├─ Se válido:
│  ├─ Atualiza Delivery.status = 'picked'
│  └─ Entrega está saindo do estoque da loja
│
└─ Emite eventos:
   ├─ Socket: 'delivery:picked' → room `user:{customerId}`
   │  └─ Dados: {orderId, deliveryId, status, message, pickedAt}
   │
   ├─ Socket: 'order:picked_up' → room `store:{storeId}`
   │  └─ Confirma que foi retirada
   │
   ├─ Socket: 'delivery:pin_validated' → room `user:{motoboyId}`
   │  └─ Confirma ao motoboy que PIN foi validado
   │
   └─ Socket: 'delivery:status_changed' → broadcast
```

### Status no Frontend:
- **Cliente recebe 'delivery:picked'**:
  - refetchDelivery()
  - delivery.status = 'picked'
  - Vê: "📦 Motoboy retirou seu pedido! Em trânsito para seu endereço..."
  - PIN continua visível (status = 'picked' está na condição)
  - Aparece ETA: "20-30 minutos"

- **Loja**:
  - Recebe confirmação que pedido saiu
  - Pedido some do status "Aguardando Retirada"

- **Motoboy**:
  - Recebe 'delivery:pin_validated'
  - Status muda para: "✅ Pedido retirado - Siga para o endereço de entrega"
  - Pronto para entregar (começa navegação GPS)

---

## 🟣 ETAPA 5: MOTOBOY ENTREGA AO CLIENTE

### O que o motoboy faz:
1. Chega no endereço do cliente
2. Clica em "Completar Entrega" no app
3. Infirma o PIN de ENTREGA

### Backend faz (finalizarEntrega):
```
POST /deliveries/{deliveryId}/finalize
├─ Motoboy informa: pin (PIN para cliente confirmar)
├─ Backend valida:
│  ├─ Delivery.pin deve corresponder
│  ├─ Delivery.status deve ser 'picked' (em trânsito)
│  └─ Só o motoboy atribuído pode fazer
│
├─ Se válido:
│  ├─ Atualiza Delivery.status = 'delivered'
│  ├─ Atualiza Order.status = 'entregue'
│  └─ Registra pontos de gamificação para motoboy
│
└─ Emite eventos:
   ├─ Socket: 'delivery:completed' → broadcast
   ├─ Socket: 'delivery:status_changed' → broadcast
   └─ Pode emitir também via 'delivery:completed' direto para cliente
```

### Status no Frontend:
- **Cliente recebe 'delivery:completed'**:
  - refetchDelivery()
  - delivery.status = 'delivered'
  - Vê: "✅ Seu pedido foi entregue! 🎉"
  - PIN desaparece (não mostra mais)
  - Aparece seção "Avaliar Motoboy"
  - Aparece seção "Avaliar Loja"

- **Motoboy**:
  - Entrega some de "Minhas Entregas"
  - Aparece em "Histórico de Entregas"
  - Pode ver nota/comentário do cliente depois de avaliado

---

## 📱 WEBSOCKET - ESTRUTURA DE SALAS (ROOMS)

```
notifier.io (servidor Socket.io)
├─ room: `user:{userId}`
│  ├─ Recebe: Clientes e Motoboys (individualmente)
│  ├─ Eventos:
│  │  ├─ order:accepted_by_store (cliente)
│  │  ├─ delivery:picked (cliente)
│  │  ├─ delivery:completed (cliente)
│  │  ├─ delivery:assigned_to_you (motoboy)
│  │  ├─ delivery:pin_validated (motoboy)
│  │  └─ motoboy:assigned (cliente - pq foi atribuído)
│  │
│  └─ Enviados por: acceptOrder, validarPinRetirada, finalizarEntrega, etc
│
├─ room: `store:{storeId}`
│  ├─ Recebe: Lojista (store owner)
│  ├─ Eventos:
│  │  ├─ new_order (novo pedido criado)
│  │  ├─ order:created (mesmo acima, para consistency)
│  │  ├─ order:accepted_confirmation (seu próprio pedido foi aceito)
│  │  ├─ order_update (com tipo 'motoboy_assigned')
│  │  ├─ motoboy:assigned_to_order (motoboy foi atribuído)
│  │  └─ order:picked_up (motoboy retirou)
│  │
│  └─ Enviados por: createOrder, acceptOrder, claimDelivery, validarPinRetirada
│
├─ room: `motoboys`
│  ├─ Recebe: TODOS os motoboys (broadcast)
│  ├─ Eventos:
│  │  ├─ delivery:created (nova entrega disponível)
│  │  ├─ delivery:available (mesma coisa, para ativar notificação)
│  │  ├─ delivery:status_changed (qualquer entrega mudou status)
│  │  └─ Usado por notifyMotoboys() para push notifications
│  │
│  └─ Enviados por: acceptOrder, emitDeliveryCreated, etc
│
└─ broadcast (para TODOS sem sala específica)
   ├─ order:created
   ├─ order:updated
   ├─ order:status_changed
   ├─ delivery:created
   ├─ delivery:updated
   ├─ delivery:status_changed
   └─ (Raramente usado, mais para logging)
```

---

## 🔌 FRONTEND - SOCKET LISTENERS (store-order/[id].tsx)

Na página de status do pedido do CLIENTE, há 4 listeners:

```typescript
useEffect(() => {
  // 1️⃣ LOJA ACEITOU
  on('order:accepted_by_store', (data) => {
    if (data.orderId !== id) return; // filtro por ordem
    setOrder(prev => ({
      ...prev,
      status: 'pago',
      deliveryId: data.deliveryId
    }));
    refetchDelivery(data.deliveryId); // busca delivery no banco
  });
  
  // 2️⃣ MOTOBOY ACEITOU
  on('motoboy:assigned', (data) => {
    if (data.orderId !== id) return;
    refetchDelivery(order?.deliveryId || data.deliveryId);
  });
  
  // 3️⃣ MOTOBOY RETIROU
  on('delivery:picked', (data) => {
    if (data.orderId !== id) return;
    refetchDelivery(order?.deliveryId || data.deliveryId);
    // PIN deve aparecer aqui (delivery.status = 'picked')
  });
  
  // 4️⃣ ENTREGA COMPLETADA
  on('delivery:completed', (data) => {
    if (data.deliveryId !== order?.deliveryId) return;
    refetchDelivery(order?.deliveryId);
  });
  
  return () => {
    off('order:accepted_by_store', handleOrderAccepted);
    off('motoboy:assigned', handleMotoboyAssigned);
    off('delivery:picked', handleDeliveryPicked);
    off('delivery:completed', handleDeliveryCompleted);
  };
}, [id, order?.deliveryId, on, off, setOrder, order]);
```

### refetchDelivery():
```typescript
const refetchDelivery = async (deliveryId: string) => {
  try {
    const res = await api.get(`/deliveries/${deliveryId}`);
    setDelivery(res.data); // atualiza estado com dados frescos do banco
  } catch (err) {
    console.error(`Erro ao buscar delivery:`, err);
  }
};
```

---

## 🎨 STATUS DISPLAY NO FRONTEND

O frontend mostra status em 2 formas:

### 1️⃣ Antes de Delivery existir (Order.status):
```
order.status === 'criado'  → "⏳ Aguardando loja confirmar..."
order.status === 'pago'    → "💳 Pagamento confirmado! Aguardando loja..."
```

### 2️⃣ Depois de Delivery existir (Delivery.status):
```
delivery.status === 'pending'    → "⏱️ Aguardando motoboy..."
delivery.status === 'assigned'   → "🚗 Motoboy a caminho para loja"
delivery.status === 'picked'     → "📦 Motoboy retirou! Em trânsito"
delivery.status === 'delivered'  → "✅ Seu pedido foi entregue! 🎉"
delivery.status === 'cancelled'  → "❌ Entrega foi cancelada"
```

---

## 🔐 PINS - CONFUSÃO IMPORTANTE!

Tem 2 PINs diferentes:

### PIN 1: delivery.pinRetirada (5 dígitos)
- **Gerado em**: acceptOrder() quando loja cria a delivery
- **Guardado em**: Delivery.pinRetirada
- **Usado por**: Loja para validar que é realmente o motoboy
- **Quando**: Motoboy chega na loja com o pedido
- **Fluxo**: Motoboy diz o PIN → Loja digita → valida → validarPinRetirada()
- **Resultado**: Delivery muda de 'assigned' para 'picked'
- **Confidencialidade**: 🔒 NUNCA deve ir para frontend do cliente (é secreto!)

### PIN 2: delivery.pin (5 dígitos)
- **Gerado em**: claimDelivery() quando motoboy aceita entrega
- **Guardado em**: Delivery.pin
- **Usado por**: Cliente para confirmar que é mesmo o motoboy
- **Quando**: Motoboy chega na casa do cliente (ou antes, se enviar SMS)
- **Fluxo**: Motoboy diz PIN → Cliente confirma → finalizarEntrega()
- **Resultado**: Delivery muda de 'picked' para 'delivered'
- **Confidencialidade**: 🔓 Pode ir para frontend (o cliente precisa!)

### Visualização no Frontend:
```
Delivery.pin e (status = 'assigned' OR status = 'picked') → MOSTRA PIN
```

Então o cliente vê o PIN a partir do momento que motoboy aceita a entrega.

---

## ⚠️ PROBLEMAS IDENTIFICADOS NO CÓDIGO

### Problema 1: Listener Registration
- `on()` no SocketContext **não retorna handler wrapper** para depois desregistrar
- `off()` tenta desregistrar, mas pode não funcionar corretamente
- **Impacto**: Listeners podem duplicar se componente re-render

### Problema 2: Event Broadcasting
- `acceptOrder()` emite para 4 salas diferentes:
  - `user:customerId` (cliente) → 'order:accepted_by_store' ✅
  - `store:storeId` (loja) → 'order:accepted_confirmation' ✅
  - `motoboys` (todos) → 'delivery:created' ✅
- Frontend cliente **deveria** receber e atualizar
- Se não receber = cliente vê travado até F5

### Problema 3: Disponibilidade do delivery.pin
- Cliente só vê PIN se `delivery.pin` existe E `status = 'assigned'`
- PIN é gerado em `claimDelivery()` quando motoboy aceita
- **Fluxo correto**:
  1. Loja aceita (delivery criado, status='pending', pin=null)
  2. Motoboy aceita (status='assigned', pin=gerado)
  3. Cliente vê PIN agora
  4. Loja valida (status='picked')
  5. Motoboy entrega (status='delivered')

---

## 📋 CHECKLIST DE ATUALIZAÇÃO EM TEMPO REAL

Para o checkout REALMENTE ser sem F5, precisa:

### ✅ CLIENTE recebendo:
- [ ] 'order:accepted_by_store' quando loja clica aceitar
  - Liga o listener? Sim (store-order/[id].tsx)
  - Refetch delivery? Sim
  - Mostra novo status? Sim
  
- [ ] 'motoboy:assigned' quando motoboy aceita
  - Liga o listener? Sim
  - Refetch delivery? Sim
  - Mostra novo status? Sim
  - PIN aparece? Sim (se delivery.pin gerado)
  
- [ ] 'delivery:picked' quando loja valida PIN
  - Liga o listener? Sim
  - Refetch delivery? Sim
  - Mostra novo status? Sim
  
- [ ] 'delivery:completed' quando motoboy confirma entrega
  - Liga o listener? Sim
  - Refetch delivery? Sim
  - Mostra novo status? Sim

### ✅ LOJA recebendo:
- [ ] 'new_order' quando cliente cria pedido
- [ ] 'order:accepted_confirmation' quando confirma aceitação
- [ ] 'motoboy:assigned_to_order' quando motoboy é atribuído
- [ ] 'order:picked_up' quando motoboy retira

### ✅ MOTOBOY recebendo:
- [ ] 'delivery:created' quando loja cria (nova entrega disponível)
- [ ] 'delivery:assigned_to_you' quando é atribuído
- [ ] 'delivery:pin_validated' quando loja valida PIN

---

## 🔍 INVESTIGAÇÃO: POR QUE PODE NÃO ESTAR FUNCIONANDO

### Cenário 1: Cliente não vê atualização quando loja aceita
```
Causa provável:
  1. Socket listener não registrado
  2. Socket não conectado quando listener quer registrar
  3. Backend não emitindo para room correto
  4. Frontend escuta errado ou callback não atualiza estado
```

### Cenário 2: PIN não aparece automaticamente
```
Causa provável:
  1. Delivery.pin não gerado em claimDelivery()
  2. Listener 'motoboy:assigned' não está disparando
  3. refetchDelivery() está falhando
  4. Frontend condicional incorreto (delivery.status não é 'assigned')
```

### Cenário 3: Loja não vê motoboy atribuído
```
Causa provável:
  1. 'motoboy:assigned_to_order' não sendo emitido
  2. Loja página não tem listener para este evento
  3. Loja é outra página que não está ouvindo socket
```

---

## 📝 ARQUITETURA REAL DO SISTEMA

```
┌─────────────────┐
│   CLIENTE       │
│  store-order    │ ← tem 4 listeners
│   [id].tsx      │
└────────┬────────┘
         │ Socket: `user:{customerId}`
         │
┌────────▼──────────────────────────────┐
│   Socket.io Server                     │
│   (notifier.ts)                        │
├────────────────────────────────────────┤
│ Rooms:                                 │
│  - user:xxx (clientes + motoboys)      │
│  - store:xxx (lojistas)                │
│  - motoboys (broadcast para todos)     │
│  - broadcast (global)                  │
└────────────────────────────────────────┘
         ▲
         │
    ┌────┴──────────────────────────────┐
    │                                    │
┌───┴────────┐                  ┌──────┴─────┐
│ Backend    │                  │ Backend     │
│ Controllers│◄────────────────►│ Controllers │
│            │                  │             │
│ POST /     │                  │ POST /      │
│ orders     │                  │ deliveries  │
│ (create)   │                  │ /{id}/claim │
│            │                  │             │
│ POST /     │                  │ POST /      │
│ orders/{id}│                  │ deliveries  │
│ /accept    │                  │ /{id}/      │
│            │                  │ validate-pin│
│            │                  │             │
│ 4 emits    │                  │ 2 emits     │
└────────────┘                  └─────────────┘
```

---

## 🎯 RESUMO PARA O DEV

### O que funciona ✅:
1. Pedido é criado e loja recebe notificação
2. Loja clica aceitar e delivery é criada
3. Motoboy vê na lista e pode aceitar
4. Validação de PIN de retirada funciona
5. Entrega é marcada como concluída

### O que pode estar quebrado 🔴:
1. Socket listeners podem não estar sendo chamados
2. Cliente não vê atualização em tempo real (sem F5)
3. PIN pode não aparecer ou aparecer no momento errado
4. Loja não recebe notificações de atualização

### Próximos passos de debug:
1. Abrir DevTools do navegador → Console
2. Procurar por logs de `[Socket]` 
3. Verificar se listeners estão registrando
4. Verificar se eventos estão sendo recebidos
5. Fazer teste end-to-end com 2 browsers abertos
6. Verificar network tab para eventos WebSocket

