# 📋 ANÁLISE COMPLETA DO SISTEMA DROP MARKETPLACE

**Data:** 3 de Março de 2026  
**Status:** Sistema em produção com múltiplas fases implementadas

---

## 🎯 Visão Geral do Projeto

**Drop Marketplace** é uma plataforma de entrega e vendas em tempo real com 3 papéis principais:

```
┌─────────────┐    ┌──────────────┐    ┌────────────┐
│   CLIENTE   │    │   LOJISTA    │    │  MOTOBOY   │
├─────────────┤    ├──────────────┤    ├────────────┤
│ • Browsear  │    │ • Gerenciar  │    │ • Aceitar  │
│ • Comprar   │    │   Loja       │    │   entregas │
│ • Pagar     │    │ • Visualizar │    │ • Entregar │
│ • Rastrear │    │   Pedidos    │    │ • Ganhar   │
└─────────────┘    └──────────────┘    └────────────┘
        │                   │                  │
        └───────────────────┴──────────────────┘
                  ADMIN (CEO/Gerentes)
                  • Gerenciar tudo
                  • Wallets
                  • Planos
```

---

## 🏗️ ARQUITETURA GERAL

### Stack Tecnológico Completo

```
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND (Next.js)                  │
│  ├─ Pages (tsx): login, checkout, my-wallet, admin...  │
│  ├─ Components (tsx): AddressSelector, Nav, etc        │
│  ├─ Contexts: AuthContext, CartContext                 │
│  ├─ Hooks: useAuth, useSync, useFetch                  │
│  └─ Lib: api.ts (axios wrapper)                        │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP + WebSocket (Socket.IO)
┌──────────────────────┴──────────────────────────────────┐
│                  BACKEND (Express/Node)                 │
│  ├─ Controllers: authController, orderController...    │
│  ├─ Models: User, Order, Delivery, Wallet, Store...   │
│  ├─ Routes: auth, orders, deliveries, wallets, admin  │
│  ├─ Middleware: authenticate, validate, authorize     │
│  ├─ Services: notifier (Socket.IO + SSE)              │
│  ├─ Utils: walletCalculations, socketEmitter          │
│  └─ Validation: schemas com Zod                        │
└──────────────────────┬──────────────────────────────────┘
                       │ MongoDB + Mongoose
┌──────────────────────┴──────────────────────────────────┐
│              DATABASE (MongoDB/Atlas)                   │
│  Collections: users, orders, deliveries, products...   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│            REAL-TIME (WebSocket/Socket.IO)             │
│  ├─ Notificações de pedidos                            │
│  ├─ Atualizações de status de entrega                  │
│  ├─ Chat/Mensagens em tempo real                       │
│  └─ Salas: user:${id}, motoboys, admin, stores         │
└─────────────────────────────────────────────────────────┘
```

---

## 📊 MODELOS DE DADOS (Database Schema)

### 1. **User** (`src/models/User.ts`)
```typescript
├─ name: string
├─ email: string (unique)
├─ passwordHash: string
├─ role: string (legacy) // "cliente", "lojista", "motoboy", etc
├─ roles: string[] (novo) // múltiplos roles
├─ activeRole: string (novo) // qual role está ativo agora
├─ storeId?: ObjectId (referência à loja se for lojista)
├─ permissions?: string[]
├─ addresses?: IUserAddress[] (múltiplos endereços)
├─ mainAddress?: IUserAddress
├─ bankInfo?: { banco, agencia, conta, cpf, isConfigured }
├─ planId?: string (plano de negócios para lojistas)
├─ telefone, cpf, rg, dataNascimento, sexo
├─ photo?: string
└─ timestamps

**9 roles disponíveis:**
- ceo, marketing, gerente_geral
- gerente_clientes, gerente_lojistas, gerente_motoboys
- lojista, cliente, motoboy
```

### 2. **Wallet** (`src/models/Wallet.ts`)
```typescript
├─ owner: string (userId ou storeId)
├─ ownerType: 'user' | 'store' | 'platform'
├─ balance: number (saldo atual)
├─ totalIncome: number (total que entrou)
├─ totalSpent: number (total que saiu)
├─ platformFeeRate?: number (% de taxa)
├─ gamificationBenefits?: {
│  ├─ freeDeliveriesAvailable: number
│  ├─ discountPercentage: number
│  └─ lastRedeemedAt: Date
│}
├─ history: Array<{
│  ├─ date: Date
│  ├─ type: 'credit' | 'debit' | 'refund'
│  ├─ category: 'deposit' | 'withdrawal' | 'payment' | 'refund'
│  ├─ amount: number
│  ├─ reason: string
│  ├─ paymentMethod: string
│  ├─ relatedId: ObjectId (orderId, deliveryId, etc)
│  └─ reference: string
│}
└─ timestamps

**Índices únicos:**
- { owner: 1, ownerType: 1 } (único por owner+type)
- { 'history.date': -1 } (para queries rápidas)
```

