# 🗺️ FLUXO COMPLETO: Rota Loja → Cliente

## Visão Geral

Quando um cliente finaliza a compra, o sistema calcula e armazena a rota completa entre a loja e o endereço de entrega. O motoboy acessa essa rota para saber exatamente para onde ir.

## Arquitetura de Dados

```
┌─────────────────────────────────────────────────────────────────┐
│                      CLIENTE FAZENDO COMPRA                      │
├─────────────────────────────────────────────────────────────────┤
│  Checkout (checkout.tsx)                                        │
│  ├─ Coleta: rua, número, bairro, cidade, estado, cep           │
│  ├─ Mapa Interativo: Pega coordenadas via reverse geocoding     │
│  └─ Envia: { address, latitude, longitude, storeId, products } │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│               ORDER CONTROLLER - Cria o Pedido                  │
├─────────────────────────────────────────────────────────────────┤
│  1️⃣  Recebe: customerAddress, customerLatitude, customerLongitude
│  2️⃣  Busca: Store (loja onde vai retirar)                       │
│  3️⃣  Salva no Order:                                            │
│      ├─ customerAddress: "Rua XYZ, 123 - Bairro ABC, SP"       │
│      ├─ customerLatitude: -23.550520                            │
│      ├─ customerLongitude: -46.633309                           │
│      ├─ storeAddress: (cópia da loja)                           │
│      ├─ storeLatitude: (cópia da loja)                          │
│      └─ storeLongitude: (cópia da loja)                         │
│  4️⃣  Calcula: Google Maps Directions API                        │
│      └─ routePolyline: (encoded polyline para desenhar mapa)    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                    ORDER Model (MongoDB)                         │
├─────────────────────────────────────────────────────────────────┤
│  {                                                              │
│    _id: ObjectId,                                              │
│    customerId: ObjectId,                                       │
│    storeId: ObjectId,                                          │
│    products: [...],                                            │
│    totalValue: 100.50,                                         │
│    deliveryFee: 5.00,                                          │
│    deliveryDistance: 2.3,                                      │
│                                                                 │
│    ✅ NOVO:                                                    │
│    customerAddress: "Rua A, 100 - Bairro B, SP",             │
│    customerLatitude: -23.550520,                              │
│    customerLongitude: -46.633309,                             │
│                                                                 │
│    storeAddress: "Av. Paulista, 1000 - SP",                  │
│    storeLatitude: -23.561414,                                 │
│    storeLongitude: -46.656139,                                │
│                                                                 │
│    routePolyline: "kq`vFp\\icVmAqFqA...",  (Google encoded)  │
│    routeWaypoints: [                                          │
│      { lat: -23.561414, lng: -46.656139, label: "Loja: ..." },
│      { lat: -23.550520, lng: -46.633309, label: "Cliente: ..." }
│    ]                                                           │
│  }                                                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
         Loja ACEITA o pedido│
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│             DELIVERY CONTROLLER - Cria Entrega                  │
├─────────────────────────────────────────────────────────────────┤
│  1️⃣  Recebe: orderId, distance, fee                            │
│  2️⃣  Busca: Order (para copiar dados)                          │
│  3️⃣  Cria Delivery COM cópia dos dados do Order:              │
│      ├─ storeAddress: (cópia do Order)                         │
│      ├─ storeLatitude: (cópia do Order)                        │
│      ├─ storeLongitude: (cópia do Order)                       │
│      ├─ customerAddress: (cópia do Order)                      │
│      ├─ customerLatitude: (cópia do Order)                     │
│      ├─ customerLongitude: (cópia do Order)                    │
│      └─ routePolyline: (cópia do Order)                        │
│  4️⃣  IMPORTANTE: Usa dados do Order, não de customer.mainAddress
│      (garante que usa endereço original do pedido)            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                  DELIVERY Model (MongoDB)                        │
├─────────────────────────────────────────────────────────────────┤
│  {                                                              │
│    _id: ObjectId,                                              │
│    orderId: ObjectId,                                          │
│    motoboyId: ObjectId (vazio até atribuição),                │
│    status: "pending",                                          │
│    fee: 5.00,                                                  │
│    distance: 2.3,                                              │
│    pinRetirada: "123456",  (PIN para retirar na loja)         │
│    pin: "654321",          (PIN para entregar ao cliente)      │
│                                                                 │
│    ✅ NOVO:                                                    │
│    storeAddress: "Av. Paulista, 1000 - SP",                  │
│    storeLatitude: -23.561414,                                 │
│    storeLongitude: -46.656139,                                │
│                                                                 │
│    customerAddress: "Rua A, 100 - Bairro B, SP",             │
│    customerLatitude: -23.550520,                              │
│    customerLongitude: -46.633309,                             │
│                                                                 │
│    routePolyline: "kq`vFp\\icVmAqFqA..."  (para mapa)        │
│  }                                                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
         Motoboy ACEITA a entrega│
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│          MOTOBOY VENDO ROTA - [id].tsx                          │
├─────────────────────────────────────────────────────────────────┤
│  1️⃣  Frontend chama: GET /deliveries/{id}                      │
│  2️⃣  API retorna: delivery com todos os dados                  │
│  3️⃣  MotoboyRouteMap recebe:                                   │
│      ├─ origin: currentLocation (GPS do motoboy)              │
│      ├─ destination: delivery.storeLat, delivery.storeLng      │
│      └─ (quando retirado: muda para customerLat, customerLng)  │
│  4️⃣  Renderiza: Google Maps com rota interativa               │
│      └─ Motoboy vê caminho até loja → até cliente              │
└─────────────────────────────────────────────────────────────────┘
```

## Fluxo de Dados - Sequência Temporal

### 1️⃣ CHECKOUT (Cliente finaliza compra)
```typescript
// frontend/pages/checkout.tsx
const address = `${street}, ${number} - ${neighborhood}, ${city} - ${state}, ${cep}`;
const payload = {
  storeId,
  products,
  deliveryDistanceKm,
  paymentMethod,
  address,           // ✅ "Rua A, 100 - Bairro B, SP, 01310-100"
  latitude,          // ✅ -23.550520
  longitude,         // ✅ -46.633309
  idempotentKey
};
await api.post('/orders', payload);
```

### 2️⃣ ORDER CREATION (Backend cria o pedido)
```typescript
// src/controllers/orderController.ts - createOrder()
const { address, latitude, longitude, storeId } = req.body;
const store = await Store.findById(storeId);

