# 🔐 WORKFLOW 4: Motoboy Valida PIN de Retirada

## Overview
Quando a loja valida o PIN de retirada (inserido pelo motoboy ao chegar na loja), 3 partes são notificadas em tempo real via WebSocket.

---

## 📊 Status Transition

```
DELIVERY STATE:
  'assigned' (motoboy aguardando PIN)
    ↓
    [Motoboy chega na loja]
    ↓
    [Loja checa PIN]
    ↓
  'picked' (pedido retirado, em trânsito)
    ↓
    [Motoboy sai da loja com pedido]
```

---

## 🔌 Socket Events Emitidos

### 1️⃣ `delivery:picked` → **CLIENTE** 
**Sala**: `user:{customerId}`
```json
{
  "orderId": "65abc123...",
  "deliveryId": "65def456...",
  "status": "🚗 Motoboy retirou seu pedido",
  "message": "Seu pedido saiu da loja e está a caminho!",
  "eta": "20-30 minutos",
  "pickedAt": "2025-02-25T14:30:00Z"
}
```
**O que fazer**: Cliente vê notificação "Pedido saiu da loja"

---

### 2️⃣ `order:picked_up` → **LOJA**
**Sala**: `store:{storeId}`
```json
{
  "orderId": "65abc123...",
  "deliveryId": "65def456...",
  "message": "Pedido retirado com sucesso",
  "pickedAt": "2025-02-25T14:30:00Z"
}
```
**O que fazer**: Loja vê confirmação "Pedido entregue ao motoboy"

---

### 3️⃣ `delivery:pin_validated` → **MOTOBOY**
**Sala**: `user:{motoboyId}`
```json
{
  "deliveryId": "65def456...",
  "orderId": "65abc123...",
  "message": "PIN validado com sucesso! Siga para o endereço de entrega",
  "status": "✅ Pedido retirado"
}
```
**O que fazer**: Motoboy vê "Pedido pronto! Siga para entrega"

---

## 🏗️ Arquitetura

```
FLUXO DE REQUISIÇÃO:
┌─────────┐
│  LOJA   │ POST /deliveries/:id/validar-pin-retirada
│         │ { pinRetirada: "1234" }
└────┬────┘
     │
     ▼
┌──────────────────────────────────────────┐
│ Delivery Controller                      │
│ validarPinRetirada()                     │
│                                          │
│ 1. Valida PIN                            │
│ 2. Muda status: assigned → picked        │
│ 3. Salva delivery no DB                  │
│ 4. Emite 3 eventos via Socket            │
└──────────────────────────────────────────┘
     │
     ├──→ emitToRoom(`user:${customerId}`, 'delivery:picked', {...})
     │    └─→ CLIENTE notificado ✅
     │
     ├──→ emitToRoom(`store:${storeId}`, 'order:picked_up', {...})
     │    └─→ LOJA notificada ✅
     │
     └──→ emitToRoom(`user:${motoboyId}`, 'delivery:pin_validated', {...})
          └─→ MOTOBOY notificado ✅
```

---

## 📝 Implementação

### Backend: `src/controllers/deliveryController.ts`

**Função**: `validarPinRetirada()`

```typescript
export const validarPinRetirada = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params; // delivery id
    const { pinRetirada } = req.body;
    const userId = req.user?.id;
    
    // Apenas a loja pode validar
    const delivery = await Delivery.findById(id).populate('motoboyId');
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    
    const order = await Order.findById(delivery.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    const store = await Store.findById(order.storeId);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    
    // Validar permissão
    if (!userId || store.ownerId.toString() !== userId) {
      return res.status(403).json({ error: 'Forbidden - only store owner can validate PIN'});
    }
    
    // Validar PIN
    if (!pinRetirada || pinRetirada !== delivery.pinRetirada) {
      return res.status(400).json({ error: 'PIN de retirada inválido' });
    }
    
    // Validar status
    if (delivery.status !== 'assigned') {
      return res.status(400).json({ error: 'Entrega não está aguardando retirada' });
    }
    
    // ✅ ATUALIZAR STATUS
    delivery.status = 'picked';
    await delivery.save();

    // Get motoboy name
    const motoboy = delivery.motoboyId as any;
    const motoboyName = motoboy?.name || 'Motoboy';

    // ✅ WORKFLOW 4: Notificar CLIENTE
    emitToRoom(
      `user:${order.customerId}`,
      'delivery:picked',
      {
        orderId: order._id,
        deliveryId: delivery._id,
        status: '🚗 Motoboy retirou seu pedido',
        message: `${motoboyName} retirou seu pedido da loja e está a caminho!`,
        eta: '20-30 minutos',
        pickedAt: new Date()
      }
    );

    // ✅ WORKFLOW 4: Notificar LOJA
    emitToRoom(
      `store:${order.storeId}`,
      'order:picked_up',
      {
        orderId: order._id,
        deliveryId: delivery._id,
        motoboyName: motoboyName,
        message: `Pedido retirado por ${motoboyName}`,
        pickedAt: new Date()
      }
    );

    // ✅ WORKFLOW 4: Notificar MOTOBOY
    emitToRoom(
      `user:${delivery.motoboyId}`,
      'delivery:pin_validated',
      {
        deliveryId: delivery._id,
        orderId: order._id,
        message: 'PIN validado com sucesso! Entrega confirmada',
        status: '✅ Pedido retirado - Siga para o endereço de entrega'
      }
    );

    // Broadcast delivery status change via socket
    emitDeliveryStatusChanged(delivery.toObject());

    return res.json({ success: true });
  } catch (err) {
    console.error('[validarPinRetirada] error:', err);
    return res.status(500).json({ error: 'Erro ao validar PIN de retirada' });
  }
};
```

