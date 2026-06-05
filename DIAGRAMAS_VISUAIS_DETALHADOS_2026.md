# 🎨 DIAGRAMAS VISUAIS E FLUXOS DO SISTEMA

**Data**: 11 de Março de 2026  
**Propósito**: Visualizações e fluxogramas dos principais processos

---

## 1️⃣ Arquitetura Geral do Sistema

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          INTERNET / CLIENTES                                  │
└────────────┬────────────────────────────────────────────────────────────────┬─┘
             │                                                                │
    ┌────────▼─────────┐                                          ┌──────────▼──────┐
    │   Frontend       │                                          │  Mobile App?     │
    │  Next.js (3000)  │                                          │  (Futura)        │
    │ - React 19       │                                          │                  │
    │ - TypeScript     │◄──────────────HTTP + WebSocket ─────────►                 │
    │ - Pages Router   │                                          │ (Socket.IO)      │
    └────────┬─────────┘                                          └──────────┬──────┘
             │                                                               │
             └───────────────────────┬──────────────────────────────────────┘
                                     │
                    ┌────────────────▼────────────────┐
                    │                                 │
        ┌───────────▼──────────────┐   ┌─────────────▼──────────┐
        │  BACKEND - API Server    │   │  Socket.IO Server      │
        │  Express.js (3001)       │   │  (Real-time eventos)   │
        │                          │   │                        │
        │  ┌────────────────────┐  │   │  ┌──────────────────┐  │
        │  │   Routes (13+)     │  │   │  │  Event Handlers  │  │
        │  ├─ /auth             │  │   │  ├─ order:new      │  │
        │  ├─ /orders           │  │   │  ├─ delivery:*     │  │
        │  ├─ /deliveries       │  │   │  ├─ payment:*      │  │
        │  ├─ /wallets          │  │   │  └─ ...            │  │
        │  ├─ /products         │  │   │                    │  │
        │  ├─ /stores           │  │   │  ┌──────────────┐  │  │
        │  ├─ /admin            │  │   │  │  Room Mgmt   │  │  │
        │  └─ ...               │  │   │  ├─ user:*      │  │  │
        │                       │  │   │  ├─ store:*     │  │  │
        │  ┌────────────────────┐  │   │  └─ ...         │  │  │
        │  │ Controllers (17)   │  │   │                 │  │  │
        │  ├─ authController   │  │   └─────────────────┘  │  │
        │  ├─ orderController  │  │                        │  │
        │  ├─ walletController │  │                        │  │
        │  └─ ...              │  │                        │  │
        │                      │  │                        │  │
        │  ┌────────────────────┐  └────────────────────────┘  │
        │  │ Middleware (6)     │                              │
        │  ├─ authenticate     │                              │
        │  ├─ authorize        │                              │
        │  ├─ validate         │                              │
        │  ├─ rateLimit        │                              │
        │  └─ errorHandler     │                              │
        │                      │                              │
        │  ┌────────────────────┐                             │
        │  │ Services/Utils     │                             │
        │  ├─ walletCalcs      │                             │
        │  ├─ socketEmitter    │                             │
        │  └─ ...              │                             │
        └────────┬─────────────┘                             │
                 │                                           │
    ┌────────────▼────────────────┐                          │
    │                             │                          │
    │  ┌──────────────────────┐   │    ┌────────────────┐   │
    │  │ Models (15)          │   │    │ Jobs/Cron      │   │
    │  ├─ User               │   │    ├─ deliveryTimeout│   │
    │  ├─ Order              │   │    └─ ...           │   │
    │  ├─ Wallet             │   │                     │   │
    │  ├─ Delivery           │   │    ┌────────────────┐   │
    │  ├─ Store              │   │    │ Config         │   │
    │  ├─ Product            │   │    ├─ env.ts        │   │
    │  ├─ Category           │   │    └─ ...           │   │
    │  ├─ Cancellation       │   │                     │   │
    │  ├─ Notification       │   │    ┌────────────────┐   │
    │  ├─ Gamification       │   │    │ Validation     │   │
    │  ├─ Transaction        │   │    ├─ schemas.ts    │   │
    │  ├─ WithdrawalRequest  │   │    └─ ...           │   │
    │  ├─ PricingPlan        │   │                     │   │
    │  └─ ... (3 mais)       │   │                     │   │
    │                        │   │                     │   │
    │    │                   │   │                     │   │
    │    └────────┬──────────┘   │                     │   │
    │             │              │                     │   │
    └─────────────┼──────────────┘                     │   │
                  │                                    │   │
            ┌─────▼────────────────────────────────────┘   │
            │                                              │
        ┌───▼───────────────────────────┐                 │
        │   MongoDB (localhost:27017)   │                 │
        │                               │                 │
        │  Databases:                   │                 │
        │  ├─ drop (default)            │                 │
        │  │  ├─ users (45 docs)        │                 │
        │  │  ├─ orders (150 docs)      │                 │
        │  │  ├─ wallets (100 docs)     │                 │
        │  │  ├─ stores (20 docs)       │                 │
        │  │  ├─ products (200 docs)    │                 │
        │  │  ├─ deliveries (150 docs)  │                 │
        │  │  ├─ ... (9 mais coleções)  │                 │
        │  │                            │                 │
        │  └─ Índices:                  │                 │
        │     ├─ users.email            │                 │
        │     ├─ orders.customerId      │                 │
        │     ├─ wallets.owner          │                 │
        │     └─ ...                    │                 │
        │                               │                 │
        └───────────────────────────────┘                 │
                                                          │
        ┌─────────────────────────────────────────────┐   │
        │  Infraestrutura (Docker)                    │   │
        ├─────────────────────────────────────────────┤   │
        │ - Node container (backend)                  │   │
        │ - MongoDB container                         │   │
        │ - Redis (para cache/sessions) [TODO]        │   │
        └─────────────────────────────────────────────┘   │
                                                          │
        ┌─────────────────────────────────────────────┐   │
        │  Monitoramento [TODO]                       │   │
        ├─────────────────────────────────────────────┤   │
        │ - Winston Logger (todos os servidores)      │   │
        │ - Sentry (error tracking) [TODO]            │   │
        │ - DataDog (APM) [TODO]                      │   │
        └─────────────────────────────────────────────┘   │
