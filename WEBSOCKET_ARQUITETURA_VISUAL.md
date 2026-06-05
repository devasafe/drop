# 🎯 ARQUITETURA WEBSOCKET - DIAGRAMA VISUAL E FLUXOS

---

## 1. ARQUITETURA GERAL

```
┌─────────────────────────────────────────────────────────────────────┐
│                          INTERNET                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   CLIENT A (Browser)          CLIENT B (Browser)       CLIENT C    │
│   ┌──────────────┐           ┌──────────────┐      ┌──────────┐   │
│   │ React App    │           │ React App    │      │ Motoboy  │   │
│   │ useSocket()  │◄─────────►│ useSocket()  │      │ App      │   │
│   │ useRealTime()│ WebSocket │ useRealTime()│      └──────────┘   │
│   └──────────────┘           └──────────────┘                      │
│          │                           │                              │
│          └───────────────┬───────────┘                              │
│                          │                                          │
│                   Socket.IO Protocol                                │
│                  (ws:// or wss://)                                  │
│                          │                                          │
│          ┌───────────────┴───────────────┐                         │
│          │                               │                         │
│   ┌──────▼──────────────────────────────▼────┐                    │
│   │      Socket.IO Server (Node.js)          │                    │
│   │      Namespaces & Rooms                  │                    │
│   │      ├─ /orders                          │                    │
│   │      ├─ /deliveries                      │                    │
│   │      ├─ /wallets                         │                    │
│   │      └─ /motoboys                        │                    │
│   │                                           │                    │
│   │      Rooms por usuário:                  │                    │
│   │      ├─ user:123 (cliente)               │                    │
│   │      ├─ user:456 (lojista)               │                    │
│   │      ├─ user:789 (motoboy)               │                    │
│   │      ├─ store:999 (loja)                 │                    │
│   │      └─ motoboys (todos motoboys)        │                    │
│   │                                           │                    │
│   │      socketEmitter.ts                    │                    │
│   │      ├─ emitOrderCreated()               │                    │
│   │      ├─ emitDeliveryAssigned()           │                    │
│   │      ├─ emitWalletUpdated()              │                    │
│   │      └─ emitToRoom()                     │                    │
│   │                                           │                    │
│   └─────────────────┬────────────────────────┘                    │
│                     │                                              │
│      ┌──────────────┴──────────────┐                              │
│      │                             │                              │
│  Controllers                  Database                             │
│  ├─ orderController.ts        (MongoDB)                           │
│  ├─ deliveryController.ts                                         │
│  ├─ walletController.ts                                           │
│  ├─ cancellationController.ts                                     │
│  └─ emit após salvar!                                             │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## 2. FLUXO DE EVENTOS - EXEMPLO: CLIENTE CRIA PEDIDO

```
┌─────────────────────────────────────────────────────────────────────┐
│           CLIENTE A CRIA PEDIDO - REAL-TIME UPDATE                 │
└─────────────────────────────────────────────────────────────────────┘

T+0ms:
│
├─ CLIENT A
│  └─ POST /orders
│     ├─ { storeId, products, address }
│     └─ [Enviando REQUEST]
│
├─ BACKEND
│  └─ orderController.createOrder()
│     ├─ Validação ✓
│     ├─ Stock ✓
│     ├─ Wallet ✓
│     ├─ Cria Order (MongoDB) ✓
│     └─ emitOrderCreated(order)  ◄─── IMPORTANTE!
│

T+100ms  (Resposta retorna ao cliente)
│
├─ CLIENT A
│  └─ Recebe response com orderId
│     └─ Atualiza UI: "Pedido criado!"
│

T+150ms  (Socket event é processado)
│
├─ SERVER
│  └─ Executa: emitToRoom('store:999', 'order:created', {
│        orderId: '123',
│        totalValue: 112,
│        status: 'criado',
│        ...
│     })
│

T+200ms  (WebSocket broadcast atinge todos na room)
│
├─ LOJISTA (CLIENT B) [conectado no room store:999]
│  └─ Socket listener: socket.on('order:created', (data) => {
│        setOrders([...orders, data])  ◄─ estado atualizado
│        UI re-render instantaneamente
│     })
│
│  └─ Vê na página: "📬 Novo pedido!"
│     └─ SEM precisar fazer F5! ✅
│
└─ MOTOBOY (CLIENT C) [conectado no room 'motoboys']
   └─ (ainda não recebe, está aguardando delivery ser criada)