### 3. **Order** (`src/models/Order.ts`)
```typescript
├─ customerId: ObjectId (referência a User)
├─ storeId: ObjectId (referência a Store)
├─ products: Array<{
│  ├─ productId: ObjectId
│  ├─ quantity: number
│  └─ price: number (snapshot do preço)
│}
├─ totalValue: number (subtotal dos produtos)
├─ subtotal: number (alias para totalValue)
├─ deliveryFee: number (taxa de entrega)
├─ status: enum [
│  ├─ 'criado' (novo pedido)
│  ├─ 'pago' (pagamento realizado)
│  ├─ 'aguardando_motoboy' (esperando entrega)
│  ├─ 'enviado' (em rota de entrega)
│  ├─ 'entregue' (finalizado)
│  ├─ 'cancelado' (cancelado pelo cliente)
│  └─ 'rejeitado' (rejeitado pela loja)
│]
├─ paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded'
├─ paymentId?: string (ID do payment gateway)
├─ cancellationId?: ObjectId (referência a Cancellation)
├─ idempotentKey?: string (prevenir duplicação)
├─ deliveryId?: ObjectId (referência a Delivery)
├─ storeRating?: number (1-5, avaliação da loja)
├─ storeComment?: string
└─ timestamps

**Fluxo de status:**
criado → pago → aguardando_motoboy → enviado → entregue
  ↓                                                    ↓
cancelado ou rejeitado ←─────────── refund realizado
```

### 4. **Delivery** (`src/models/Delivery.ts`)
```typescript
├─ orderId: ObjectId (qual pedido)
├─ motoboyId?: ObjectId (motoboy responsável)
├─ distance: number (km até o destino)
├─ fee: number (quanto o motoboy ganha)
├─ status: enum [
│  ├─ 'pending' (não atribuído)
│  ├─ 'assigned' (atribuído a motoboy)
│  ├─ 'picked' (pegou na loja)
│  ├─ 'delivered' (entregou)
│  └─ 'cancelled' (cancelado)
│]
├─ pin?: string (PIN de entrega - fornecido ao cliente)
├─ pinRetirada?: string (PIN de retirada na loja)
├─ rating?: number (1-5 stars, avaliação do motoboy)
├─ comment?: string (comentário do cliente)
└─ timestamps

**Ganho do motoboy:**
fee = R$ 7.00 (base) + (distance_km × R$ 1.00)
    + bônus (R$ 1-2 baseado em rating)
```

### 5. **Store** (`src/models/Store.ts`)
```typescript
├─ ownerId: ObjectId (referência a User que é o lojista)
├─ name: string (nome da loja)
├─ address, street, number, neighborhood, city, state, zip
├─ cnpj?: string
├─ latitude?, longitude? (para entrega)
├─ stockType: 'internal' | 'api' (tipo de estoque)
├─ apiConfig?: any (config se for API)
├─ plan: number [1, 2, 3] (plano de preços)
├─ planSince: Date
├─ planExpiresAt?: Date
├─ customCommissionRate?: number (taxa % customizada)
└─ timestamps

**Planos (taxa de comissão):**
- Plan 1: 15% de comissão
- Plan 2: 20% de comissão
- Plan 3: 30% de comissão
```

### 6. **Product** (`src/models/Product.ts`)
```typescript
├─ storeId: ObjectId (qual loja)
├─ name: string
├─ price: number
├─ quantity: number (estoque)
├─ image?: string
├─ category?: string
├─ subCategory?: string
├─ tags?: string[]
└─ timestamps
```

### 7. **Transaction** (`src/models/Transaction.ts`)
```typescript
├─ orderId: ObjectId (qual pedido)
├─ paymentMethod: string ('credit_card', 'pix', 'wallet', etc)
├─ amount: number (valor total do pedido)
├─ commissionProduct: number (comissão sobre produto)
├─ commissionDelivery: number (comissão sobre entrega)
└─ timestamps
```

### 8. **Outros Modelos**

- **Cancellation** - Track de cancelamentos e reembolsos
- **Category** - Categorias de produtos
- **Gamification** - Programa de pontos/recompensas para motoboys
- **PricingPlan** - Configuração dos planos de loja
- **Notification** - Log de notificações

---