```

---

## 2️⃣ Hierarquia de Roles e Permissões

```
┌────────────────────────────────────────────────────────────────┐
│                    HIERARCHIA DE ROLES                          │
└────────────────────────────────────────────────────────────────┘

                          ┌────────────┐
                          │    CEO     │  ← Super Admin
                          │ (Dono da   │    - Acesso total
                          │ Plataforma)│    - Gerenciar usuários
                          └─────┬──────┘    - Configurar plataforma
                                │            - Ver métricas globais
                    ┌───────────┼───────────┐
                    │           │           │
            ┌───────▼──┐  ┌─────▼──┐  ┌───▼──────┐
            │ Marketing│  │Gerente │  │ Gerente  │
            │          │  │ Geral  │  │ Clientes │
            └──────────┘  └────────┘  └──────────┘
                    │           │           │
                    └───────────┼───────────┘
                                │
                    ┌───────────┼───────────┐
                    │           │           │
            ┌───────▼──┐  ┌─────▼──┐  ┌───▼──────┐
            │ Gerente  │  │ Gerente│  │ Lojista  │
            │ Lojistas │  │ Moto   │  │          │
            │          │  │ boys   │  │ (Dono de │
            └──────────┘  └────────┘  │  Loja)   │
                                      └─────┬────┘
                                            │
                                    ┌───────┴────────┐
                                    │                │
                            ┌───────▼────┐   ┌──────▼────┐
                            │  Cliente   │   │  Motoboy  │
                            │ (Comprador)│   │(Entregador)│
                            └────────────┘   └───────────┘

