# 🗺️ DIAGRAMAS VISUAIS - Sistema de Rotas

## 1. Arquitetura Geral

```
┌──────────────────────────────────────────────────────────────────────┐
│                         CLIENTE (WEB)                                │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ CHECKOUT PAGE                                               │   │
│  │                                                              │   │
│  │  Endereço do Cliente:                                       │   │
│  │  ├─ Rua: _________________                                 │   │
│  │  ├─ Número: _________________                              │   │
│  │  ├─ Bairro: _________________                              │   │
│  │  ├─ Cidade: _________________                              │   │
│  │  └─ Estado: __                                             │   │
│  │                                                              │   │
│  │  🗺️ MAPA INTERATIVO                                         │   │
│  │  ┌────────────────────────────────────────────────────┐    │   │
│  │  │                                                    │    │   │
│  │  │   📍 PIN ARRASTRÁVEL (reverse geocoding)          │    │   │
│  │  │                                                    │    │   │
│  │  │   Latitude: -23.550520                            │    │   │
│  │  │   Longitude: -46.633309                           │    │   │
│  │  │                                                    │    │   │
│  │  └────────────────────────────────────────────────────┘    │   │
│  │                                                              │   │
│  │  [✓ Finalizar Compra]                                       │   │
│  │                                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                           │                                         │
│                           │ POST /orders                            │
│                           │ {                                       │
│                           │   address: "Rua A, 100...",            │
│                           │   latitude: -23.550520,                │
│                           │   longitude: -46.633309,               │
│                           │   storeId: "...",                      │
│                           │   products: [...]                      │
│                           │ }                                       │
└──────────────────────────┼──────────────────────────────────────────┘
                           │
                           ↓
┌──────────────────────────────────────────────────────────────────────┐
│                    BACKEND - ORDER CREATION                          │
│                                                                       │
│  OrderController.createOrder()                                       │
│  │                                                                   │
│  ├─ 1️⃣  Recebe: address, latitude, longitude                       │
│  │                                                                   │
│  ├─ 2️⃣  Busca: Store (para pegar endereço e coords)               │
│  │     Store {                                                      │
│  │       name: "Loja ABC",                                         │
│  │       address: "Av. Paulista, 1000 - SP",                       │
│  │       latitude: -23.561414,                                     │
│  │       longitude: -46.656139                                     │
│  │     }                                                            │
│  │                                                                   │
│  ├─ 3️⃣  Cria Order com:                                            │
│  │     ├─ customerAddress: "Rua A, 100 - Bairro B, SP"            │
│  │     ├─ customerLatitude: -23.550520                             │
│  │     ├─ customerLongitude: -46.633309                            │
│  │     ├─ storeAddress: "Av. Paulista, 1000 - SP"                 │
│  │     ├─ storeLatitude: -23.561414                                │
│  │     ├─ storeLongitude: -46.656139                               │
│  │     └─ ... outros campos                                        │
│  │                                                                   │
│  ├─ 4️⃣  Calcula Rota:                                              │
│  │     calculateRoute(                                             │
│  │       -23.561414, -46.656139,  ← origem: LOJA                  │
│  │       -23.550520, -46.633309   ← destino: CLIENTE              │
│  │     )                                                            │
│  │     ↓                                                            │
│  │     Google Maps Directions API                                  │
│  │     ↓                                                            │
│  │     Retorna: {                                                  │
│  │       polyline: "kq`vFp\\icVmAqFqA...",                        │
│  │       waypoints: [                                              │
│  │         { lat: -23.561414, lng: -46.656139, label: "Loja" },  │
│  │         { lat: -23.550520, lng: -46.633309, label: "Cliente" }│
│  │       ],                                                        │
│  │       distance: 2300,  (em metros)                             │
│  │       duration: 420    (em segundos)                           │
│  │     }                                                            │
│  │                                                                   │
│  └─ 5️⃣  Salva Order completo no MongoDB ✅                         │
│                                                                       │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ↓
                    MongoDB - Order
                    {
                      _id: ObjectId,
                      customerId: ObjectId,
                      storeId: ObjectId,
                      ...
                      customerAddress: "Rua A, 100...",
                      customerLatitude: -23.550520,
                      customerLongitude: -46.633309,
                      storeAddress: "Av. Paulista...",
                      storeLatitude: -23.561414,
                      storeLongitude: -46.656139,
                      routePolyline: "kq`vFp\\icVmAqFqA...",
                      routeWaypoints: [...]
                    }
