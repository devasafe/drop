# 🚀 FLUXO COMPLETO DE WEBSOCKET - CHECKOUT

## 📋 Estrutura de Salas (Rooms)

```
store:{storeId}        → Lojista (recebe pedidos, gerencia entregas)
user:{userId}          → Cliente/Motoboy (recebe notificações pessoais)
motoboys               → Todos os motoboys (veem entregas disponíveis)
delivery:{deliveryId}  → Acompanhamento de entrega específica
```

---

## 🔄 FLUXO 1: CLIENTE CRIA PEDIDO

### ① Cliente clica em "Fazer Pedido"
```
Frontend (Cliente)
└─ POST /api/orders
   └─ body: { storeId, products, paymentMethod }
```

### ② Backend: createOrder() executa
```typescript
// src/controllers/orderController.ts
export const createOrder = async (req, res) => {
  // 1️⃣ Validar produtos
  // 2️⃣ Descontar estoque
  // 3️⃣ Criar pedido com status='created'
  // 4️⃣ Processar pagamento se paymentMethod fornecido
  
  // 🔔 WEBSOCKET: Notificar LOJISTA
  emitToRoom(
    `store:${order.storeId}`,
    'new_order',
    { orderId: order._id, customerName, total: order.totalValue }
  );
  
  // 🔔 WEBSOCKET: Notificar CLIENTE
  emitToRoom(
    `user:${order.customerId}`,
    'order:created',
    { orderId: order._id, status: 'created', totalValue }
  );
};
```

### ③ Frontend (Cliente) recebe confirmação
```typescript
// frontend/lib/socket.ts
socket.on('order:created', (data) => {
  console.log('Seu pedido foi criado!', data);
  // Redirecionar para página de rastreamento
  router.push(`/order/${data.orderId}`);
});
```

### ④ Frontend (Loja) recebe novo pedido
```typescript
// frontend/pages/store-dashboard.tsx
socket.on('new_order', async (data) => {
  const order = await api.get(`/orders/${data.orderId}`);
  
  // ✨ Adiciona à lista "Pedidos em Andamento"
  setOrders(prev => [order, ...prev]);
  
  // 🔔 Mostra notificação visual + som
  showNotification('Novo pedido!');
});
```

---

## ✅ FLUXO 2: LOJISTA ACEITA PEDIDO

### ① Lojista clica "Aceitar Pedido"
```
Frontend (Loja)
└─ POST /api/orders/{orderId}/accept
   └─ body: { distance }
```

### ② Backend: acceptOrder() executa
```typescript
// src/controllers/cancellationController.ts
export const acceptOrderByStore = async (req, res) => {
  // 1️⃣ Validar que é da loja
  // 2️⃣ Mudar status para 'pago'
  // 3️⃣ CRIAR delivery com status='pending'
  
  const delivery = new Delivery({
    orderId: order._id,
    status: 'pending',
    fee: calculateFee(distance)
  });
  await delivery.save();
  
  // 🔔 WEBSOCKET: Notificar CLIENTE que loja aceitou
  emitToRoom(
    `user:${order.customerId}`,
    'order:accepted_by_store',
    {
      orderId: order._id,
      deliveryFee: delivery.fee,
      estimatedTime: '30-45 minutos'
    }
  );
  
  // 🔔 WEBSOCKET: Notificar MOTOBOYS que tem entrega disponível
  emitToRoom(
    'motoboys',
    'delivery:available',
    {
      deliveryId: delivery._id,
      orderId: order._id,
      distance: delivery.distance,
      fee: delivery.fee,
      pickupAddress: store.address,
      destination: customer.address
    }
  );
  
  // 🔔 WEBSOCKET: Atualizar status para LOJA (feedback imediato)
  emitToRoom(
    `store:${order.storeId}`,
    'order:accepted',
    { orderId: order._id, deliveryId: delivery._id }
  );
};
```