═════════════════════════════════════════════════════════════════════

T+300ms (lojista clica "Aceitar")
│
├─ LOJISTA
│  └─ POST /orders/123/accept
│
├─ BACKEND
│  └─ orderController.acceptOrderByStore()
│     ├─ Order.status: 'criado' → 'pago'
│     ├─ Cria Delivery
│     ├─ emitOrderUpdated(order)
│     └─ emitToRoom('motoboys', 'delivery:available', {...})
│
├─ CLIENT A (CLIENTE) [connectado em user:123]
│  └─ socket.on('order:updated', (data) => {
│        order.status = 'pago'
│        UI mostra: "Loja aceitou!" ✅
│     })
│
└─ CLIENT C (MOTOBOY) [conectado em 'motoboys']
   └─ socket.on('delivery:available', (data) => {
        addNewDeliveryToList(data)
        showNotification("🚗 Nova entrega R$ 12!") 🔔
        UI mostra: Fee, distance, location
      })

═════════════════════════════════════════════════════════════════════

T+400ms (motoboy clica "Aceitar entrega")
│
├─ MOTOBOY
│  └─ POST /deliveries/456/claim
│
├─ BACKEND
│  └─ deliveryController.claimDelivery()
│     ├─ Atomic: Delivery.motoboyId = motoboy
│     ├─ emitDeliveryAssigned(delivery, motoboy)
│
├─ CLIENT A (CLIENTE) [conectado em user:123]
│  └─ socket.on('delivery:assigned', (data) => {
│        delivery.motoboyName = "João Silva"
│        delivery.motoboyRating = 4.8
│        delivery.motoboyPhone = "11999999999"
│        UI mostra: 
│          "🚗 Motoboy a caminho!"
│          "João Silva ⭐4.8 | 📞 Ligar"
│     })
│
└─ CLIENT B (LOJISTA) [conectado em store:999]
   └─ socket.on('delivery:assigned', (data) => {
        delivery.motoboyName = "João Silva"
        UI mostra: "João foi para loja"
      })

═════════════════════════════════════════════════════════════════════
RESULTADO:
├─ Cliente A: viu pedido atualizar de 'criado' → 'pago' → 'entregue'
├─ Lojista B: viu pedido chegar E motoboy ser atribuído
├─ Motoboy C: recebeu notificação e aceitou entrega
└─ NINGUÉM PRECISOU FAZER F5! ✅✅✅
```

---

## 3. FLUXO DE WALLET - TEMPO REAL

```
┌─────────────────────────────────────────────────────────────────────┐
│            CARTEIRA ATUALIZA EM TEMPO REAL                         │
└─────────────────────────────────────────────────────────────────────┘

CENÁRIO: Cliente faz pedido
├─ Ante: User Wallet = R$ 200

T+0ms: POST /orders (Create)
│
├─ BACKEND
│  └─ Wallet(user).balance -= 112
│     ├─ Valida balance ✓
│     ├─ Sala operação (transação)
│     ├─ emitWalletUpdated('user:123', {
│        │  balance: 88,
│        │  lastTransaction: { type: 'debit', amount: 112, ... }
│        └─ })
│
├─ CLIENT (Página my-wallet.tsx)
│  └─ useRealTime('wallet:updated', (data) => {
│       setWallet(data);  ◄─ estado atualizado
│       // Animação: saldo anterior 200 → novo 88
│     })
│
│  └─ Mostra na UI:
│     ├─ Saldo: R$ 88 ✅
│     ├─ Histórico + Debit R$ 112 para pagamento
│     └─ Animation: "Sua carteira foi atualizada" 💰
│