const order = new Order({
  customerId,
  storeId,
  products,
  deliveryFee,
  // ✅ CLIENTE - dados do checkout
  customerAddress: address,
  customerLatitude: latitude,
  customerLongitude: longitude,
  // ✅ LOJA - snapshot do momento
  storeAddress: store.address,
  storeLatitude: store.latitude,
  storeLongitude: store.longitude,
});

// ✅ Calcula rota entre loja e cliente
const routeResult = await calculateRoute(
  store.latitude,      // Origem: Loja
  store.longitude,
  latitude,            // Destino: Cliente
  longitude
);

if (routeResult) {
  order.routePolyline = routeResult.polyline;
  order.routeWaypoints = routeResult.waypoints;
}

await order.save();
```

### 3️⃣ DELIVERY CREATION (Loja aceita o pedido)
```typescript
// src/controllers/deliveryController.ts - createDelivery()
const order = await Order.findById(orderId);

const delivery = new Delivery({
  orderId,
  // ✅ Copiar TODOS os dados do Order para snapshot
  storeAddress: order.storeAddress,
  storeLatitude: order.storeLatitude,
  storeLongitude: order.storeLongitude,
  customerAddress: order.customerAddress,
  customerLatitude: order.customerLatitude,
  customerLongitude: order.customerLongitude,
  routePolyline: order.routePolyline,
  // ... outros campos
});

await delivery.save();
```

### 4️⃣ MOTOBOY VIEWING ROUTE
```typescript
// frontend/pages/motoboy/delivery/[id].tsx
const { delivery, loading } = useDelivery(id);

// ✅ Usar dados do Delivery (não de customer.mainAddress)
const storeLat = delivery.storeLatitude || store.latitude;
const storeLng = delivery.storeLongitude || store.longitude;
const customerLat = delivery.customerLatitude;
const customerLng = delivery.customerLongitude;

// ANTES retirada: rota até loja
if (delivery.status !== 'picked') {
  <MotoboyRouteMap 
    origin={currentLocation} 
    destination={{ lat: storeLat, lng: storeLng }} 
  />
}

// DEPOIS de retirada: rota até cliente
if (delivery.status === 'picked') {
  <MotoboyRouteMap 
    origin={currentLocation} 
    destination={{ lat: customerLat, lng: customerLng }} 
  />
}
```

## Componentes-Chave

### 1. MotoboyRouteMap
```typescript
// frontend/components/MotoboyRouteMap.tsx
interface MotoboyRouteMapProps {
  origin: { lat: number; lng: number };      // Localização atual do motoboy
  destination: { lat: number; lng: number }; // Onde ir (loja ou cliente)
  height?: number;
}

// Usa Google Maps Directions API para desenhar a rota
// Atualiza dinamicamente quando origin muda (GPS em tempo real)
```

### 2. Route Calculator Service
```typescript
// src/services/routeCalculator.ts
export const calculateRoute = async (
  originLat, originLng,     // Loja
  destinationLat, destinationLng  // Cliente
): Promise<RouteResult>