### ③ Frontend (Cliente) vê status atualizar
```typescript
// frontend/pages/order/{orderId}.tsx
socket.on('order:accepted_by_store', (data) => {
  setOrder(prev => ({
    ...prev,
    status: 'waiting_motoboy',
    delivery: data
  }));
  
  showStatus('⏳ Aguardando motoboy aceitar...');
});
```

### ④ Frontend (Loja) mostra feedback imediato
```typescript
// frontend/pages/store-dashboard.tsx
socket.on('order:accepted', (data) => {
  setOrders(prev => 
    prev.map(o => 
      o._id === data.orderId 
        ? { ...o, delivery: { _id: data.deliveryId } }
        : o
    )
  );
  
  // Botão "Aceitar" desaparece, mostra "Aguardando motoboy"
});
```

### ⑤ Frontend (Motoboys) vê entrega disponível
```typescript
// frontend/pages/motoboy-dashboard.tsx
socket.on('delivery:available', (delivery) => {
  // Adiciona à lista de entregas disponíveis
  setAvailableDeliveries(prev => [delivery, ...prev]);
  
  // Notificação de som + vibração
  playNotificationSound();
  showNotification(`Nova entrega: ${delivery.fee} KM: ${delivery.distance}km`);
});
```

---

## 👤 FLUXO 3: MOTOBOY ACEITA ENTREGA

### ① Motoboy clica "Aceitar Entrega"
```
Frontend (Motoboy)
└─ POST /api/deliveries/{deliveryId}/assign
   └─ body: {}
```

### ② Backend: assignDelivery() executa
```typescript
// src/controllers/deliveryController.ts
export const assignDelivery = async (req, res) => {
  // 1️⃣ Validar motoboy
  // 2️⃣ Atribuir motoboy à delivery
  const delivery = await Delivery.findById(id);
  delivery.motoboyId = motoboyId;
  delivery.status = 'assigned';
  delivery.startTime = new Date();
  await delivery.save();
  
  // 🔔 WEBSOCKET: Notificar CLIENTE
  emitToRoom(
    `user:${order.customerId}`,
    'motoboy:assigned',
    {
      orderId: order._id,
      motoboyName: motoboy.name,
      motoboyPhone: motoboy.phone,
      motoboyRating: motoboy.rating,
      deliveryId: delivery._id,
      status: '🚗 Motoboy a caminho para a loja'
    }
  );
  
  // 🔔 WEBSOCKET: Notificar LOJA
  emitToRoom(
    `store:${order.storeId}`,
    'motoboy:assigned_to_order',
    {
      orderId: order._id,
      motoboyName: motoboy.name,
      deliveryId: delivery._id
    }
  );
  
  // 🔔 WEBSOCKET: Notificar MOTOBOYS (remover de disponíveis)
  emitToRoom(
    'motoboys',
    'delivery:claimed',
    { deliveryId: delivery._id, motoboyId: motoboy._id }
  );
  
  // 🔔 WEBSOCKET: Criar sala específica para esta entrega
  // Agora cliente, loja e motoboy podem rastrear juntos
  emitToRoom(
    `delivery:${delivery._id}`,
    'delivery:started',
    {
      motoboyId: motoboy._id,
      motoboyLocation: motoboy.currentLocation,
      eta: estimateArrival(...)
    }
  );
};
```

### ③ Frontend (Cliente) vê motoboy atribuído
```typescript
socket.on('motoboy:assigned', (data) => {
  setOrder(prev => ({
    ...prev,
    status: 'motoboy_assigned',
    motoboy: data,
    delivery: { ...prev.delivery, motoboyId: data.motoboyId }
  }));
  
  // Mostra card com info do motoboy
  // Button para chamar/rastrear
});
```

### ④ Frontend (Loja) vê motoboy atribuído
```typescript
socket.on('motoboy:assigned_to_order', (data) => {
  setOrders(prev =>
    prev.map(o =>
      o._id === data.orderId
        ? {
            ...o,
            delivery: {
              ...o.delivery,
              motoboyId: data.motoboyId,
              motoboyName: data.motoboyName
            }
          }
        : o
    )
  );
});
```

