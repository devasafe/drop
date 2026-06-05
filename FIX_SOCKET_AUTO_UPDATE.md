# 🔧 FIX MANUAL - Socket Auto Update Status

## ❌ O PROBLEMA

Quando você **aceita a corrida na loja**, o cliente não vê a atualização automática. Ele só vê quando faz F5.

**Motivo**: O backend não está emitindo o evento `order:accepted_by_store` que o frontend está escutando.

---

## ✅ SOLUÇÃO

### 📍 ARQUIVO 1: `src/controllers/orderController.ts`

**Linha: 217 até 261** (função `acceptOrder`)

#### ❌ ANTES (ERRADO):
```typescript
export const acceptOrder = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { distance } = req.body;
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // only store owner can accept
    const store = await Store.findById(order.storeId);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    const userId = req.user?.id;
    if (!userId || store.ownerId.toString() !== userId) {
      return res.status(403).json({ error: 'Forbidden - only store owner can accept order' });
    }

    // check if delivery already exists
    let delivery = await Delivery.findOne({ orderId: order._id });
    if (delivery) return res.json(delivery);

    const base = 7;
    const perKm = 1;
    const fee = base + perKm * Math.max(0, Number(distance || 0));

    delivery = new Delivery({ orderId: order._id, distance: Number(distance || 0), fee, status: 'pending' });
    await delivery.save();
    
    // Update order with delivery reference
    order.deliveryId = delivery._id;
    await order.save();
    
    // ❌ AQUI ESTÁ O ERRO - Emite evento ERRADO
    emitDeliveryCreated(delivery);
    
    emitToRoom(
      `store:${order.storeId}`,
      'order_update',
      { orderId: order._id }
    );
    
    // notify motoboys of new delivery
    try {
      notifier.notifyMotoboys({ type: 'new_delivery', delivery: { id: delivery._id, orderId: delivery.orderId, fee: delivery.fee, distance: delivery.distance } });
    } catch (e) {
      // ignore
    }
    return res.status(201).json(delivery);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to accept order' });
  }
};
```

#### ✅ DEPOIS (CORRETO):
```typescript
export const acceptOrder = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { distance } = req.body;
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // only store owner can accept
    const store = await Store.findById(order.storeId);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    const userId = req.user?.id;
    if (!userId || store.ownerId.toString() !== userId) {
      return res.status(403).json({ error: 'Forbidden - only store owner can accept order' });
    }

    // check if delivery already exists
    let delivery = await Delivery.findOne({ orderId: order._id });
    if (delivery) return res.json(delivery);

    const base = 7;
    const perKm = 1;
    const fee = base + perKm * Math.max(0, Number(distance || 0));

    delivery = new Delivery({ orderId: order._id, distance: Number(distance || 0), fee, status: 'pending' });
    await delivery.save();
    
    // Update order with delivery reference
    order.deliveryId = delivery._id;
    await order.save();
    
    // ✅ NOVO: Emitir evento que cliente está escutando
    emitToRoom(
      `user:${order.customerId}`,
      'order:accepted_by_store',
      { 
        orderId: order._id,
        storeId: order.storeId,
        deliveryId: delivery._id,
        estimatedTime: '15-20 minutos'
      }
    );
    
    // Emit socket event for delivery creation
    emitDeliveryCreated(delivery);
    
    // Emit order_update to store owner so order list updates
    emitToRoom(
      `store:${order.storeId}`,
      'order_update',
      { orderId: order._id }
    );
    
    // notify motoboys of new delivery
    try {
      notifier.notifyMotoboys({ type: 'new_delivery', delivery: { id: delivery._id, orderId: delivery.orderId, fee: delivery.fee, distance: delivery.distance } });
    } catch (e) {
      // ignore
    }
    return res.status(201).json(delivery);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to accept order' });
  }
};
```

---

### 📍 ARQUIVO 2: `frontend/pages/store-order/[id].tsx`

**JÁ FOI FEITO AUTOMATICAMENTE!** ✅

Os listeners já estão adicionados neste arquivo. O que você precisa fazer é só mexer no backend acima.

---

## 🎯 RESUMO DAS MUDANÇAS

| Arquivo | Linha | O que mudar |
|---------|-------|-----------|
| `src/controllers/orderController.ts` | ~235 | **Adicionar ANTES** de `emitDeliveryCreated(delivery)` o novo `emitToRoom` com evento `order:accepted_by_store` |

---

## 📋 PASSO A PASSO

1. Abrir: `src/controllers/orderController.ts`
2. Ir para a função `acceptOrder` (~linha 217)
3. Encontrar a linha: `emitDeliveryCreated(delivery);`
4. **ANTES dessa linha**, adicionar:
```typescript
    // 🔴 EMIT: Notificar cliente que loja aceitou o pedido
    emitToRoom(
      `user:${order.customerId}`,
      'order:accepted_by_store',
      { 
        orderId: order._id,
        storeId: order.storeId,
        deliveryId: delivery._id,
        estimatedTime: '15-20 minutos'
      }
    );
```

5. Compilar: `npm run build`
6. Rodar: `npm run dev`

---

## 🧪 DEPOIS DE MEXER

**Teste assim:**
1. **Cliente**: Faz um pedido
2. **Loja**: Clica em "Aceitar Pedido"
3. **Cliente**: Página atualiza automaticamente SEM F5 ✅
   - Deve mudar de "⏳ Aguardando loja..." para "⏱️ Aguardando motoboy..."
   - Deve aparecer o PIN automaticamente quando motoboy retirar

---

## 💡 POR QUE ISSO FUNCIONA?

```
FLUXO CORRETO:
1. Cliente compra → backend emite 'new_order' → Loja recebe ✅
2. Loja clica "Aceitar" → backend emite 'order:accepted_by_store' → Cliente recebe ✅
3. Motoboy aceita → backend emite 'motoboy:assigned' → Cliente recebe ✅
4. Motoboy valida PIN → backend emite 'delivery:picked' → Cliente recebe + mostra PIN ✅
```

Antes estava faltando o passo **2**, por isso o cliente não via a atualização.

---

**Status**: Pronto para editar manualmente
**Data**: 26/02/2026