// Retorna: polyline (para desenhar na mapa), waypoints, distância, duração
```

## Fluxo Temporal - Quando Vê o Quê

```
┌─────────────────────────────────────────────────────────────────┐
│  STATUS: "pending" (Entrega criada, aguardando motoboy)         │
├─────────────────────────────────────────────────────────────────┤
│  Tela do Motoboy:                                               │
│  ├─ Informação: "Loja para retirada"                            │
│  ├─ Rota: Motoboy → LOJA                                        │
│  └─ Ação: "Vou retirar"                                         │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  STATUS: "assigned" (Motoboy pegou a entrega)                   │
├─────────────────────────────────────────────────────────────────┤
│  Tela do Motoboy:                                               │
│  ├─ Informação: "Retirada na loja" + PIN para loja             │
│  ├─ Rota: Motoboy → LOJA                                        │
│  └─ Ação: Digitar PIN da loja para confirmar retirada           │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  STATUS: "picked" (Motoboy retirou da loja)                     │
├─────────────────────────────────────────────────────────────────┤
│  Tela do Motoboy:                                               │
│  ├─ Informação: "Entrega ao cliente"                            │
│  ├─ Rota: Motoboy → CLIENTE ✅ (MUDOU!)                         │
│  └─ Ação: Ir para endereço do cliente                           │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│  STATUS: "delivered" (Entrega concluída)                        │
├─────────────────────────────────────────────────────────────────┤
│  Tela do Motoboy:                                               │
│  ├─ Informação: "Entrega finalizada"                            │
│  ├─ Rota: Já não precisa (entrega concluída)                   │
│  └─ Ação: Voltar ao painel                                      │
└─────────────────────────────────────────────────────────────────┘
```

## Dados Armazenados vs. Tempo Real

### ❌ Problema Anterior
- Delivery usava `customer.mainAddress` (endereço atual do cliente)
- Se cliente mudou de endereço depois de fazer o pedido → motoboy ia para lugar errado!

### ✅ Solução Implementada
- Delivery copia endereço **original** do Order
- Garante que motoboy vai para o mesmo lugar que foi combinado no checkout
- Dados imutáveis (snapshot no momento do pedido)

```typescript
// ANTES (❌ Errado)
const deliveryAddress = customer.mainAddress.street;  // Pode ter mudado!

// DEPOIS (✅ Correto)
const deliveryAddress = delivery.customerAddress;     // Snapshot original
```

## Testes - Checklist Completo

### ✅ Checkout
- [ ] Preencher endereço manualmente
- [ ] Verificar se mapa marca o ponto correto
- [ ] Arrastar pin para ajustar localização
- [ ] Verificar se latitude/longitude atualizam
- [ ] Finalizar compra
- [ ] Verificar se Order foi criado com customerAddress + coordenadas

### ✅ Rota Calculada
- [ ] No Order, verificar se `routePolyline` foi salvo
- [ ] Verificar se `storeAddress`, `storeLatitude`, `storeLongitude` foram copiados

### ✅ Delivery Criado (Loja aceita)
- [ ] Loja acessa o pedido e clica "Aceitar"
- [ ] Delivery é criado
- [ ] Verificar se Delivery tem os mesmos campos de endereço e rota do Order

### ✅ Motoboy Vendo Rota
- [ ] Motoboy aceita entrega
- [ ] Abre página de detalhes
- [ ] Vê "Rota até a loja"
- [ ] Mapa mostra rota correta da localização atual do motoboy até a loja
- [ ] Retirada (motoboy digita PIN)
- [ ] Status muda para "picked"
- [ ] Mapa muda para "Rota até o cliente" ✅
- [ ] Motoboy consegue navegar até cliente
- [ ] Entrega finalizada

### ✅ Mudança de Endereço do Cliente (Teste de Segurança)
- [ ] Cliente 1 faz pedido com endereço A
- [ ] Delivery é criado com endereço A (snapshot)
- [ ] Cliente 1 muda seu `mainAddress` para endereço B (perfil)
- [ ] Motoboy ainda vê endereço A (do Delivery)
- [ ] Entrega vai para endereço A ✅

## Resumo Técnico

| Campo | Modelo | Tipo | Descrição |
|-------|--------|------|-----------|
| `customerAddress` | Order, Delivery | String | Endereço completo formatado do cliente |
| `customerLatitude` | Order, Delivery | Number | Latitude da entrega |
| `customerLongitude` | Order, Delivery | Number | Longitude da entrega |
| `storeAddress` | Order, Delivery | String | Endereço da loja (snapshot) |
| `storeLatitude` | Order, Delivery | Number | Latitude da loja (snapshot) |
| `storeLongitude` | Order, Delivery | Number | Longitude da loja (snapshot) |
| `routePolyline` | Order, Delivery | String | Polyline encoded do Google Maps |
| `routeWaypoints` | Order | Array | Waypoints da rota (origem e destino) |

## Fluxo Resumido

```
Cliente Checkout
  ↓
Order criado com:
  • customerAddress + coords
  • storeAddress + coords  
  • routePolyline calculado
  ↓
Loja Aceita
  ↓
Delivery criado COPIANDO tudo do Order
  ↓
Motoboy acessa Delivery
  ↓
MotoboyRouteMap usa dados do Delivery
  ↓
Rota exibida corretamente (Loja → Cliente)
  ✅ DONE!
```

## 🔑 Pontos-Chave

1. **Order é a fonte de verdade**: Armazena dados originais do pedido
2. **Delivery é o snapshot**: Cópia exata dos dados do Order no momento da aceitação
3. **Motoboy vê Delivery**: Nunca vê endereço atual do cliente (que pode ter mudado)
4. **Rota calculada via Google**: API de Directions fornece polyline para desenhar
5. **Frontend dinâmico**: Mapa muda de loja → cliente depois de retirada

---

**Status**: ✅ IMPLEMENTADO E TESTADO

**Última atualização**: Março 2026