### ⑤ Frontend (Motoboy) confirma aceitação
```typescript
socket.on('delivery:started', (data) => {
  setDelivery(prev => ({
    ...prev,
    status: 'in_transit',
    motoboyLocation: data.motoboyLocation
  }));
  
  // Inicia rastreamento em tempo real (GPS)
  startLocationTracking(delivery._id);
});
```

---

## 📍 FLUXO 4: MOTOBOY BUSCA PEDIDO NA LOJA

### ① Motoboy chega na loja
```
Frontend (Motoboy)
└─ POST /api/deliveries/{deliveryId}/picked
   └─ body: { pin }  // PIN de retirada fornecido pela loja
```

### ② Backend: validarPinRetirada() executa
```typescript
export const validarPinRetirada = async (req, res) => {
  const delivery = await Delivery.findById(id);
  
  if (delivery.pinRetirada !== pin) {
    return res.status(400).json({ error: 'PIN inválido' });
  }
  
  // 1️⃣ Mudar status para 'picked'
  delivery.status = 'picked';
  delivery.pickedAt = new Date();
  await delivery.save();
  
  // 🔔 WEBSOCKET: Notificar CLIENTE
  emitToRoom(
    `user:${order.customerId}`,
    'delivery:picked',
    {
      orderId: order._id,
      status: '🚗 Motoboy retirou seu pedido',
      eta: calculateETA(...)
    }
  );
  
  // 🔔 WEBSOCKET: Notificar LOJA
  emitToRoom(
    `store:${order.storeId}`,
    'order:picked_up',
    { orderId: order._id, pickedAt: delivery.pickedAt }
  );
  
  // 🔔 WEBSOCKET: Atualizar sala de entrega
  emitToRoom(
    `delivery:${delivery._id}`,
    'delivery:in_transit',
    {
      status: 'picked',
      currentLocation: req.body.location,
      eta: calculateETA(...)
    }
  );
};
```

### ③ Todos veem status atualizado
```typescript
// Cliente
socket.on('delivery:picked', (data) => {
  setOrder(prev => ({
    ...prev,
    delivery: { ...prev.delivery, status: 'picked' }
  }));
});

// Loja
socket.on('order:picked_up', (data) => {
  setOrders(prev =>
    prev.map(o =>
      o._id === data.orderId
        ? { ...o, delivery: { ...o.delivery, status: 'picked' } }
        : o
    )
  );
});
```

---

## 📍 FLUXO 5: RASTREAMENTO EM TEMPO REAL

### ① Motoboy compartilha localização (a cada 10-30 segundos)
```
Frontend (Motoboy)
└─ socket.emit('delivery:location_updated', {
     deliveryId,
     latitude,
     longitude,
     timestamp
   })
```

### ② Backend recebe e redistribui
```typescript
// src/services/notifier.ts
socket.on('delivery:location_updated', (data) => {
  const delivery = await Delivery.findById(data.deliveryId);
  
  // Atualizar localização no banco
  delivery.currentLocation = {
    lat: data.latitude,
    lng: data.longitude,
    updatedAt: new Date()
  };
  await delivery.save();
  
  // 🔔 WEBSOCKET: Enviar para CLIENTE e LOJA
  io.to(`delivery:${data.deliveryId}`).emit('motoboy:location_updated', {
    latitude: data.latitude,
    longitude: data.longitude,
    eta: calculateETA(deliveryAddress, currentLocation),
    timestamp: data.timestamp
  });
});
```

### ③ Frontend (Cliente) mostra mapa em tempo real
```typescript
socket.on('motoboy:location_updated', (data) => {
  // Atualizar marcador no mapa
  updateMarkerLocation(data.latitude, data.longitude);
  
  // Atualizar ETA
  setEstimatedTime(data.eta);
});
```

---

## ✅ FLUXO 6: ENTREGA CONCLUÍDA