┌────────────────────────────────────────────────────────────────┐
│                  PERMISSÕES POR ROLE                            │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│ CEO: ✅ TUDO                                                   │
│  └─ user:ban, user:promote, store:*,* config:*,* metrics:*  │
│                                                                │
│ Marketing: (Limitado)                                         │
│  └─ notifications:broadcast, analytics:view, reports:view   │
│                                                                │
│ Gerente Geral: (Visão de tudo)                                │
│  └─ users:view, stores:view, orders:view, metrics:view      │
│                                                                │
│ Gerente Clientes: (Suporte ao cliente)                        │
│  └─ users:view (clientes), orders:view, support:respond     │
│                                                                │
│ Gerente Lojistas: (Suporte a lojistas)                        │
│  └─ stores:view, users:view (lojistas), support:respond     │
│                                                                │
│ Gerente Motoboys: (Suporte a motoboys)                        │
│  └─ deliveries:view, users:view (motoboys), support:respond │
│                                                                │
│ Lojista: (Dono de loja)                                       │
│  └─ store:view-own, products:*, orders:view-own,            │
│     wallet:view-own, settings:edit-store                    │
│                                                                │
│ Cliente: (Comprador)                                          │
│  └─ orders:create, orders:view-own, wallet:view-own,        │
│     delivery:track, store:rate, product:search              │
│                                                                │
│ Motoboy: (Entregador)                                         │
│  └─ delivery:claim, delivery:update-own, wallet:view-own,   │
│     location:update, gamification:view                      │
│                                                                │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│           MÚLTIPLOS ROLES POR USUÁRIO                           │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│ Exemplo 1: Lojista que também compra                          │
│  roles: ['lojista', 'cliente']                               │
│  activeRole: 'lojista' ← determina permissões agora         │
│                                                                │
│ Quando activeRole = 'lojista':                                │
│  ✓ Pode criar produtos                                       │
│  ✓ Pode aceitar/rejeitar pedidos                             │
│  ✗ Não pode fazer compras (esconde produtos)                 │
│                                                                │
│ POST /api/auth/switch-role → activeRole = 'cliente'          │
│                                                                │
│ Agora:                                                        │
│  ✓ Pode fazer compras                                        │
│  ✗ Não pode administrar loja                                 │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 3️⃣ Fluxo de Pedido (Timeline Completa)