T+300ms: REFUND (Pedido cancelado)
│
├─ BACKEND
│  └─ POST /orders/123/cancel
│     ├─ Wallet(user).balance += 112
│     ├─ emitWalletUpdated('user:123', {
│        │  balance: 200,  ◄─ voltou!
│        │  lastTransaction: { type: 'refund', amount: 112, ... }
│        └─ })
│
└─ CLIENT (Página meu-wallet.tsx)
   └─ socket.on('wallet:updated', (data) => {
        // Sem delay! Recebe em < 100ms
        setWallet(data);
        showAnimation("✅ Reembolso processado!");
        // Saldo atualiza: 88 → 200
      })

═════════════════════════════════════════════════════════════════════

PADRÃO:

  Ação no Backend          →  emitWalletUpdated()  →  Client atualiza
  ├─ Order created              (88)                   UI renovado
  ├─ Order refunded              (200)                 Sem delay
  ├─ Transfer                    (175)                 < 100ms
  ├─ Deposit                     (300)
  ├─ Withdrawal                  (250)
  └─ Delivery bonus              (262)
```

---

## 4. FLUXO DE CANCELAMENTO - IMPACTANDO 3 USUÁRIOS

```
┌─────────────────────────────────────────────────────────────────────┐
│        CANCELAMENTO: Impacta Cliente, Loja E Motoboy Simultaneamente│
└─────────────────────────────────────────────────────────────────────┘

CLIENTE cancela pedido (Delivery em 'picked' = motoboy tem produto!)
│
T+0ms:
├─ CLIENT A (Cliente)
│  └─ POST /orders/123/cancel
│     └─ { reason: 'customer_request' }
│
├─ BACKEND
│  └─ cancellationController.cancelOrderByCustomer()
│     ├─ Order.status: 'enviado' → 'cancelado'
│     ├─ Wallet refund: +112
│     ├─ Stock revert: +2 unidades
│     │
│     └─ emitOrderCancelled(order, cancellation)
│        ├─ emitToRoom('user:123', 'order:cancelled', {...})
│        ├─ emitToRoom('store:999', 'order:cancelled', {...})
│        └─ emitToRoom('user:789', 'delivery:cancelled', {...})
│
├─ CLIENT A (CLIENTE) → room 'user:123'
│  └─ socket.on('order:cancelled', (data) => {
│       order.status = 'cancelado'
│       wallet.balance += 112  ◄─ refund aparece IMEDIATAMENTE
│       UI mostra:
│         "❌ Pedido cancelado"
│         "✅ R$ 112 reembolsados para sua carteira"
│     })
│
├─ CLIENT B (LOJISTA) → room 'store:999'
│  └─ socket.on('order:cancelled', (data) => {
│       // Remove pedido da lista
│       orders = orders.filter(o => o._id !== data.orderId)
│       // Stock volta
│       Product.quantity += 2
│       UI mostra:
│         "❌ Pedido cancelado pelo cliente"
│         "📦 Estoque revertido (2 unidades)"
│     })
│
└─ CLIENT C (MOTOBOY) → room 'user:789'
   └─ socket.on('delivery:cancelled', (data) => {
        // Entrega é removida
        delivery.status = 'cancelled'
        // Volta a aceitar outras entregas
        activeDelivery = null
        
        // ⚠️ Se motoboy já pegou o produto:
        //    Log para admin: "Motoboy tem produto, marcar como retorno"
        
        UI mostra:
          "⚠️ Entrega foi cancelada"
          "Contate o atendimento se já pegou o produto"
      })

═════════════════════════════════════════════════════════════════════

RESULTADO:
├─ Cliente: vê cancelamento + refund em tempo real
├─ Lojista: remarcação automática do estoque
├─ Motoboy: notificado que entrega foi cancelada
└─ Tudo acontece em < 200ms (WebSocket é MUITO rápido!)
```

---

## 5. FLUXO DE NOTIFICAÇÕES - VISUAL

```
┌─────────────────────────────────────────────────────────────────────┐
│              NOTIFICAÇÃO EM TEMPO REAL (Toast)                      │
└─────────────────────────────────────────────────────────────────────┘

EXEMPLO: Lojista recebe novo pedido

Antes (sem WebSocket):
├─ Lojista deixa página aberta
├─ Cliente cria pedido em outra aba
├─ Lojista não vê (precisa fazer F5)
├─ Demora vários minutos
└─ Cliente: "Por que ninguém aceita meu pedido?" 😞