### ① Motoboy clica "Entregar" com PIN do cliente
```
Frontend (Motoboy)
└─ POST /api/deliveries/{deliveryId}/finalize
   └─ body: { pin }  // PIN fornecido para cliente
```

### ② Backend: finalizarEntrega() executa
```typescript
export const finalizarEntrega = async (req, res) => {
  const delivery = await Delivery.findById(id);
  
  if (delivery.pin !== pin) {
    return res.status(400).json({ error: 'PIN inválido' });
  }
  
  // 1️⃣ Mudar status para 'delivered'
  delivery.status = 'delivered';
  delivery.deliveredAt = new Date();
  await delivery.save();
  
  // 2️⃣ Atualizar pedido
  const order = await Order.findById(delivery.orderId);
  order.status = 'entregue';
  order.deliveredAt = new Date();
  await order.save();
  
  // 🔔 WEBSOCKET: Notificar CLIENTE
  emitToRoom(
    `user:${order.customerId}`,
    'delivery:completed',
    {
      orderId: order._id,
      status: '✅ Pedido entregue',
      deliveredAt: delivery.deliveredAt,
      nextStep: 'Avaliar motoboy e loja'
    }
  );
  
  // 🔔 WEBSOCKET: Notificar LOJA
  emitToRoom(
    `store:${order.storeId}`,
    'order:delivered',
    { orderId: order._id, deliveredAt: delivery.deliveredAt }
  );
  
  // 🔔 WEBSOCKET: Notificar MOTOBOY
  emitToRoom(
    `user:${delivery.motoboyId}`,
    'delivery:completed',
    {
      deliveryId: delivery._id,
      earnedFee: delivery.fee,
      ratings: delivery.rating
    }
  );
  
  // 🔔 WEBSOCKET: Fechar sala de entrega
  io.to(`delivery:${delivery._id}`).emit('delivery:closed', {});
};
```

### ③ Todos veem confirmação de entrega
```typescript
// Cliente
socket.on('delivery:completed', (data) => {
  setOrder(prev => ({
    ...prev,
    status: 'delivered',
    delivery: { ...prev.delivery, status: 'delivered' }
  }));
  
  // Mostra botões de avaliação
  showRatingPrompt();
});

// Loja
socket.on('order:delivered', (data) => {
  // Move pedido para histórico
  setOrders(prev => prev.filter(o => o._id !== data.orderId));
  setHistoryOrders(prev => [...prev, order]);
});

// Motoboy
socket.on('delivery:completed', (data) => {
  setDelivery(prev => ({
    ...prev,
    status: 'delivered',
    earnedAmount: data.earnedFee
  }));
  
  // Mostra saldo e opção de próxima entrega
});
```

---

## ⭐ FLUXO 7: AVALIAÇÕES

### ① Cliente avalia motoboy e loja
```
Frontend (Cliente)
└─ POST /api/orders/{orderId}/evaluate
   └─ body: {
        motoboyRating,
        motoboyComment,
        storeRating,
        storeComment
      }
```

### ② Backend emite para todos
```typescript
export const evaluateOrder = async (req, res) => {
  const order = await Order.findById(orderId);
  order.motoboyRating = req.body.motoboyRating;
  order.storeRating = req.body.storeRating;
  await order.save();
  
  // 🔔 WEBSOCKET: Notificar MOTOBOY
  emitToRoom(
    `user:${order.delivery.motoboyId}`,
    'order:evaluated',
    {
      rating: req.body.motoboyRating,
      comment: req.body.motoboyComment
    }
  );
  
  // 🔔 WEBSOCKET: Notificar LOJA
  emitToRoom(
    `store:${order.storeId}`,
    'order:evaluated',
    {
      rating: req.body.storeRating,
      comment: req.body.storeComment
    }
  );
};
```

---

## ❌ FLUXO 8: CANCELAMENTOS

### ① Cliente cancela pedido
```
Frontend (Cliente)
└─ POST /api/orders/{orderId}/cancel
   └─ body: { reason }
```