```

## 2. Fluxo Delivery Creation

```
┌──────────────────────────────────────────────────────────────────────┐
│                 LOJA VÊ PEDIDO & CLICA "ACEITAR"                    │
│                                                                       │
│         ┌─────────────────────────────────────────────────┐          │
│         │ Pedido #12345                                   │          │
│         ├─────────────────────────────────────────────────┤          │
│         │ Cliente: João Silva                             │          │
│         │ Endereço: Rua A, 100 - Bairro B, SP            │          │
│         │                                                  │          │
│         │ Loja: Loja ABC                                  │          │
│         │ Endereço: Av. Paulista, 1000 - SP              │          │
│         │                                                  │          │
│         │ Produtos:                                       │          │
│         │ ├─ Hambúrguer x2 = R$ 40,00                    │          │
│         │ └─ Refrigerante x2 = R$ 10,00                  │          │
│         │ Subtotal: R$ 50,00                             │          │
│         │ Entrega: R$ 5,00                               │          │
│         │ Total: R$ 55,00                                │          │
│         │                                                  │          │
│         │ [✓ Aceitar Pedido] [✗ Rejeitar]               │          │
│         └─────────────────────────────────────────────────┘          │
│                         │                                             │
│                         │ POST /deliveries                            │
│                         │ { orderId, distance, fee }                  │
└─────────────────────────┼──────────────────────────────────────────┘
                           │
                           ↓
┌──────────────────────────────────────────────────────────────────────┐
│                  BACKEND - DELIVERY CREATION                         │
│                                                                       │
│  DeliveryController.createDelivery()                                 │
│  │                                                                   │
│  ├─ 1️⃣  Recebe: orderId, distance, fee                             │
│  │                                                                   │
│  ├─ 2️⃣  Busca: Order (completo)                                    │
│  │     Order {                                                      │
│  │       _id: ObjectId,                                            │
│  │       customerAddress: "Rua A, 100 - Bairro B, SP",            │
│  │       customerLatitude: -23.550520,                             │
│  │       customerLongitude: -46.633309,                            │
│  │       storeAddress: "Av. Paulista, 1000 - SP",                 │
│  │       storeLatitude: -23.561414,                                │
│  │       storeLongitude: -46.656139,                               │
│  │       routePolyline: "kq`vFp\\icVmAqFqA...",                   │
│  │       ...                                                       │
│  │     }                                                            │
│  │                                                                   │
│  ├─ 3️⃣  CRIA DELIVERY - COPIANDO DO ORDER:                         │
│  │     new Delivery({                                              │
│  │       orderId: ObjectId,                                        │
│  │       distance: 2.3,                                            │
│  │       fee: 5.00,                                                │
│  │       status: 'pending',                                        │
│  │       pinRetirada: "123456",  (random)                          │
│  │       pin: "654321",          (random)                          │
│  │       │                                                         │
│  │       │ ✅ CÓPIA DO ORDER (SNAPSHOT)                            │
│  │       ├─ storeAddress: "Av. Paulista, 1000 - SP",             │
│  │       ├─ storeLatitude: -23.561414,                            │
│  │       ├─ storeLongitude: -46.656139,                           │
│  │       ├─ customerAddress: "Rua A, 100 - Bairro B, SP",        │
│  │       ├─ customerLatitude: -23.550520,                         │
│  │       ├─ customerLongitude: -46.633309,                        │
│  │       └─ routePolyline: "kq`vFp\\icVmAqFqA...",               │
│  │     })                                                          │
│  │                                                                   │
│  └─ 4️⃣  Salva Delivery no MongoDB ✅                               │
│                                                                       │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ↓
                  MongoDB - Delivery
                  {
                    _id: ObjectId,
                    orderId: ObjectId,
                    motoboyId: null,    (ainda)
                    status: "pending",
                    fee: 5.00,
                    distance: 2.3,
                    pinRetirada: "123456",
                    pin: "654321",
                    storeAddress: "Av. Paulista...",
                    storeLatitude: -23.561414,
                    storeLongitude: -46.656139,
                    customerAddress: "Rua A, 100...",
                    customerLatitude: -23.550520,
                    customerLongitude: -46.633309,
                    routePolyline: "kq`vFp\\icVmAqFqA..."
                  }