## 🔐 SISTEMA DE AUTENTICAÇÃO E ROLES

### Flow de Login

```
1. POST /auth/register
   └─ Criar usuário com password hash + foto
   └─ Criar carteira automaticamente
   └─ Retorna { token, user }

2. POST /auth/login
   ├─ Verificar email + password
   ├─ Gerar JWT contendo { id, role }
   └─ Retorna { token, user }

3. POST /auth/switch-role
   ├─ Verificar se usuário tem novo role
   ├─ Gerar novo JWT com novo role
   └─ Retorna { token, user }
```

### Hierarquia de Roles

```
┌──────────────────────────────────────────┐
│          HIERARQUIA DE ROLES             │
├──────────────────────────────────────────┤
│ ADMIN (Acesso a todas features)          │
│  ├─ CEO (Controle total)                 │
│  ├─ Marketing (Campanhas)                │
│  ├─ Gerente Geral                        │
│  ├─ Gerente de Clientes                  │
│  ├─ Gerente de Lojistas                  │
│  └─ Gerente de Motoboys                  │
│                                          │
│ BUSINESS (Papéis do negócio)             │
│  ├─ LOJISTA (Vende produtos)             │
│  ├─ CLIENTE (Compra produtos)            │
│  └─ MOTOBOY (Entrega)                    │
└──────────────────────────────────────────┘

**Chave: activeRole determina qual página/função o usuário acessa**
- Um lojista pode ser também cliente
- Um usuário pode ter múltiplos roles
- Só um role pode ser ativo por vez
```

### Middleware de Autenticação

```typescript
// src/middleware/auth.ts

authenticate(req, res, next)
  ├─ Valida Authorization header (Bearer <token>)
  ├─ Decodifica JWT
  ├─ Valida JWT_SECRET
  ├─ Atribui req.user = { id, role }
  └─ Next() ou 401

authorizeRoles(...allowed)
  ├─ Verifica se req.user.role está em 'allowed'
  ├─ 403 se não autorizado
  └─ Next() se OK

**Exemplo de uso:**
router.post('/admin/users', authenticate, authorizeRoles('ceo', 'gerente_geral'), ...)
```

---

## 💳 SISTEMA DE WALLETS E PAGAMENTOS

### Tipos de Carteira

```
1. CARTEIRA DE USUÁRIO (cliente)
   ├─ Recebe saldo quando faz depósito
   ├─ Gasta saldo ao fazer pedidos
   ├─ Pode receber reembolsos
   └─ Rastreia histórico de transações

2. CARTEIRA DE LOJA (store)
   ├─ Recebe pagamentos dos pedidos (após deduções)
   ├─ Paga comissão à plataforma
   ├─ Pode sacar para conta bancária
   └─ Relacionada ao plano (15%, 20% ou 30% comissão)

3. CARTEIRA DA PLATAFORMA (platform)
   ├─ Acumula comissões de todas as lojas
   ├─ Acumula taxas de entrega
   ├─ Paga motoboys
   └─ Gestão financeira geral
```

### Fluxo de Dinheiro em um Pedido

```
Exemplo: Cliente compra R$ 100 de uma loja no Plano 2 (20% comissão)

1. Cliente paga R$ 100 (wallet debitado)
   Carteira Cliente: -R$ 100

2. Valor distribuído entre:
   ├─ Loja recebe: R$ 80 (100 - 20%)
   │  Carteira Loja: +R$ 80
   │
   └─ Plataforma recebe: R$ 20 (comissão)
      Carteira Platform: +R$ 20

3. Se entrega (ex: R$ 8 de distância)
   ├─ Motoboy recebe: R$ 7 + (km × R$ 1) + bônus
   │  Carteira Motoboy (user): +R$ 7-10
   │
   └─ Plataforma recebe o resto (se houver)
```

### Endpoints de Wallet

```
GET /wallets/my-wallet
  └─ Retorna carteira do usuário logado

GET /wallets/my-wallet/by-role/:role
  └─ Retorna carteira baseado no role ativo

GET /wallets/:userId
  └─ Retorna carteira de um usuário específico

POST /wallets/:userId/credit
  ├─ Adiciona saldo (depósito)
  └─ Requer { amount, paymentMethod }

POST /wallets/transfer
  ├─ Transferência entre carteiras
  └─ Requer { toUserId, amount, reason }

POST /wallets/:userId/refund
  ├─ Reembolso (desfaz uma transação)
  └─ Usado em cancelamentos

POST /wallets/:walletId/withdraw
  ├─ Saque para conta bancária
  └─ Requer bankInfo configurada
```

### Cálculos de Distribuição