Depois (com WebSocket + Toast):
├─ Lojista deixa página aberta
├─ Cliente cria pedido
├─ Socket.IO envia 'order:created'
├─ Frontend mostra Toast:
│  ┌─────────────────────────────────────┐
│  │  📬 Novo Pedido!                    │
│  │  Cliente: João Silva                │
│  │  Valor: R$ 112                      │
│  │  Clique Para Ver                    │
│  └─────────────────────────────────────┘
│     ↓ (auto-fecha em 10s ou ao clicar)
│
├─ Lojista clica → abre pedido
└─ Aceitação imediata ✅

═════════════════════════════════════════════════════════════════════

MÚLTIPLAS NOTIFICAÇÕES:

  16:42  ┌─────────────────────┐
         │ 📬 Novo Pedido!     │
         │ R$ 112              │
         └─────────────────────┘
           ↓ (clica para detalhe)

  16:45  ┌─────────────────────┐
         │ 🚗 Entrega atribuída│
         │ João Silva (⭐4.8)   │
         │ ETA: 15min          │
         └─────────────────────┘

  16:47  ┌─────────────────────┐
         │ 🎁 Pedido saiu loja │
         │ João em rota        │
         └─────────────────────┘

  16:55  ┌─────────────────────┐
         │ ✅ Entregue!        │
         │ Clique para avaliar │
         └─────────────────────┘
```

---

## 6. ROOMS & NAMESPACES VISUALMENTE

```
┌──────────────────────────────────────────────────────────────────┐
│                  SOCKET.IO HIERARCHY                             │
└──────────────────────────────────────────────────────────────────┘

io (Main namespace /)
│
├─ Rooms:
│  ├─ user:123
│  │  └─ Socket(Cliente A)
│  │  └─ Socket(Cliente A - Tab 2)
│  │  └─ Socket(Lojista B - se admin)
│  │
│  ├─ user:456
│  │  └─ Socket(Lojista)
│  │
│  ├─ user:789
│  │  └─ Socket(Motoboy 1)
│  │  └─ Socket(Motoboy 1 - Tab 2)
│  │
│  ├─ user:999
│  │  └─ Socket(Motoboy 2)
│  │
│  ├─ store:999
│  │  └─ Socket(Lojista - via store)
│  │  └─ Socket(Admin da loja)
│  │
│  └─ motoboys (broadcast para TODOS os motoboys)
│     ├─ Socket(Motoboy 1)
│     ├─ Socket(Motoboy 2)
│     ├─ Socket(Motoboy 3)
│     └─ Socket(Motoboy N)

EXEMPLO: emitToRoom('motoboys', 'delivery:available', {...})
│
└─ ✅ Broadcast para TODOS os N motoboys simultaneamente
   └─ Cada um recebe em < 100ms
   └─ Notificação push opcional: "🚗 Nova entrega!"

REGRA: Cada usuário entra em seus rooms ao conectar:
├─ socket.emit('join_room', { userId: user.id, role: user.role })
├─ Backend: socket.join(`${role}:${userId}`)
├─ Backend: if (role === 'motoboy') socket.join('motoboys')
└─ Agora recebe eventos direcionados
```

---

## 7. TIMING - COMPARAÇÃO

```
┌──────────────────────────────────────────────────────────────────┐
│              ANTES (SEM WEBSOCKET) vs DEPOIS                     │
└──────────────────────────────────────────────────────────────────┘

AÇÃO: Lojista aceita pedido
═════════════════════════════════════════════════════════════════

ANTES (Polling tradicional):
├─ T+0ms: POST /orders/123/accept
├─ T+100ms: Response OK
├─ T+100ms: Cliente começa a fazer polling (a cada 5 segundos)
├─ T+100-5000ms: Status continua 'pago' (aguardando próximo poll)
├─ T+5100ms: Primeiro poll → status atualizado para 'entregue'
│
└─ DELAY TOTAL: 5000ms (5 SEGUNDOS) ❌

DEPOIS (WebSocket):
├─ T+0ms: POST /orders/123/accept
├─ T+100ms: Response OK
├─ T+100ms: emitOrderUpdated() envia WebSocket
├─ T+150ms: Cliente recebe e re-render
│
└─ DELAY TOTAL: 50ms (quase instantâneo!) ✅