```

## 3. Motoboy Receiving Delivery

```
┌──────────────────────────────────────────────────────────────────────┐
│                  MOTOBOY (APP/WEB)                                   │
│                                                                       │
│  🏍️ Notificação: "Nova entrega disponível!"                         │
│                                                                       │
│  Entrega #12345                                                      │
│  ├─ Distância: 2.3 km                                               │
│  ├─ Taxa: R$ 5,00                                                   │
│  └─ [✓ Aceitar]  [✗ Rejeitar]                                       │
│                                                                       │
│                         │                                             │
│                         │ PUT /deliveries/{id}/status                │
│                         │ { status: 'assigned' }                     │
└─────────────────────────┼──────────────────────────────────────────┘
                           │
                           ↓
┌──────────────────────────────────────────────────────────────────────┐
│                 MOTOBOY ROUTE PAGE (/delivery/{id})                  │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ 📋 DETALHES DA ENTREGA                                         │ │
│  │                                                                 │ │
│  │ Status: 🎯 Aguardando Retirada                                │ │
│  │ Taxa: R$ 5,00                                                 │ │
│  │ Distância: 2.3 km                                             │ │
│  │                                                                 │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │ 📍 RETIRADA NA LOJA                                            │ │
│  │ Av. Paulista, 1000 - SP                                       │ │
│  │ Contato: loja@email.com | 11 98765-4321                       │ │
│  │                                                                 │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │ 🚚 ENTREGA NO CLIENTE                                          │ │
│  │ Rua A, 100 - Bairro B, SP                                     │ │
│  │ Contato: joao@email.com | 11 91234-5678                       │ │
│  │                                                                 │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │ 🗺️ ROTA DE ENTREGA                                             │ │
│  │                                                                 │ │
│  │   ┌──────────────────────────────────────────────────────┐   │ │
│  │   │                                                      │   │ │
│  │   │    📍 Você está aqui (GPS)                           │   │ │
│  │   │                                                      │   │ │
│  │   │    ━━━━━━━━━━━━━━━━━━━━━━━━━ (rota)               │   │ │
│  │   │                                                      │   │ │
│  │   │    📦 LOJA ABC                                       │   │ │
│  │   │       Av. Paulista, 1000                            │   │ │
│  │   │                                                      │   │ │
│  │   │   Distância: 2.3 km                                 │   │ │
│  │   │   Tempo: 7 min                                       │   │ │
│  │   │                                                      │   │ │
│  │   └──────────────────────────────────────────────────────┘   │ │
│  │                                                                 │ │
│  │   🔐 PIN PARA RETIRADA: 123456                               │ │
│  │   Informe este PIN à loja para autorizar a retirada          │ │
│  │                                                                 │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  [Retirado na Loja]                                                 │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘


        Após digitar PIN (status muda para 'picked'):
        
┌────────────────────────────────────────────────────────────────────┐ │
│ Status: 🚗 Em Trânsito                                             │ │
│                                                                     │ │
│ ┌──────────────────────────────────────────────────────────────┐  │ │
│ │                                                              │  │ │
│ │    📍 Você está aqui (GPS)                                  │  │ │
│ │                                                              │  │ │
│ │    ━━━━━━━━━━━━━━━━━━━━━━━━━ (rota ATUALIZADA)            │  │ │
│ │                                                              │  │ │
│ │    👤 JOÃO SILVA                                            │  │ │
│ │       Rua A, 100 - Bairro B, SP                            │  │ │
│ │                                                              │  │ │
│ │   Distância: 1.8 km                                         │  │ │
│ │   Tempo: 5 min                                              │  │ │
│ │                                                              │  │ │
│ └──────────────────────────────────────────────────────────────┘  │ │
│                                                                     │ │
│ Rota até o cliente para entrega                                   │ │
│                                                                     │ │
│ Informe o PIN do cliente para finalizar: [________]              │ │
│                                                                     │ │
│ [✓ Finalizar Entrega]                                            │ │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

## 4. Dados Armazenados vs. Tempo Real

```
┌─────────────────────────────────────────────────────────────┐
│           DADOS ARMAZENADOS (Snapshot)                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Order/Delivery criados em: MARÇO 12, 14:30                │
│  ├─ customerAddress: "Rua A, 100 - Bairro B, SP"         │
│  ├─ customerLatitude: -23.550520                          │
│  └─ customerLongitude: -46.633309                         │
│                                                              │
│  IMUTÁVEIS ❌ Não mudam mais                               │
│                                                              │
└────────────────────────┬────────────────────────────────────┘
                        │
        ┌───────────────┴──────────────┐
        │                              │
        ↓                              ↓
┌─────────────────┐          ┌─────────────────┐
│  Cliente muda   │          │  Motoboy acessa │
│  seu endereço   │          │  em MARÇO 12    │
│  em MARÇO 14    │          │  19:00          │
│                 │          │                 │
│ customer.       │          │ delivery.       │
│ mainAddress     │          │ customerAddress │
│                 │          │                 │
│ "Rua B, 200..." │          │ "Rua A, 100..." │
│ (NOVO)          │          │ (ORIGINAL) ✅   │
│                 │          │                 │
│ ❌ Errado       │          │ ✅ Correto      │
└─────────────────┘          └─────────────────┘
        │                              │
        └──────────────┬───────────────┘
                       │
                    Se usássemos
                  customer.mainAddress:
                  Motoboy iria para
                  endereço ERRADO! ❌
                
                  Se usamos delivery.:
                  Motoboy vai para
                  endereço ORIGINAL ✅
```