```typescript
// src/utils/walletCalculations.ts

getStorePlanFee(storeId)
  → Retorna % de comissão conforme plano
  → Busca do modelo Store (plan: 1, 2, 3)
  → Padrão: 15%

calculateMotoboyEarnings(distanceKm, rating)
  → Base: R$ 7.00
  → Por km: R$ 1.00
  → Bônus rating:
    - ≥ 4.5 stars: +R$ 2.00
    - ≥ 3.5 stars: +R$ 1.00

calculateOrderDistribution(orderTotal, storeId, distance, rating)
  ├─ Busca taxa do plano da loja
  ├─ Calcula quanto loja recebe (total - comissão)
  ├─ Calcula quanto CEO recebe (comissão)
  ├─ Calcula quanto motoboy recebe
  └─ Retorna { storeAmount, ceoAmount, motoboyAmount }
```

---

## 🛒 FLUXO PRINCIPAL: PEDIDO → ENTREGA → CARTEIRA

### 1️⃣ Cliente Cria Pedido (Checkout)

```
POST /orders
├─ Validação Zod (CreateOrderSchema)
├─ Verificar se usuário tem role 'cliente' ativo
├─ Validar products, storeId
├─ Calcular deliveryFee = 7 + (km × 1)
├─ Criar documento Order com status = 'criado'
├─ Validar idempotentKey (prevenir duplicação)
├─ Retornar Order criada
└─ Emitir event socket: 'order:created'

Dados necessários:
{
  "storeId": "...",
  "products": [
    { "productId": "...", "quantity": 2 }
  ],
  "deliveryDistanceKm": 5,
  "paymentMethod": "wallet" ou "credit_card",
  "address": { street, number, neighborhood, city, state, cep },
  "latitude": "...",
  "longitude": "...",
  "idempotentKey": "..." (UUID único)
}
```

### 2️⃣ Lojista Aceita Pedido

```
POST /orders/:id/accept
├─ Verificar se usuário é lojista (role = 'lojista')
├─ Mudar status Order → 'pago'
├─ Criar documento Delivery com status = 'pending'
├─ Iniciar transação Mongoose
│  ├─ Debitar do saldo do cliente
│  ├─ Creditar na carteira da loja
│  ├─ Creditar na carteira da plataforma (comissão)
│  └─ Commit
├─ Emitir event socket: 'delivery:created'
└─ Notificar motoboys (room: 'motoboys')

Resultado:
- Order.status = 'pago'
- Delivery.status = 'pending'
- Wallets atualizadas
- Motoboys notificados
```

### 3️⃣ Motoboy Aceita Entrega

```
POST /deliveries/:id/claim
├─ Verificar motoboy (role = 'motoboy')
├─ Atomic update: Delivery.motoboyId = motoboyId
├─ Mudar status → 'assigned'
├─ Emitir event: 'delivery:assigned'
├─ Notificar:
│  ├─ Sala 'motoboys' (outros motoboys)
│  ├─ Cliente (via user:${customerId})
│  └─ Lojista (via user:${storeId})
└─ Gerar PIN de retirada

**First-claim-wins:** Usa MongoDB atomic operations
para garantir que só 1 motoboy consegue aceitar
```

### 4️⃣ Motoboy Pega Produto na Loja

```
POST /deliveries/:id/status
body: { status: 'picked', ... }
├─ Validar PIN de retirada com lojista
├─ Mudar Delivery.status → 'picked'
├─ Gerar PIN de entrega (para cliente validar)
├─ Emitir eventos para todos
└─ Notificações em tempo real
```

### 5️⃣ Motoboy Entrega ao Cliente

```
POST /deliveries/:id/finalizar
├─ Validar PIN de entrega (cliente forneceu)
├─ Iniciar transação:
│  ├─ Delivery.status = 'delivered'
│  ├─ Order.status = 'entregue'
│  ├─ Creditar motoboy na wallet
│  └─ Commit
├─ Emitir 'delivery:completed'
└─ Permitir cliente avaliar motoboy + loja

**Carteira atualizada:**
- Motoboy recebe: R$ 7 + (km × R$ 1) + bônus
```

### 6️⃣ Avaliações

```
Cliente avalia motoboy:
POST /deliveries/:id/avaliar
├─ Validar se é cliente do pedido
├─ Salvar rating (1-5 stars)
├─ Salvar comentário
└─ Atualizar ranking do motoboy

Cliente avalia loja:
POST /orders/:id/evaluate-store
├─ Salvar Order.storeRating
├─ Salvar Order.storeComment
└─ Atualizar rating da loja
```

### 7️⃣ Possível: Cancelamento