DIFERENÇA: 5000ms - 50ms = 4950ms MAIS RÁPIDO (100x!)

═════════════════════════════════════════════════════════════════

AÇÃO: Motoboy é atribuído a entrega
═════════════════════════════════════════════════════════════════

ANTES:
├─ Cliente vê "Entrega aguardando" por 5-10 segundos
├─ Confuso: "Está tentando encontrar um motoboy?"
├─ "Alguém vai aceitar?"
└─ ❌ UX RUIM

DEPOIS:
├─ Cliente vê "🚗 Motoboy a caminho!" em < 1 segundo
├─ Com nome: "João Silva (⭐4.8)"
├─ Com telefone para ligar
└─ ✅ UX EXCELENTE, TUDO CLARO
```

---

## 8. CÓDIGO FLOW - MAPA MENTAL

```
                             ┌──────────────┐
                             │   Browser    │
                             │  React Page  │
                             │ my-wallet.tsx│
                             └──────┬───────┘
                                    │
                        ┌───────────┴────────────┐
                        │                        │
                   useSocket()             useRealTime()
                        │                        │
          ┌─────────────┴──┬──────────┐         │
          │                │          │         │
    connect()         join_room   listen    wallet:updated
          │                │          │         │
          │                │          │         ▼
    ┌─────▼────┬───────────┼──────────┼──────────────┐
    │ Socket.IO │ user:123  │ 'wallet' │ callback({} │
    │  Client   │ motoboys  │ 'order'  │   setWallet)
    │           │           │          └──────┬──────┘
    └─────┬─────┴───────────┴──────────┘       │
          │                              refetch()
          │                                    │
          │ WebSocket (ws://)                  │
          │ Real-time 2-way                    │
          │                                    │
    ┌─────▼──────────────────────────────────────┐
    │      Socket.IO Server (Node.js)            │
    │      io.on('connection', (socket) => {...})│
    │      io.to('user:123').emit('wallet:...')  │
    └─────┬──────────────────────────────────────┘
          │
    socket.emit()
          │
    ┌─────▼──────────────────────────────────────┐
    │        Controller → DB Operation           │
    │        walletController.transfer()          │
    │        Wallet.findIdAndUpdate()             │
    │        emitWalletUpdated()                  │
    └──────────────────────────────────────────────┘
```

---

## 9. VERIFICAÇÃO - COMO SABER QUE ESTÁ FUNCIONANDO

```
VERIFICAR NO BROWSER (DevTools):
═════════════════════════════════════════════════════════════════

1. Abrir DevTools (F12)
   └─ Tab "Network"

2. Filtrar por "WS" (WebSocket)
   └─ Deve aparecer connection: ws://localhost:5000/socket.io/

3. Procurar por eventos emitidos:
   └─ Deve ver frames como:
      - {"sid":"...","upgrades":["websocket"],...}
      - {"type":2,"nsp":"/","data":["join_room",{...}]}
      - {"type":2,"nsp":"/","data":["wallet:updated",{...}]}

4. Abrir 2 abas (Cliente A e B):
   └─ Criar pedido em A
   └─ Deve aparecer instantaneamente em B (SEM F5)


VERIFICAR NO TERMINAL:
═════════════════════════════════════════════════════════════════

Backend logs deve mostrar:
├─ ✅ Cliente conectado: <socket-id>
├─ 📍 Socket entrou em user:123
├─ 📤 order:created → store:999
├─ 📤 delivery:available → motoboys
└─ ✅ Tudo funcionando!

Frontend console:
├─ 🔌 Conectando ao Socket.IO...
├─ ✅ Socket conectado ao servidor
├─ 👂 Escutando evento: wallet:updated
├─ 📩 Recebido wallet:updated: {...}
└─ ✅ Tudo funcionando!
```

---

**Diagrama e Arquitetura Completa - Pronto para Implementação!** 🚀

Próxima passo: Seguir [PROMPT_WEBSOCKET_REALTIME.md](PROMPT_WEBSOCKET_REALTIME.md) e implementar passo a passo.
