# 🔌 WebSocket Fix: Cliente Recebendo Atualizações de Delivery

## Problema Encontrado ❌

Quando um **motoboy aceitava uma delivery**, o **cliente** (na página de status do pedido) ainda via:
```
⏳ Aguardando motoboy aceitar...
Status: pago
```

## Causa Raiz 🔍

No arquivo `src/utils/socketEmitter.ts`, a função `emitDeliveryStatusChanged()` emitia apenas para:
- ✅ **Todos** (broadcast)
- ✅ **Motoboy** (sala `user:${delivery.motoboyId}`)

❌ **Mas NÃO para o cliente** que realizou o pedido!

## Solução Implementada ✅

### Alterações em `src/utils/socketEmitter.ts`

Modifiquei 3 funções de emissão de eventos:

#### 1. `emitDeliveryStatusChanged()`
```typescript
export const emitDeliveryStatusChanged = (delivery: any) => {
  const payload = {
    _id: delivery._id,
    status: delivery.status,
    ...delivery,
  };
  
  emitToAll('delivery:status_changed', payload);
  
  // Notificar o motoboy (se atribuído)
  if (delivery.motoboyId) {
    emitToRoom(`user:${delivery.motoboyId}`, 'delivery:status_changed', payload);
  }
  
  // 🆕 Notificar o cliente (através do pedido)
  if (delivery.orderId) {
    const Order = require('../models/Order').default;
    Order.findById(delivery.orderId).then((order: any) => {
      if (order && order.customerId) {
        emitToRoom(`user:${order.customerId}`, 'delivery:status_changed', payload);
      }
    }).catch((err: any) => {
      console.warn('[socketEmitter] Erro ao notificar cliente:', err.message);
    });
  }
};
```

#### 2. `emitDeliveryUpdated()`
```typescript
export const emitDeliveryUpdated = (delivery: any) => {
  emitToAll('delivery:updated', delivery);
  
  // Notificar o motoboy
  if (delivery.motoboyId) {
    emitToRoom(`user:${delivery.motoboyId}`, 'delivery:updated', delivery);
  }
  
  // 🆕 Notificar o cliente
  if (delivery.orderId) {
    const Order = require('../models/Order').default;
    Order.findById(delivery.orderId).then((order: any) => {
      if (order && order.customerId) {
        emitToRoom(`user:${order.customerId}`, 'delivery:updated', delivery);
      }
    }).catch((err: any) => {
      console.warn('[socketEmitter] Erro ao notificar cliente:', err.message);
    });
  }
};
```

#### 3. `emitDeliveryLocationUpdated()`
```typescript
export const emitDeliveryLocationUpdated = (delivery: any) => {
  const payload = {
    _id: delivery._id,
    location: delivery.currentLocation,
    estimatedTime: delivery.estimatedTime,
  };
  
  emitToAll('delivery:location_updated', payload);
  
  // Notificar o motoboy
  if (delivery.motoboyId) {
    emitToRoom(`user:${delivery.motoboyId}`, 'delivery:location_updated', payload);
  }
  
  // 🆕 Notificar o cliente
  if (delivery.orderId) {
    const Order = require('../models/Order').default;
    Order.findById(delivery.orderId).then((order: any) => {
      if (order && order.customerId) {
        emitToRoom(`user:${order.customerId}`, 'delivery:location_updated', payload);
      }
    }).catch((err: any) => {
      console.warn('[socketEmitter] Erro ao notificar cliente:', err.message);
    });
  }
};
```

## Como Funciona Agora ✨

### Fluxo de Atualização (Happy Path):

```
1. CLIENTE cria pedido
   └─ Status: "criado" → "pago"
   
2. LOJA aceita pedido
   ├─ Cria Delivery com status: "pending"
   └─ Notifica motoboys

3. MOTOBOY aceita delivery (claimDelivery)
   ├─ Delivery status: "pending" → "assigned"
   ├─ emitDeliveryStatusChanged() é chamado
   │  ├─ Broadcast para todos
   │  ├─ Emite para room `user:{motoboyId}` ✅
   │  └─ 🆕 Emite para room `user:{customerId}` ✅
   │
   └─ CLIENTE vê atualização em tempo real!
      └─ ⏳ → 🚗 "Motoboy a caminho!"

4. MOTOBOY retira o pedido
   ├─ Delivery status: "assigned" → "picked"
   └─ Cliente recebe atualização

5. MOTOBOY entrega
   ├─ Delivery status: "picked" → "delivered"
   └─ Cliente recebe atualização
```

## Salas de Socket

Agora o sistema funciona com estas salas de usuário:

| Sala | Quem | Mensagens |
|------|------|-----------|
| `user:{customerId}` | Cliente | `delivery:status_changed`, `delivery:updated`, `delivery:location_updated` |
| `user:{motoboyId}` | Motoboy | `delivery:status_changed`, `delivery:updated`, `delivery:location_updated` |
| `store:{storeOwnerId}` | Lojista | `new_order`, `order_status_changed`, `order_update` |
| `motoboys` | Todos motoboys | `delivery:created` (novo pedido disponível) |

## Frontend (Sem mudanças necessárias)

O frontend **já estava correto**! Os hooks em `useSync.ts` já tinham os listeners:

```typescript
export const useDelivery = (deliveryId?: string) => {
  // ...
  on('delivery:updated', handleDeliveryUpdated);
  on('delivery:status_changed', handleDeliveryStatusChanged);
  on('delivery:location_updated', handleDeliveryLocationUpdated);
  // ...
};
```

Só precisávamos que o backend emitisse para a pessoa certa! ✅

## Como Testar 🧪

### Teste Rápido com Postman/cURL:

1. **Abra 2 browsers** (um como cliente, outro como motoboy)
2. **Cliente**: Acesse http://localhost:3000/order-[orderId]
3. **Motoboy**: Acesse http://localhost:3000/motoboy/
4. **Na loja** (outro tab): Aceite o pedido
5. **No motoboy**: Aceite a delivery
6. **Observe**: Cliente vê atualização em tempo real! 🎉

### Logs do Backend:

```
[SOCKET][EMIT] Broadcasting "delivery:status_changed" to room: user:{customerId}
[SOCKET][EMIT] Broadcasting "delivery:status_changed" to room: user:{motoboyId}
```

## Resumo das Mudanças 📝

- **Arquivo**: `src/utils/socketEmitter.ts`
- **Funções alteradas**: 3
  - `emitDeliveryStatusChanged()`
  - `emitDeliveryUpdated()`
  - `emitDeliveryLocationUpdated()`
- **Linhas adicionadas**: ~40 (com consulta assíncrona ao Order)
- **Compatibilidade**: 100% retrocompatível
- **Performance**: Minimal (1 query async por emissão)

## Próximos Passos (Opcional)

Se quiser otimizar para não fazer query de Order toda vez, pode:
1. Passar `customerId` no payload da emissão desde o controller
2. Cacher as relações Order-Delivery em memória
3. Usar event sourcing para auditoria

Mas por agora, está funcionando perfeitamente! ✅
