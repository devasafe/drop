# 🐛 BUG FIX: Taxa de Entrega Incorreta nas Entregas Disponíveis

**Problema**: A taxa de entrega mostra **R$ 7.00** nas "Entregas Disponíveis" para motoboys, mas deveria mostrar o valor completo calculado (base + distância × 1km).

**Root Cause**: O `distance` não está sendo enviado pelo frontend quando a loja aceita o pedido.

---

## 📍 Onde o Problema Ocorre

### 1️⃣ No Checkout (Correto ✅)
- Cliente vê taxa completa: **R$ 10.78** (7 base + 2.52km × 1)
- Isso é calculado no `src/utils/walletCalculations.ts`

### 2️⃣ No Painel da Loja (Correto ✅)
- Lojista vê taxa completa: **R$ 10.78**
- Mantém histórico correto

### 3️⃣ Nas Entregas Disponíveis (ERRADO ❌)
- Motoboy vê apenas: **R$ 7.00**
- Apenas a taxa base, sem adicional de distância
- **Porquê**: O `distance` é **0** porque não foi passado

---

## 🔍 Fluxo Técnico

```
PASSO 1: Cliente cria pedido no checkout
┌─────────────────────────────────────────┐
│ POST /api/orders                         │
│ {                                        │
│   storeId: "...",                       │
│   distance: 2.52,        ← DISTÂNCIA OK │
│   products: [...]                       │
│ }                                        │
└──────────────────┬──────────────────────┘
                   │
                   ▼ calculateDeliveryFeeWithConfig(2.52)
                   ▼ = 7 + 1 × 2.52 = 9.52
                   ▼ (depois soma outras taxas = 10.78)

PASSO 2: Lojista aceita pedido
┌────────────────────────────────────────────┐
│ POST /api/orders/:id/accept                │
│ {                                           │
│   // PROBLEMA: distance NÃO é enviado! ❌ │
│ }                                           │
└──────────────────┬─────────────────────────┘
                   │
                   ▼ acceptOrderByStore
                   ▼ const distance = req.body?.distance || 0
                   ▼ distance = 0 (porque não foi enviado)
                   ▼ calculateDeliveryFeeWithConfig(0)
                   ▼ = 7 + 1 × 0 = 7.00 ❌

PASSO 3: Motoboy vê entregas
┌──────────────────────────────┐
│ GET /api/deliveries/available│
│ Retorna delivery com:         │
│ {                             │
│   fee: 7.00,                 │ ← ERRADO!
│   distance: 0.0              │ ← ERRADO!
│ }                             │
└──────────────────────────────┘
```

---

## ✅ SOLUÇÃO

### Problema 1: Loja não envia distance
O frontend precisa **recuperar a distância** do Order e enviar para o backend ao aceitar.

**Arquivo**: `frontend/pages/store-dashboard.tsx` ou `frontend/pages/store-order/[id].tsx`

**Mudança Necessária**:

```typescript
// ANTES (ERRADO)
const handleAccept = async () => {
  const res = await api.post(`/api/orders/${orderId}/accept`)
  // ...
}

// DEPOIS (CORRETO)
const handleAccept = async () => {
  const order = orders.find(o => o._id === orderId)
  const deliveryDistance = order?.deliveryDistance || 0 // ← recuperar do order
  
  const res = await api.post(`/api/orders/${orderId}/accept`, {
    distance: deliveryDistance  // ← enviar para backend
  })
  // ...
}
```

### Problema 2: Order não tem distance
O Order precisa **armazenar a distância** para depois a loja usar.

**Arquivo**: `src/models/Order.ts`

**Mudança Necessária**:

```typescript
// ADICIONAR ao schema do Order
export interface IOrder extends Document {
  // ... campos existentes ...
  deliveryDistance?: number;  // ← NOVO: distância entre loja e cliente
  // ...
}

const OrderSchema = new Schema<IOrder>({
  // ... campos existentes ...
  deliveryDistance: { type: Number, default: 0 },
  // ...
})
```

### Problema 3: createOrder não salva distance
Quando o cliente cria o pedido, precisa salvar a distância.

**Arquivo**: `src/controllers/orderController.ts`

**Mudança Necessária**:

```typescript
export const createOrder = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { storeId, products, deliveryDistance, ... } = req.body
    // ...
    
    const order = new Order({
      customerId,
      storeId,
      products,
      totalValue,
      subtotal,
      deliveryFee,
      deliveryDistance: deliveryDistance || 0,  // ← SALVAR DISTÂNCIA
      status: 'criado',
      // ...
    })
    
    await order.save()
    // ...
  }
}
```