```
POST /orders/:id/cancel (pelo cliente antes de pegar)
├─ Verificar status (não pode ser 'entregue')
├─ Criar documento Cancellation
├─ Mudar Order.status = 'cancelado'
├─ Reembolsar cliente:
│  ├─ Debitar de Wallet da loja
│  ├─ Creditar em Wallet do cliente
│  └─ Registrar em history
├─ Rejeitar delivery (se existir)
└─ Emitir eventos

OU

POST /orders/:id/reject (pela loja)
├─ Lojista rejeita pedido
├─ Status → 'rejeitado'
├─ Reembolso automático ao cliente
└─ Delivery cancelado
```

---

## 🔔 SISTEMA DE NOTIFICAÇÕES EM TEMPO REAL

### Socket.IO Setup

```typescript
// src/services/notifier.ts

initSocket(server)
├─ Criar IOServer com CORS
├─ Middleware JWT validation
├─ Rooms por role:
│  ├─ cliente: room = 'user:${userId}'
│  ├─ motoboy: rooms = ['motoboys', 'user:${userId}']
│  ├─ lojista: room = 'user:${storeId}'
│  └─ admin: rooms = ['admin', 'admin:${role}', 'user:${userId}']
└─ Handlers customizados

Events emitidos:
├─ 'notification' - Notificação genérica
├─ 'order:created' - Novo pedido criado
├─ 'order:status_changed' - Status do pedido mudou
├─ 'delivery:created' - Nova entrega disponível
├─ 'delivery:assigned' - Entrega atribuída
├─ 'delivery:status_changed' - Status da entrega mudou
├─ 'delivery:completed' - Entrega finalizada
└─ 'chat:message' - Nova mensagem (se houver chat)
```

### Fallback SSE

```
Se Socket.IO falhar:
└─ Usa Server-Sent Events (SSE)
   ├─ GET /notifications/stream (autenticado)
   ├─ Connection aberta até cliente desconectar
   └─ Envia eventos via HTTP streaming
```

### Frontend: Listening

```typescript
// frontend/pages/order-[id].tsx

useEffect(() => {
  socket.on('delivery:status_changed', (data) => {
    // Atualizar UI com novo status
    setDeliveryStatus(data.status);
    // 🚗 → ✅
  });

  socket.on('order:status_changed', (data) => {
    // Atualizar status do pedido
    setOrderStatus(data.status);
  });

  return () => {
    socket.off('delivery:status_changed');
    socket.off('order:status_changed');
  };
}, []);
```

---

## 🛠️ ESTRUTURA DE CONTROLLERS E ROUTES

### Controllers Principais

```
src/controllers/
├─ authController.ts
│  ├─ register({ name, email, password, role, foto })
│  ├─ login({ email, password })
│  ├─ switchRole({ newRole })
│  └─ logout()
│
├─ orderController.ts
│  ├─ createOrder(products, storeId, delivery...)
│  ├─ getOrder(orderId)
│  ├─ acceptOrder(orderId) [lojista]
│  ├─ avaliarLoja(orderId, rating, comment)
│  └─ [6 outras funções]
│
├─ deliveryController.ts
│  ├─ createDelivery(orderId)
│  ├─ claimDelivery(deliveryId) [motoboy - first-claim-wins]
│  ├─ updateDeliveryStatus(deliveryId, status)
│  ├─ finalizarEntrega(deliveryId, pin)
│  ├─ avaliarMotoboy(deliveryId, rating)
│  └─ [8 outras funções]
│
├─ walletController.ts
│  ├─ getWallet(userId)
│  ├─ getMyWallet() [role-aware]
│  ├─ creditWallet(userId, amount, method)
│  ├─ transferWallet(fromId, toId, amount)
│  ├─ withdrawWallet(walletId, amount)
│  └─ getWalletHistory(userId)
│
├─ productController.ts
│  ├─ createProduct(storeId, name, price...)
│  ├─ getProduct(productId)
│  ├─ updateProduct(productId, {...})
│  ├─ deleteProduct(productId)
│  └─ listProducts(storeId)
│
├─ storeController.ts
│  ├─ createStore(ownerId, name, address...)
│  ├─ getStore(storeId)
│  ├─ updateStore(storeId, {...})
│  └─ listStores()
│
└─ [más: cancellation, gamification, notifications, etc]
```

### Routes Organization