```
TIME     USER                ACTION                    SYSTEM STATE
────────────────────────────────────────────────────────────────────
0:00:00  Cliente             Clica "Checkout"
0:00:05                       POST /api/orders          [Validação]
0:00:10                       ├─ Valida JWT
0:00:15                       ├─ Valida schema Zod
0:00:20                       ├─ Busca produtos
0:00:25                       ├─ Valida estoque         ✅ Estoque OK
0:00:30                       ├─ Calcula preço
0:00:35                       ├─ Distribui wallet:
                              │  └─ Loja: 85
                              │  └─ CEO: 15
                              │  └─ Motoboy: 10
0:00:40                       ├─ Débita cliente         [Order: 'criado']
0:00:45                       ├─ Cria Order
0:00:50                       ├─ Emite socket
0:00:55  Lojista             Recebe notificação        🔔 "Novo pedido!"
0:01:00  Cliente             Vê confirmação            ✅ "Pedido criado!"
0:01:05                       Redireciona tracking
────────────────────────────────────────────────────────────────────
0:05:00  Lojista             Clica "Aceitar"
0:05:05                       PUT /orders/:id/accept    [Order: 'pago']
0:05:10                       ├─ Valida ownership
0:05:15                       ├─ Atualiza status
0:05:20                       ├─ Salva no DB
0:05:25                       ├─ Emite 'order:accepted'
0:05:30                       ├─ Emite 'delivery:available' para motoboys
0:05:35  Cliente             Recebe atualização        🔔 "Pedido aceito!"
0:05:40  Motoboys (3+)       Recebem notificação       🔔 "Entrega disponível"
────────────────────────────────────────────────────────────────────
0:10:00  Motoboy 1           Clica "Reivindicar"
0:10:05                       POST /deliveries/:id/claim [Delivery: 'coletada']
0:10:10                       ├─ Valida se não foi reivindicada
0:10:15                       ├─ Associa motoboyId
0:10:20                       ├─ Inicia timeout job (30 min)
0:10:25                       ├─ Emite 'delivery:claimed'
0:10:30  Motoboy 1           Mostra pickup location    📍 Loja no mapa
0:10:35  Motoboys 2,3        Notificação desaparece
────────────────────────────────────────────────────────────────────
0:20:00  Motoboy 1           Chega na loja
0:20:05                       PUT /deliveries/:id/status [Delivery: 'saiu']
0:20:10                       Coleta o pacote
0:20:15                       Clica "Saiu da Loja"      📍 Navega para cliente
────────────────────────────────────────────────────────────────────
0:30:00  Motoboy 1           Chega no cliente
0:30:05                       Backend envia SMS         📱 "PIN: 1234"
0:30:10  Cliente             Recebe SMS                🔔 PIN recebido
0:30:15  Motoboy 1           Pede PIN ao cliente
0:30:20  Cliente             Lê SMS, fala PIN          "1234"
0:30:25  Motoboy 1           Digita PIN                "1234"
0:30:30                       POST /deliveries/:id/finalizar
0:30:35                       ├─ Valida PIN             ✅ PIN correto
0:30:40                       ├─ Status: 'entregue'     [Delivery: 'entregue']
0:30:45                       ├─ Crédita saldo:
                              │  └─ Loja: +85
                              │  └─ CEO:  +15
                              │  └─ Motoboy: +10
0:30:50                       ├─ Cria Transaction records
0:30:55                       ├─ Adiciona pontos de gamificação
0:31:00                       └─ Emite 'delivery:completed'
0:31:05  Cliente             Notificação               🔔 "Entregue!"
0:31:10  Lojista             Notificação               🔔 "+85 BRL"
0:31:15  Motoboy 1           Notificação               🔔 "+10 BRL, +5 pts"
0:31:20  CEO Dashboard       Visualiza +15 BRL
────────────────────────────────────────────────────────────────────

TIMEOUT JOB (se ativado):
─────────────────────────
0:40:00  [Job executa a cada 5 min]
         Verifica deliveries com delivery:claimed
         Se motoboyId inativo > 30 min:
         ├─ libera entrega (motoboyId = null)
         ├─ refunda 10 BRL pro motoboy
         ├─ notifica motoboy sobre penalidade
         └─ outras motoboys podem reivindicar

CANCELAMENTO (a qualquer momento antes de 'entregue'):
───────────────────────────────────────────────────────
Cliente: PUT /orders/:id/cancel
├─ Cria Cancellation record
├─ Status Order: 'cancelado'
├─ Refund:
│  └─ Cliente: +95 BRL (totalValue + fee)
│  └─ Se Delivery já foi reivindicada:
│     └─ Motoboy: +10 BRL de penalidade
└─ Emite socket 'order:cancelled'

Lojista: PUT /orders/:id/reject
├─ Só se status = 'criado'
├─ Cria Cancellation record
├─ Refund automático
└─ Emite 'order:rejected'
```

---

## 4️⃣ Modelo de Dados (Entity Relationship)