### Problema 4: Frontend checkout não envia distance
O checkout precisa enviar a distância junto com o pedido.

**Arquivo**: `frontend/pages/checkout.tsx`

**Mudança Necessária**:

```typescript
const handleCheckout = async () => {
  // ... pegar dados do carrinho ...
  
  const distance = calculateDistance(
    userLocation,
    selectedStore.location
  ) // ← calcular distância
  
  const orderData = {
    storeId: selectedStore._id,
    products: cart,
    deliveryDistance: distance,  // ← ENVIAR DISTÂNCIA
    // ...
  }
  
  const res = await api.post('/api/orders', orderData)
  // ...
}
```

---

## 📝 Checklist de Implementação

### Backend

- [ ] **Atualizar `src/models/Order.ts`**
  - Adicionar campo `deliveryDistance?: number`
  
- [ ] **Atualizar `src/controllers/orderController.ts` - createOrder()**
  - Receber `deliveryDistance` do request
  - Salvar no Order: `deliveryDistance: deliveryDistance || 0`
  
- [ ] **Verificar `src/controllers/cancellationController.ts` - acceptOrderByStore()**
  - Já está recuperando `distance` de `req.body`
  - ✅ Código está correto, só precisa do frontend enviar

### Frontend

- [ ] **Atualizar `frontend/pages/checkout.tsx`**
  - Calcular distância entre cliente e loja
  - Enviar na requisição POST /api/orders
  
- [ ] **Atualizar store-dashboard.tsx ou store-order/[id].tsx**
  - Recuperar `deliveryDistance` do Order
  - Enviar na requisição POST /api/orders/:id/accept
  
- [ ] **Verificar Order display**
  - Exibir distância no painel da loja

---

## 🧪 Teste

### Passo 1: Criar pedido COM distância
```bash
curl -X POST http://localhost:3001/api/orders \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "storeId": "...",
    "products": [...],
    "deliveryDistance": 2.52,
    "paymentMethod": "wallet"
  }'

# Response deve incluir deliveryDistance
```

### Passo 2: Aceitar pedido COM distância
```bash
curl -X POST http://localhost:3001/api/orders/:id/accept \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "distance": 2.52
  }'

# Response deve ter delivery.fee = 7 + 1×2.52 = 9.52
```

### Passo 3: Verificar entregas disponíveis
```bash
curl -X GET http://localhost:3001/api/deliveries/available \
  -H "Authorization: Bearer TOKEN"

# Response deve ter:
# {
#   "fee": 9.52,
#   "distance": 2.52
# }
```

---

## 💡 Por que isso aconteceu?

1. **Separação de responsabilidades**: Distância é calculada no checkout (frontend)
2. **Loja esqueceu de passar**: Backend espera receber, mas frontend não envia
3. **Default para 0**: Se não receber distância, assume 0 (apenas taxa base)

---

## 🚀 Implementação Passo a Passo

### Fase 1: Backend (Hoje)

```typescript
// src/models/Order.ts - Adicionar
export interface IOrder extends Document {
  deliveryDistance?: number;
}

const OrderSchema = new Schema<IOrder>({
  deliveryDistance: { type: Number, default: 0 },
})
```

```typescript
// src/controllers/orderController.ts - Atualizar createOrder
const { deliveryDistance, ... } = req.body

const order = new Order({
  deliveryDistance: deliveryDistance || 0,
})
```

### Fase 2: Frontend (Próximo)

```typescript
// frontend/pages/checkout.tsx - Atualizar handleCheckout
const orderData = {
  storeId,
  products,
  deliveryDistance: 2.52,  // ← adicionar
}

const res = await api.post('/api/orders', orderData)
```

```typescript
// frontend/pages/store-dashboard.tsx - Atualizar handleAccept
const handleAccept = async (orderId: string) => {
  const order = orders.find(o => o._id === orderId)
  const res = await api.post(`/api/orders/${orderId}/accept`, {
    distance: order?.deliveryDistance || 0  // ← adicionar
  })
}
```

---

## ✨ Resultado Final

✅ **Antes**:
- Checkout: R$ 10.78 (correto)
- Painel loja: R$ 10.78 (correto)
- Entregas: R$ 7.00 (ERRADO)

✅ **Depois**:
- Checkout: R$ 10.78 (correto)
- Painel loja: R$ 10.78 (correto)
- Entregas: R$ 10.78 (CORRETO!)

---

**Status**: 🔴 CRITICAL - Taxa incorreta afeta ganhos do motoboy  
**Prioridade**: ALTA  
**Tempo estimado**: 30 min (5 min backend + 25 min frontend)