```
src/routes/
├─ auth.ts
│  ├─ POST /register
│  ├─ POST /login
│  └─ POST /switch-role
│
├─ orders.ts
│  ├─ POST / (create)
│  ├─ GET /:id (detail)
│  ├─ GET / (list my orders)
│  ├─ POST /:id/accept (lojista)
│  ├─ POST /:id/reject (lojista)
│  ├─ POST /:id/cancel (cliente)
│  └─ POST /:id/evaluate-store (cliente)
│
├─ deliveries.ts
│  ├─ POST / (create - lojista)
│  ├─ POST /:id/claim (motoboy - first-claim-wins)
│  ├─ PUT /:id/status (motoboy)
│  ├─ POST /:id/finalizar (motoboy)
│  ├─ GET /available (motoboy)
│  ├─ GET /ongoing (motoboy)
│  └─ POST /:id/avaliar (cliente)
│
├─ wallets.ts
│  ├─ GET /my-wallet
│  ├─ GET /my-wallet/by-role/:role
│  ├─ GET /:userId
│  ├─ POST /:userId/credit
│  ├─ POST /:userId/transfer
│  ├─ POST /:userId/withdraw
│  └─ GET /platform/metrics (CEO)
│
├─ admin.ts
│  ├─ GET /users (CEO)
│  ├─ PUT /users/:id/role (CEO)
│  ├─ PUT /users/:id/status (CEO)
│  ├─ GET /metrics/platform (CEO)
│  └─ [múltiplas endpoints admin]
│
├─ stores.ts
├─ products.ts
├─ categories.ts
├─ gamification.ts
├─ notifications.ts
├─ addresses.ts
└─ pricingPlanRoutes.ts
```

---

## 🎨 ESTRUTURA DO FRONTEND (Next.js)

### Pages Principais

```
frontend/pages/
├─ index.tsx
│  └─ Catálogo de produtos c/ filtros
│
├─ login.tsx
│  └─ Formulário de login
│
├─ register.tsx
│  └─ Registro de novo usuário
│
├─ checkout.tsx (⭐ Importante)
│  ├─ Carrinho de compras
│  ├─ Seleção de endereço
│  ├─ Cálculo de taxa de entrega
│  ├─ Seleção de método pagamento
│  ├─ Validação de saldo de wallet
│  ├─ Modal de confirmação
│  └─ Bloqueio de role (só cliente)
│
├─ order-[id].tsx
│  ├─ Detalhes do pedido
│  ├─ Status em tempo real (WebSocket)
│  ├─ Informações da entrega
│  ├─ Botão para avaliar
│  └─ Chat possível
│
├─ my-wallet.tsx (⭐ Importante)
│  ├─ Saldo da carteira
│  ├─ Histórico de transações
│  ├─ Opções de depósito
│  ├─ Opções de saque
│  ├─ Transferência entre contas
│  └─ Role-aware (cliente vs lojista)
│
├─ seller/
│  ├─ dashboard.tsx
│  │  └─ Dashboard da loja
│  ├─ create-product.tsx
│  │  └─ Criar novo produto
│  ├─ products.tsx
│  │  └─ Listar e editar produtos
│  ├─ order-[id].tsx
│  │  └─ Detalhes do pedido
│  ├─ wallet.tsx
│  │  └─ Carteira da loja
│  └─ profile.tsx
│
├─ motoboy/
│  ├─ index.tsx
│  │  └─ Dashboard com entregas disponíveis
│  ├─ ongoing.tsx
│  │  └─ Entregas em progresso
│  ├─ history.tsx
│  │  └─ Histórico de entregas
│  ├─ wallet.tsx
│  │  └─ Ganhos e carteira
│  ├─ ranking.tsx
│  │  └─ Posição no ranking
│  ├─ profile.tsx
│  │  └─ Perfil do motoboy
│  └─ delivery/
│      └─ [componentes de entrega]
│
├─ admin/
│  ├─ dashboard.tsx
│  │  └─ Dashboard geral
│  ├─ users.tsx
│  │  └─ Gerenciar usuários
│  ├─ wallets.tsx
│  │  └─ Monitorar carteiras
│  ├─ settings.tsx
│  │  └─ Configurações do sistema
│  └─ pricing-config.tsx
│      └─ Configurar planos
│
├─ store-dashboard.tsx
│  └─ Dashboard multi-loja
│
├─ bank-setup.tsx
│  └─ Configurar dados bancários
│
├─ notifications.tsx
│  └─ Central de notificações
│
└─ _app.tsx & _document.tsx
   └─ Wrappers de contexto
```

### Contexts (State Management)

```
frontend/contexts/
├─ AuthContext.tsx
│  ├─ user (dados do usuário logado)
│  ├─ token (JWT)
│  ├─ login(email, password)
│  ├─ logout()
│  └─ switchRole(newRole)
│
└─ CartContext.tsx
   ├─ cart (items)
   ├─ add(item)
   └─ clear()
```