```
┌─────────────────┐
│      User       │
├─────────────────┤
│ _id             │◄─── owns ───┐
│ name            │              │
│ email (unique)  │              ┌─────────────┐
│ roles[]         │              │   Wallet    │
│ activeRole      │              ├─────────────┤
│ storeId ────────┼─ belongs ─┐  │ _id         │
│ bankInfo        │           │  │ owner (User)│
│ addresses[]     │           │  │ balance     │
│ passwordHash    │           │  │ history[]   │
├─────────────────┘           │  └─────────────┘
                              │
                    ┌─────────▼─────────┐
                    │      Store        │
                    ├──────────────────┤
                    │ _id              │
                    │ name             │
                    │ ownerId ─────────┼─── belongs ──┐
                    │ address          │               │
                    │ plan (1, 2, 3)   │      ┌────────▼────────┐
                    │ isActive         │      │ Wallet (Store)  │
                    │ rating           │      ├─────────────────┤
                    │ logo             │      │ owner: storeId  │
                    │ products[]───────┼──────┼┐                │
                    └────────┬─────────┘      ││ balance         │
                             │                ││ platformFeeRate │
                             │                └────────────────┘
                    ┌────────▼──────────┐
                    │     Product       │
                    ├───────────────────┤
                    │ _id               │
                    │ storeId (index)   │
                    │ name              │
                    │ price             │
                    │ stock             │
                    │ category          │
                    │ image             │
                    │ createdAt         │
                    └───────────────────┘


┌──────────────────┐
│     Order        │
├──────────────────┤
│ _id              │
│ customerId ──────┼──── ref User
│ storeId ─────────┼──── ref Store
│ products[]       │      ├─ productId ──── ref Product
│                  │      ├─ quantity
│                  │      └─ price (snapshot)
│ totalValue       │
│ deliveryFee      │
│ status           │      ┌──────────────────────┐
│ paymentStatus    │      │   Cancellation       │
│ walletDist...    │◄─────┼───────────────────┐  │
│ deliveryId ──────┼──────┼───┐               │  │
│ rating           │      │   │               │  │
│ comment          │      │   │               │  │
│ createdAt        │      └───┼───────────────┘  │
│ acceptedAt       │          │                  │
│ cancelledAt      │          │                  │
└──────────────────┘          │                  │
                    ┌─────────▼───────┐
                    │   Delivery      │
                    ├─────────────────┤
                    │ _id             │
                    │ orderId ────────┼──── ref Order
                    │ storeId         │
                    │ customerId      │
                    │ motoboyId ──────┼──── ref User (Motoboy)
                    │ status          │
                    │ pickupLocation  │
                    │ deliveryLocation│
                    │ pin             │
                    │ claimedAt       │
                    │ startedAt       │
                    │ completedAt     │
                    │ rating          │
                    │ feedback        │
                    └─────────────────┘

┌──────────────────┐
│  Gamification    │
├──────────────────┤
│ _id              │
│ userId ──────────┼──── ref User (Motoboy)
│ points           │
│ ranking          │
│ monthlyPoints    │
│ redeems[]        │
│ level            │
│ badges[]         │
└──────────────────┘

┌───────────────────┐
│  Notification     │
├───────────────────┤
│ _id               │
│ userId ───────────┼──── ref User
│ title             │
│ message           │
│ type (order, ...) │
│ isRead            │
│ createdAt         │
└───────────────────┘

┌─────────────────────────┐
│  WithdrawalRequest      │
├─────────────────────────┤
│ _id                     │
│ userId ─────────────────┼──── ref User
│ amount                  │
│ status (pending, ...)   │
│ bankInfo (encrypted)    │
│ processedAt             │
│ createdAt               │
└─────────────────────────┘
```

---

## 5️⃣ Fluxo de Autenticação e Autorização

```
FLUXO DE LOGIN
──────────────
Frontend             Backend              Database
   │                   │                     │
   ├─ submit form      │                     │
   │                   │                     │
   ├─ POST /login ────►│                     │
   │   email, pwd      │ findOne({email})   │
   │                   ├────────────────────►│
   │                   │                ┌────┴─ User doc
   │                   │◄────────────────┘
   │                   │
   │                   │ bcrypt.compare()
   │                   │
   │                   ├─ pwd === hash? ✅
   │                   │
   │                   │ jwt.sign({id, role})
   │                   │
   │◄────── token ─────│
   │
   │ localStorage.setItem('token')
   │
   │ api.defaults.headers = {
   │   Authorization: 'Bearer token'
   │ }

REQUISIÇÃO COM TOKEN
────────────────────
Frontend             Backend
   │                   │
   ├─ GET /orders ────►│
   │  Header:          │ authenticate()
   │  Auth: Bearer...  │ ├─ extract token
   │                   │ ├─ jwt.verify()
   │                   │ ├─ get req.user
   │                   │ └─ next()
   │                   │
   │                   │ authorizeRoles()
   │                   │ ├─ req.user.role
   │                   │ ├─ allowed? ✅
   │                   │ └─ next()
   │                   │
   │                   │ getOrders()
   │                   │ └─ exec query
   │                   │
   │◄── orders ────────│

ROLE ATIVO (CONTEXT)
────────────────────
User.roles = ['lojista', 'cliente']
User.activeRole = 'lojista'   ← determina permissões

POST /switch-role {role: 'cliente'}
User.activeRole = 'cliente'   ← permissões mudam

novo JWT contém: {id, role: 'cliente'}
```

---

## 6️⃣ Distribuição de Wallet em um Pedido