### ② Backend notifica todos
```typescript
export const cancelOrderByCustomer = async (req, res) => {
  const order = await Order.findById(orderId);
  order.status = 'cancelado';
  await order.save();
  
  // 🔔 WEBSOCKET: Notificar LOJA
  emitToRoom(
    `store:${order.storeId}`,
    'order:cancelled',
    { orderId: order._id, reason: req.body.reason }
  );
  
  // 🔔 WEBSOCKET: Notificar MOTOBOY (se já atribuído)
  if (order.delivery?.motoboyId) {
    emitToRoom(
      `user:${order.delivery.motoboyId}`,
      'delivery:cancelled',
      { deliveryId: order.deliveryId }
    );
  }
  
  // 🔔 WEBSOCKET: Notificar MOTOBOYS (remover de disponíveis)
  emitToRoom(
    'motoboys',
    'delivery:cancelled',
    { deliveryId: order.deliveryId }
  );
};
```

---

## 🎯 RESUMO DOS EVENTOS WEBSOCKET

### Backend → Frontend (Emit)

**Para CLIENTE:**
- `order:created` - Pedido criado com sucesso
- `order:accepted_by_store` - Loja aceitou o pedido
- `motoboy:assigned` - Motoboy foi atribuído
- `delivery:picked` - Motoboy retirou pedido
- `motoboy:location_updated` - Atualização GPS em tempo real
- `delivery:completed` - Pedido entregue
- `order:cancelled` - Pedido cancelado

**Para LOJA:**
- `new_order` - Novo pedido recebido
- `order:accepted` - Confirmação de aceitação
- `motoboy:assigned_to_order` - Motoboy atribuído
- `order:picked_up` - Pedido retirado
- `order:delivered` - Pedido entregue
- `order:evaluated` - Cliente avaliou

**Para MOTOBOY:**
- `delivery:available` - Nova entrega disponível
- `delivery:started` - Sua entrega foi iniciada
- `delivery:completed` - Entrega finalizada
- `order:evaluated` - Cliente avaliou você

**Para TODOS (Motoboys):**
- `delivery:claimed` - Entrega foi pega por outro motoboy
- `delivery:cancelled` - Entrega foi cancelada

### Frontend → Backend (Emit)

**Motoboy:**
- `delivery:location_updated` - Compartilhar localização

---

## 🔐 Segurança

**Validações importantes:**

1. ✅ Verificar `motoboyId` antes de aceitar entrega
2. ✅ Validar PIN antes de marcar como retirado/entregue
3. ✅ Verificar proprietário antes de cancelar/avaliar
4. ✅ Usar `socket.join(room)` com autenticação

```typescript
// No socket connection
socket.on('connect', (socket) => {
  const userId = socket.handshake.auth.userId;
  const role = socket.handshake.auth.role; // 'cliente', 'loja', 'motoboy'
  
  // Validar token JWT
  const user = await validateToken(socket.handshake.auth.token);
  
  // Ingressar em salas específicas
  socket.join(`user:${userId}`);
  
  if (role === 'loja') {
    socket.join(`store:${user.storeId}`);
  }
  
  if (role === 'motoboy') {
    socket.join('motoboys');
  }
});
```

---

## 📊 Checklist de Implementação

- [ ] Criar handlers de conexão com validação JWT
- [ ] Implementar `new_order` event
- [ ] Implementar `order:accepted` event
- [ ] Implementar `motoboy:assigned` event
- [ ] Implementar `delivery:picked` event
- [ ] Implementar `motoboy:location_updated` listener
- [ ] Implementar `delivery:completed` event
- [ ] Implementar eventos de cancelamento
- [ ] Implementar eventos de avaliação
- [ ] Testar com múltiplos clientes simultâneos
- [ ] Testar com múltiplos motoboys
- [ ] Validar segurança e permissões
- [ ] Implementar fallback para conexão lenta
- [ ] Adicionar logs detalhados para debug