### Hooks (Data Fetching)

```
frontend/hooks/
├─ useSync.ts
│  ├─ useProducts() - Busca produtos
│  ├─ useStores() - Busca lojas
│  ├─ useAddresses() - Busca endereços
│  └─ useOrders() - Busca pedidos
│
└─ [outros hooks]
```

### Components

```
frontend/components/
├─ AddressSelector.tsx
│  └─ Selecionar ou criar endereço
│
├─ Nav.tsx
│  ├─ Navbar com links
│  ├─ Logout button
│  └─ Role switcher
│
├─ ProtectedRoute.tsx
│  └─ Wrapper para rotas autenticadas
│
├─ order/
│  └─ Componentes relacionados a pedidos
│
├─ delivery/
│  └─ Componentes relacionados a entregas
│
└─ common/
   └─ Componentes reutilizáveis
```

---

## 🔒 VALIDAÇÃO E SEGURANÇA

### Validação com Zod (`src/validation/schemas.ts`)

```typescript
CreateOrderSchema = z.object({
  storeId: z.string().min(1),
  products: z.array(z.object({
    productId: z.string(),
    quantity: z.number().positive()
  })),
  deliveryDistanceKm: z.number().nonnegative(),
  paymentMethod: z.enum(['wallet', 'credit_card', 'pix']),
  idempotentKey: z.string().uuid().optional()
});

RegisterSchema = z.object({
  name: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(8) // Forte: letras, números, símbolos
    .regex(/[A-Z]/, 'Precisa maiúscula')
    .regex(/[0-9]/, 'Precisa número')
    .regex(/[!@#$%^&*]/, 'Precisa símbolo'),
  role: z.enum(['cliente', 'lojista', 'motoboy']).optional(),
  telefone: z.string().regex(/^\d{10,11}$/, 'Telefone inválido').optional(),
  cpf: z.string().regex(/^\d{11}$/, 'CPF inválido').optional()
});

// + 11 outros schemas
```

### Middleware de Validação

```typescript
// src/middleware/validate.ts

validate(schema: ZodSchema) {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.body);
      req.validatedBody = validated;
      next();
    } catch (error: ZodError) {
      return res.status(400).json({
        error: 'Validação falhou',
        details: error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      });
    }
  };
}

// Uso nas rotas:
router.post('/', authenticate, validate(CreateOrderSchema), createOrder);
```

### Rate Limiting

```typescript
// src/middleware/rateLimiter.ts

Limiters pré-configurados:
├─ loginLimiter: 5 tentativas / 15 minutos
├─ registerLimiter: 3 contas / hora
├─ orderLimiter: 10 pedidos / minuto
├─ deliveryLimiter: 20 claims / minuto
├─ walletLimiter: 50 transações / minuto
└─ generalLimiter: 100 requisições / 15 min

// Uso:
app.post('/auth/login', loginLimiter, authController.login);
```

### Password Hashing

```typescript
// Usando bcrypt com salt 10

register:
├─ Gerar salt com bcrypt
├─ Hash password com salt
├─ Salvar passwordHash no DB
└─ NUNCA retornar password

login:
├─ Buscar usuário por email
├─ Comparar password com passwordHash (bcrypt.compare)
└─ Retornar token se OK
```

### JWT Token

```typescript
JWT contém: { id: string, role: string }
Validação:
├─ Verificar assinatura com JWT_SECRET
├─ Verificar exp (expiration)
└─ Extrair payload

Proteção:
├─ Bearer <token> no header
├─ Nunca armazenar em localStorage (XSS risk)
└─ Refresh token ideal (não implementado ainda)
```

---

## 📈 ESTADO DE DESENVOLVIMENTO

### Fases Completadas

```
✅ FASE 1-3:   Autenticação básica
✅ FASE 4-6:   CRUD de produtos e lojas
✅ FASE 7-9:   Sistema de pedidos e entregas
✅ FASE 10-12: Pagamentos e wallet
✅ FASE 13-14: Admin panel, roles, comissões
✅ FASE 15:    Refinamentos e bug fixes

🔧 MELHORIAS IMPLEMENTADAS:
✅ Validação com Zod
✅ Rate limiting
✅ Logging centralizado
✅ Transações Mongoose
✅ Error handling padrão
✅ Socket.IO com fallback SSE
✅ Gamificação para motoboys
✅ Planos de preços para lojas
✅ Sistema de avaliações
✅ Cancelamento e reembolsos
```

### Funcionalidades Ativas