```
PEDIDO CRIADO:
─────────────
Preço do Produto: 100 BRL
Taxa de Entrega:   10 BRL
                  ─────────
Total:            110 BRL

DISTRIBUIÇÃO (plano 1 = 15% para CEO):
──────────────────────────────────────
Total:              110 BRL
CEO Fee (15%):     -16.50 BRL  ← Plataforma
Loja:             +93.50 BRL  ← Lojista
Motoboy:          +10 BRL     ← Entregador (do delivery fee)
                  ────────────
Total saído:      110 BRL ✅


DISTRIBUIÇÃO (plano 2 = 20% para CEO):
──────────────────────────────────────
Total:              110 BRL
CEO Fee (20%):     -22 BRL    ← Plataforma
Loja:             +88 BRL    ← Lojista
Motoboy:          +10 BRL    ← Entregador
                  ──────────
Total saído:      110 BRL ✅


CARTEIRA DO CLIENTE:
───────────────────
Antes:  balance: 500 BRL
        totalSpent: 1000 BRL
        
Após:   balance: 390 BRL (500 - 110)
        totalSpent: 1110 BRL (1000 + 110)
        history: [
          {
            date: now,
            type: 'debit',
            category: 'payment',
            amount: 110,
            reason: 'Pedido #...',
            relatedId: orderId
          }
        ]


CARTEIRA DA LOJA:
────────────────
Antes:  balance: 1000 BRL
        totalIncome: 5000 BRL
        
Após:   balance: 1093.50 BRL (1000 + 93.50)
        totalIncome: 5093.50 BRL
        history: [
          {
            date: now,
            type: 'credit',
            category: 'payment',
            amount: 93.50,
            reason: 'Ordem entregue #...',
            relatedId: orderId,
            paymentMethod: 'wallet'
          }
        ]


CARTEIRA DO CEO (PLATAFORMA):
──────────────────────────────
Antes:  balance: 50000 BRL
        totalIncome: 100000 BRL
        
Após:   balance: 50016.50 BRL (50000 + 16.50)
        totalIncome: 100016.50 BRL
        history: [
          {
            date: now,
            type: 'credit',
            category: 'payment',
            amount: 16.50,
            reason: 'Plataforma Fee - Pedido #...',
            relatedId: orderId
          }
        ]


CARTEIRA DO MOTOBOY:
────────────────────
Antes:  balance: 150 BRL
        totalIncome: 2000 BRL
        
Após:   balance: 160 BRL (150 + 10)
        totalIncome: 2010 BRL
        history: [
          {
            date: now,
            type: 'credit',
            category: 'delivery_fee',
            amount: 10,
            reason: 'Entrega finalizada',
            relatedId: deliveryId
          }
        ]
        
Plus:
- Ganha 5 pontos de gamificação
- Ranking sobe (se tiver pontos suficientes)
```

---

## 7️⃣ Socket.IO Events Map

```
┌─────────────────────────────────────────────────────────────┐
│                    SOCKET.IO EVENTS                          │
└─────────────────────────────────────────────────────────────┘

CONNECTION
──────────
socket.on('connection')
  ├─ join-user {userId}      → socket.join(`user:${userId}`)
  ├─ join-store {storeId}     → socket.join(`store:${storeId}`)
  └─ disconnect               → [cleanup]


PEDIDOS
──────
emit to store:${storeId}
  ├─ order:new               {orderId, customerId, products}
  ├─ order:accepted          {orderId, status}
  ├─ order:rejected          {orderId, reason}
  └─ order:cancelled         {orderId, refund}

emit to user:${customerId}
  ├─ order:accepted          {orderId}
  ├─ order:rejected          {orderId}
  ├─ order:cancelled         {orderId}
  └─ order:payment-received  {orderId}


ENTREGAS
────────
emit to room:motoboys
  └─ delivery:available      {deliveryId, location, fee}

emit to user:${motoboyId}
  ├─ delivery:claimed        {deliveryId, accepted}
  ├─ delivery:status-update  {status, location}
  └─ delivery:timeout        {reason, penaltyAmount}

emit to user:${customerId}
  ├─ delivery:claimed        {motoboyId, eta}
  ├─ delivery:on-the-way     {location, eta}
  ├─ delivery:arrived        {pinRequired}
  ├─ delivery:completed      {orderId}
  └─ delivery:cancelled      {reason}


CARTEIRAS
─────────
emit to user:${userId}
  ├─ wallet:credited         {amount, balance, reason}
  ├─ wallet:debited          {amount, balance, reason}
  ├─ wallet:withdrawn        {amount, status}
  └─ wallet:updated          {balance, history}


NOTIFICAÇÕES
────────────
emit to user:${userId}
  ├─ notification:new        {title, message, type}
  ├─ notification:read       {notificationId}
  └─ notification:broadcast  {message} (CEO)


GAMIFICAÇÃO
───────────
emit to user:${motoboyId}
  ├─ gamification:points-earned  {points, total}
  ├─ gamification:rank-changed   {oldRank, newRank}
  └─ gamification:badge-unlocked {badge}


EXEMPLO DE FLUXO COMPLETO:
──────────────────────────

1. Cliente POST /orders
   └─ Backend: io.to(`store:${storeId}`).emit('order:new', {...})

2. Lojista recebe evento em tempo real
   └─ Toca som, mostra notificação

3. Lojista clica "Aceitar"
   └─ Backend: io.to(`user:${customerId}`).emit('order:accepted', {...})

4. Cliente recebe evento
   └─ Atualiza UI, redireciona

5. Motoboys na área recebem
   └─ Backend: io.to('room:motoboys').emit('delivery:available', {...})

6. Motoboy reclama
   └─ Backend: io.to(`user:${motoboyId}`).emit('delivery:claimed', {...})

7. Delivery atualiza status
   └─ Backend: io.to(`user:${customerId}`).emit('delivery:on-the-way', {...})

8. Delivery finalizada
   └─ Múltiplos emits para cliente, loja, motoboy, CEO
```