---

### Socket Emitter: `src/utils/socketEmitter.ts`

**Nova Função**: `emitDeliveryPicked()`

```typescript
export const emitDeliveryPicked = (delivery: any, order: any) => {
  // WORKFLOW 4: Motoboy validou PIN e retirou pedido
  
  // Notificar CLIENTE
  emitToRoom(
    `user:${order.customerId}`,
    'delivery:picked',
    {
      orderId: order._id,
      deliveryId: delivery._id,
      status: '🚗 Motoboy retirou seu pedido',
      message: `Seu pedido saiu da loja e está a caminho!`,
      eta: '20-30 minutos',
      pickedAt: delivery.updatedAt
    }
  );

  // Notificar LOJA
  emitToRoom(
    `store:${order.storeId}`,
    'order:picked_up',
    {
      orderId: order._id,
      deliveryId: delivery._id,
      message: `Pedido retirado com sucesso`,
      pickedAt: delivery.updatedAt
    }
  );

  // Notificar MOTOBOY
  if (delivery.motoboyId) {
    emitToRoom(
      `user:${delivery.motoboyId}`,
      'delivery:pin_validated',
      {
        deliveryId: delivery._id,
        orderId: order._id,
        message: 'PIN validado com sucesso! Siga para o endereço de entrega',
        status: '✅ Pedido retirado'
      }
    );
  }
};
```

---

## 🧪 Como Testar

### Setup
```bash
# Terminal 1 - Backend
cd d:\PROJETOS\Drop
npm run build
npm run dev

# Terminal 2 - Frontend
cd d:\PROJETOS\Drop\frontend
npm run dev
```

### Passos
1. **CLIENTE**: Crie um pedido
2. **LOJA**: Aceite o pedido
3. **MOTOBOY**: Aceite a entrega
4. **MOTOBOY**: Vá para a loja e veja PIN de retirada (gerado automaticamente)
5. **LOJA**: Clique em "Validar PIN de Retirada" e insira o PIN
6. Observe as 3 abas se atualizarem em tempo real

### ✅ Esperado
- ✨ **CLIENTE** vê: "🚗 Motoboy retirou seu pedido"
- ✨ **LOJA** vê: "Pedido retirado com sucesso"
- ✨ **MOTOBOY** vê: "✅ Pedido retirado - Siga para o endereço de entrega"

### 🐛 Debug - Console do Browser

```javascript
// CLIENTE
socket.on('delivery:picked', (data) => {
  console.log('🚗 Pedido retirado:', data);
});

// LOJA
socket.on('order:picked_up', (data) => {
  console.log('✅ Loja: Pedido retirado por', data.motoboyName);
});

// MOTOBOY
socket.on('delivery:pin_validated', (data) => {
  console.log('✅ Motoboy: PIN validado!', data);
});
```

---

## 📊 API Endpoint

### Request
```http
POST /deliveries/:id/validar-pin-retirada
Authorization: Bearer {token}
Content-Type: application/json

{
  "pinRetirada": "1234"
}
```

### Response (Sucesso)
```json
{
  "success": true
}
```

### Response (Erro)
```json
{
  "error": "PIN de retirada inválido"
}
```

---

## 🔐 Validações

| Validação | Erro | Status Code |
|-----------|------|------------|
| Delivery não encontrada | `Delivery not found` | 404 |
| Order não encontrada | `Order not found` | 404 |
| Store não encontrada | `Store not found` | 404 |
| Sem permissão (não é lojista) | `Forbidden - only store owner can validate PIN` | 403 |
| PIN inválido | `PIN de retirada inválido` | 400 |
| Status não é "assigned" | `Entrega não está aguardando retirada` | 400 |

---

## 📈 Próximos Workflows

✅ **Workflow 1**: Order Creation - IMPLEMENTADO
✅ **Workflow 2**: Loja Acceptance - IMPLEMENTADO
✅ **Workflow 3**: Motoboy Assignment - IMPLEMENTADO
✅ **Workflow 4**: PIN Validation - IMPLEMENTADO
⏳ **Workflow 5**: Real-time Location Tracking
⏳ **Workflow 6**: Delivery Completion
⏳ **Workflow 7**: Ratings & Evaluations
⏳ **Workflow 8**: Cancellations & Rejections

---

## 📝 Status

- ✅ Backend implementado
- ✅ Socket events configurados
- ✅ Compilação sem erros
- ⏳ Testes no browser (próximo)
- ⏳ Frontend listeners (próximo)

**Data**: 25/02/2026
**Status**: READY FOR TESTING