```
CLIENTE:
✅ Browsear produtos
✅ Adicionar ao carrinho
✅ Checkout com endereço
✅ Pagar com wallet
✅ Rastrear pedido em tempo real
✅ Avaliar loja e motoboy
✅ Gerenciar wallet (depósito/saque)

LOJISTA:
✅ Criar loja e produtos
✅ Ver pedidos em tempo real
✅ Aceitar/Rejeitar pedidos
✅ Gerenciar estoque
✅ Ver saldo da loja
✅ Sacar para conta bancária
✅ Dashboard com analytics

MOTOBOY:
✅ Ver entregas disponíveis
✅ Claim delivery (first-claim-wins)
✅ Atualizar status de entrega
✅ Validar NIN de entrega
✅ Gerar PIN para cliente
✅ Ganhar dinheiro + bônus
✅ Sistema de ranking/gamificação

ADMIN:
✅ Gerenciar usuários (roles)
✅ Ver métricas da plataforma
✅ Gerenciar wallets
✅ Configurar planos
✅ Ban/unban usuários
```

### Possíveis Melhorias Futuras

```
🔜 Chat em tempo real entre cliente e loja
🔜 Proof of delivery (foto)
🔜 Recurring orders (pedidos recorrentes)
🔜 Cupons e promoções
🔜 Analytics avançados
🔜 Integração com payment gateways (Stripe, PagSeguro)
🔜 App mobile (React Native)
🔜 Refresh tokens
🔜 2FA (Two-factor authentication)
🔜 Social login (Google, Facebook)
```

---

## 🚀 COMO RODAR LOCALMENTE

### Backend

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com:
# - MONGO_URI (MongoDB Atlas ou local)
# - JWT_SECRET (gerar com: openssl rand -base64 32)
# - PORT (padrão 4000)
# - NODE_ENV (dev ou production)

# 3. Rodar em modo desenvolvimento (ts-node-dev)
npm run dev
# Servidor ativa em http://localhost:4000

# 4. Rodar testes
npm test

# 5. Build para produção
npm run build
npm start
```

### Frontend

```bash
cd frontend

# 1. Instalar dependências
npm install

# 2. Configurar variáveis
cat > .env.local << EOF
NEXT_PUBLIC_API_URL=http://localhost:4000/api
EOF

# 3. Modo desenvolvimento
npm run dev
# Abre em http://localhost:3000

# 4. Build para produção
npm run build
npm start
```

### Docker (Optional)

```bash
# MongoDB + Mongo Express
docker-compose up -d
# MongoDB em localhost:27017
# Mongo Express em localhost:8081
```

---

## 📚 Arquivos Principais para Estudo

```
BACKEND:
├─ src/index.ts - Entrada principal
├─ src/app.ts - Setup do Express + rotas
├─ src/db.ts - Conexão MongoDB
├─ src/services/notifier.ts - Socket.IO setup
├─ src/middleware/auth.ts - Autenticação
├─ src/utils/walletCalculations.ts - Lógica financeira
├─ src/controllers/orderController.ts - Lógica de pedidos
└─ src/models/User.ts, Order.ts, Wallet.ts, Delivery.ts

FRONTEND:
├─ frontend/pages/index.tsx - Catálogo
├─ frontend/pages/checkout.tsx - Checkout (⭐)
├─ frontend/pages/my-wallet.tsx - Carteira (⭐)
├─ frontend/pages/order-[id].tsx - Rastreamento
├─ frontend/contexts/AuthContext.tsx - Estado auth
├─ frontend/lib/api.ts - Cliente HTTP
└─ frontend/_app.tsx - Wrappers

DOCS:
├─ START_HERE.md - Guia inicial
├─ README.md - Visão geral
├─ ARQUITETURA.md - Padrões
└─ ANALISE_QUALIDADE_CODIGO.md - Análise detalhada
```

---

## 🎯 Resumo Executivo

**Drop Marketplace** é um sistema fullstack moderno com:

1. **Architecture:** Express, Next.js, MongoDB, Socket.IO
2. **Autenticação:** JWT + múltiplos roles
3. **Pagamentos:** Sistema de wallet próprio
4. **Entregas:** Matching algoritmo (first-claim-wins)
5. **Real-time:** Socket.IO + WebSocket
6. **Segurança:** Validação Zod, rate-limit, hashing bcrypt
7. **Database:** Mongoose com transações
8. **Admin:** Painel para gerenciar tudo

**Status:** Pronto para produção com melhorias contínuas.

---

**Documento gerado em:** 3 de Março de 2026  
**Atualizado por:** Análise Completa do Código  
**Versão:** 1.0