---

## 8️⃣ Middleware Pipeline

```
REQUEST CHEGANDO
─────────────────

┌─ Express receives HTTP request
│
├─ 1. CORS Middleware
│    └─ origin allowed?
│       ├─ YES: continue
│       └─ NO: return 403
│
├─ 2. Body Parser
│    └─ parse JSON body
│
├─ 3. Cookie Parser
│    └─ parse cookies
│
├─ 4. Logging Middleware
│    └─ log timestamp, method, url
│
├─ 5. Rate Limit
│    └─ check IP against limit
│       ├─ OK: continue
│       └─ EXCEEDED: return 429
│
├─ 6. AUTH Routes
│    └─ [No authentication needed for login]
│
└─ 7. OTHER Routes
   │
   ├─ 7.1 authenticate middleware
   │       └─ extract JWT from header
   │          └─ jwt.verify(token)
   │             ├─ VALID: set req.user
   │             └─ INVALID: return 401
   │
   ├─ 7.2 authorizeRoles middleware (optional)
   │       └─ check if req.user.role in allowed[]
   │          ├─ YES: continue
   │          └─ NO: return 403
   │
   ├─ 7.3 validate middleware
   │       └─ schema.parse(req.body)
   │          ├─ VALID: continue
   │          └─ INVALID: return 400
   │
   ├─ 7.4 Controller function
   │       └─ try {
   │          │   lógica principal
   │          │   res.json(result)
   │          │}
   │          └─ catch (err) { next(err) }
   │
   └─ 7.5 Error Handler
           └─ if (err instanceof AppError)
              │   res.status(err.statusCode).json(...)
              └─ else
                  res.status(500).json(...)

EXEMPLO REAL:
────────────
POST /api/orders

┌──────┐
│ CORS │ ✅ origin = localhost:3000
└──┬───┘
   │
┌──▼────────────┐
│ Body Parser   │ ✅ parsed JSON
└──┬────────────┘
   │
┌──▼────────────┐
│ Rate Limit    │ ✅ 10/min, 8 requests so far
└──┬────────────┘
   │
┌──▼────────────┐
│ authenticate  │ ✅ JWT valid, req.user = {id, role}
└──┬────────────┘
   │
┌──▼────────────┐
│ validate      │ ❌ products is empty
└──┬────────────┘
   │
   └──► next(new AppError(400, 'Products required'))
        │
        └──► errorHandler
             └──► res.status(400).json({
                   error: 'Products required'
                 })
```

---

## 9️⃣ Ciclo de Vida de uma Entrega