## 5. Status & Rota - Mudanças Dinâmicas

```
Timeline da Entrega:

MARÇO 12, 14:30
│
├─ 🟢 Status: pending
│  └─ Delivery está disponível para motoboys
│
MARÇO 12, 14:35
│
├─ 🟡 Status: assigned
│  └─ Motoboy aceitou
│  └─ 🗺️ Rota: Motoboy → LOJA
│  
│  Mapa mostra:
│  ┌──────────────────┐
│  │ 📍 MOTOBOY       │
│  │  ━━━━━━━━━→      │
│  │        📦 LOJA   │
│  └──────────────────┘
│
MARÇO 12, 15:00 (Motoboy chega na loja, digita PIN)
│
├─ 🔵 Status: picked
│  └─ Motoboy retirou da loja
│  └─ 🗺️ Rota: MUDA para Motoboy → CLIENTE ✨
│
│  Mapa MUDA para:
│  ┌──────────────────┐
│  │ 📍 MOTOBOY       │
│  │  ━━━━━━━━━→      │
│  │   👤 CLIENTE     │
│  └──────────────────┘
│
MARÇO 12, 15:10 (Motoboy chega no cliente, finaliza)
│
├─ 🟢 Status: delivered
│  └─ Entrega finalizada
│  └─ 🗺️ Rota: Não precisa mais
│
│  Mapa mostra:
│  ┌──────────────────┐
│  │ ✅ ENTREGUE      │
│  │  em 40 minutos   │
│  └──────────────────┘


KEY INSIGHT:
==============

A rota (polyline) é CALCULADA UMA VEZ
quando o Order é criado.

Mas qual ROTA é EXIBIDA depende do
STATUS da Delivery:

  status = 'assigned' → Mostra: Store lat/lng
  status = 'picked'   → Mostra: Customer lat/lng

O usuário vê a mudança de rota sem
recalcular (só muda o destino do MotoboyRouteMap).
```

## 6. Integração com Google Maps

```
┌──────────────────────────────────────────────────────────┐
│         Google Maps Directions API                       │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Request:                                               │
│  ├─ origin: -23.561414,-46.656139 (Loja)              │
│  ├─ destination: -23.550520,-46.633309 (Cliente)      │
│  ├─ mode: 'driving'                                    │
│  └─ key: GOOGLE_MAPS_API_KEY                           │
│                                                          │
│          ↓ (processamento Google)                        │
│                                                          │
│  Response:                                              │
│  ├─ status: "OK"                                        │
│  ├─ routes: [                                           │
│  │   {                                                  │
│  │     overview_polyline: {                            │
│  │       points: "kq`vFp\\icVmAqFqA..."  ← SALVAR!   │
│  │     },                                              │
│  │     legs: [{                                        │
│  │       distance: { value: 2300 },  (metros)         │
│  │       duration: { value: 420 },   (segundos)       │
│  │       steps: [...]                 (instruções)     │
│  │     }]                                              │
│  │   }                                                  │
│  │ ]                                                    │
│  │                                                      │
│  └─ ✅ Salva em Order.routePolyline                    │
│     └─ Copia para Delivery.routePolyline               │
│        └─ Envia para frontend                          │
│           └─ MotoboyRouteMap.tsx renderiza             │
│                                                          │
│  Frontend:                                              │
│  ├─ new DirectionsService()                            │
│  ├─ new DirectionsRenderer()                           │
│  ├─ directionsRenderer.setMap(map)                     │
│  └─ directionsService.route({                          │
│     origin: { lat, lng },                              │
│     destination: { lat, lng },                         │
│     travelMode: 'DRIVING'                              │
│  })                                                     │
│  └─ Desenha polyline no mapa em tempo real             │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

**Todos esses diagramas ajudam a entender o fluxo completo!**