```
┌─────────────────────────────────────────────────────────────┐
│         CICLO DE VIDA DE UMA ENTREGA (DELIVERY)              │
└─────────────────────────────────────────────────────────────┘

CRIAÇÃO (criado automaticamente ao aceitar order)
──────────────────────────────────────────────
Delivery {
  orderId: ObjectId,
  storeId: ObjectId,
  customerId: ObjectId,
  motoboyId: null,        ← ninguém reivindicou ainda
  status: 'pendente',     ← estado inicial
  pickupLocation: {...},
  deliveryLocation: {...},
  pin: '1234',
  claimedAt: null,
  startedAt: null,
  completedAt: null
}

│
▼

REIVINDICAÇÃO (motoboy clica "Reivindicar")
─────────────────────────────────────────
POST /deliveries/:id/claim

Checks:
  ✅ motoboyId === null (ninguém reivindicou)
  ✅ status === 'pendente'

Updates:
  motoboyId ← userId do motoboy
  status ← 'coletada'
  claimedAt ← now

Delivery Timeout Job iniciado:
  └─ Se após 30 min motoboyId ainda está setado
     e status não mudou para 'entregue':
     ├─ Refund 10 BRL
     ├─ Notifica motoboy
     └─ Libera motoboyId = null
        (outra motoboy pode reivindicar)

│
▼

SAIU DA LOJA (motoboy clica "Saiu da Loja")
──────────────────────────────────────────
PUT /deliveries/:id/status {status: 'saiu'}

Updates:
  status ← 'saiu'

Socket notifica cliente:
  └─ 'delivery:on-the-way'

│
▼

CHEGOU NO CLIENTE (motoboy clica "Cheguei")
──────────────────────────────────────────
PUT /deliveries/:id/status {status: 'na-porta'}

Updates:
  status ← 'na-porta'

Sistema envia PIN por SMS:
  └─ "Seu código de entrega é: 1234"

│
▼

FINALIZAÇÃO (motoboy entra PIN)
──────────────────────────────
POST /deliveries/:id/finalizar {pin}

Validations:
  ✅ pin === '1234'
  ✅ motoboyId === req.user._id
  ✅ status === 'na-porta'

Updates:
  status ← 'entregue'
  completedAt ← now

Distribuição de saldo:
  ├─ Loja: +storeAmount
  ├─ CEO: +ceoAmount
  └─ Motoboy: +deliveryFee

Criar Transaction records:
  ├─ TransactionType.DELIVERY_COMPLETED

Ganhar pontos de gamificação:
  └─ motoboyPoints += 5

Socket broadcast:
  ├─ to user:${customerId}: 'delivery:completed'
  ├─ to user:${storeId}: 'payment:received'
  └─ to user:${motoboyId}: 'delivery:completed'

│
▼

FINALIZADO ✅
─────────────
Delivery {
  status: 'entregue',
  motoboyId: ObjectId,
  completedAt: Date,
  rating: 5,
  feedback: 'Entregador muito educado!'
}

Cliente pode depois avaliar:
  POST /deliveries/:id/rate {rating, feedback}
  └─ Salva na Delivery

│
├── TIMEOUT (se inativo por 30 min)
│
├─ Cancel entrega
├─ Refund motoboy
├─ Liberar para outro motoboy
└─ Notificar cliente


STATES DIAGRAM:
──────────────

        ┌─────────┐
        │ pendente│  ← inicial
        └────┬────┘
             │ claim
             ▼
        ┌─────────┐
        │coletada │  ← motoboy reivindicou
        └────┬────┘
             │ saiu
             ▼
        ┌─────────┐
        │   saiu  │  ← saiu da loja
        └────┬────┘
             │ na-porta
             ▼
        ┌─────────┐
        │ na-porta│  ← chegou no cliente
        └────┬────┘
             │ finalizar com PIN
             ▼
        ┌──────────┐
        │entregue ✅│  ← COMPLETO
        └──────────┘
```

---

**Fim dos Diagramas** ✅

Estes diagramas cobrem:
- ✅ Arquitetura geral do sistema
- ✅ Hierarquia de roles
- ✅ Timeline de pedido completo
- ✅ Modelo de dados (ER diagram)
- ✅ Fluxo de autenticação
- ✅ Distribuição de wallet
- ✅ Socket.IO events
- ✅ Middleware pipeline
- ✅ Ciclo de vida de entrega
