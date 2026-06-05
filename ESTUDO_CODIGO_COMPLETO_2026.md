# 📚 ESTUDO COMPLETO DO CÓDIGO - DROP MARKETPLACE

**Data**: 11 de Março de 2026  
**Versão**: 1.0  
**Status**: ✅ Análise Completa

- - -

## 📋 ÍNDICE

1. [Visão Geral do Projeto](#visão-geral-do-projeto)
2. [Arquitetura Geral](#arquitetura-geral)
3. [Backend - Estrutura Detalhada](#backend---estrutura-detalhada)
4. [Frontend - Estrutura Detalhada](#frontend---estrutura-detalhada)
5. [Fluxo de Dados](#fluxo-de-dados)
6. [Models (Banco de Dados)](#models-banco-de-dados)
7. [Controllers (Lógica de Negócio)](#controllers-lógica-de-negócio)
8. [Routes (Endpoints)](#routes-endpoints)
9. [Middleware & Segurança](#middleware--segurança)
10. [Funcionalidades Principais](#funcionalidades-principais)
11. [Padrões & Boas Práticas](#padrões--boas-práticas)
12. [Problemas Conhecidos & TODO](#problemas-conhecidos--todo)

- - -

## 🎯 Visão Geral do Projeto

### O que é Drop?
**Drop** é um **marketplace de delivery com modelo de comissões e múltiplos papéis de usuário**. Similar ao iFood, mas com:
- ✅ Sistema de **wallets** (carteiras digitais) para clientes, lojistas e motoboys
- ✅ Hierarquia de **múltiplos roles** (CEO, gerentes, lojistas, clientes, motoboys)
- ✅ **Gamificação** para motoboys
- ✅ Sistema de **planos de preço** para lojas
- ✅ **Cancelamentos e devoluções** com fluxo complexo
- ✅ **Notificações em tempo real** via WebSocket
- ✅ **Entregas com timings** e responsabilidade de motoboys

### Stack Técnico

#### Backend
```
Node.js + TypeScript
├─ Express.js (framework web)
├─ MongoDB + Mongoose (banco de dados)
├─ Socket.IO (WebSocket para real-time)
├─ JWT (autenticação)
├─ Bcrypt (hash de senhas)
├─ Zod (validação)
├─ Winston (logging)
└─ Cron (jobs agendados)
```

#### Frontend
```
Next.js + TypeScript + React 19
├─ Pages Router (arquitetura)
├─ Contexts API (state management)
├─ Socket.IO client (real-time)
└─ TailwindCSS / Styled Components (UI)
```

#### DevOps
```
├─ Docker + Docker Compose
├─ Jest + Supertest (testes)
├─ ESLint + Prettier (code quality)
└─ Git / GitHub
```

---

## 🏗️ Arquitetura Geral

### Padrão MVC + Services

```
┌─────────────────────────────────────────────────────────┐
│                   CLIENTE (Browser)                      │
│              Frontend Next.js (React)                    │
└──────────────────┬──────────────────────────────────────┘
                   │ HTTP + WebSocket
                   ▼
┌─────────────────────────────────────────────────────────┐
│                  SERVIDOR (Node.js)                      │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │           Express App (src/app.ts)               │   │
│  │  - CORS, Parsing, Rate Limiting, Logging        │   │
│  └──────────────────────────────────────────────────┘   │
│                       │                                  │
│  ┌────────────────────┼────────────────────┐            │
│  │                    │                    │            │
│  ▼                    ▼                    ▼            │
│ Routes           Middleware           Socket.IO        │
│ ├─ /auth         ├─ auth.ts            └─ Events     │
│ ├─ /orders       ├─ authorize.ts                      │
│ ├─ /deliveries   ├─ validate.ts                       │
│ ├─ /wallets      └─ errorHandler.ts                   │
│ ├─ /products                                          │
│ ├─ /stores       Controllers          Services        │
│ ├─ /admin        ├─ authController    ├─ orderService│
│ └─ ...           ├─ orderController   ├─ walletSvc   │
│                  ├─ walletController  └─ ...          │
│                  └─ ...                               │
│                       │                                │
│                       ▼                                │
│                    Models                             │
│                    ├─ User                            │
│                    ├─ Order                           │
│                    ├─ Wallet                          │
│                    ├─ Store                           │
│                    ├─ Delivery                        │
│                    └─ ... (15 modelos)                │
│                       │                                │
└───────────────────────┼────────────────────────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │   MongoDB        │
              │  (Collections)   │
              └──────────────────┘
```

### Fluxo de Requisição

```
1. Cliente faz requisição (HTTP/WebSocket)
2. Routes recebem a requisição
3. Middleware processa (auth, validação, rate limit)
4. Controller executa lógica
5. Services fazem operações complexas
6. Models acessam/modificam dados
7. Resposta é enviada ao cliente
8. Se houver eventos, Socket.IO notifica outros clientes
```

---

## 🔧 Backend - Estrutura Detalhada

### Diretório de Estrutura

```
src/
├── app.ts                    # ✅ Configuração principal do Express
├── index.ts                  # ✅ Entry point (porta, DB, Socket.IO)
├── db.ts                     # Conexão MongoDB
│
├── config/
│   └── env.ts                # Validação de variáveis de ambiente
│
├── models/ (15 arquivos)
│   ├── User.ts               # 8 roles, múltiplos permissões
│   ├── Order.ts              # Pedidos com status completo
│   ├── Wallet.ts             # Carteiras digitais
│   ├── Store.ts              # Lojas com planos
│   ├── Delivery.ts           # Entregas (status, timing)
│   ├── Product.ts            # Produtos
│   ├── Category.ts           # Categorias
│   ├── Cancellation.ts       # Fluxo de cancelamento
│   ├── Notification.ts       # Notificações
│   ├── Gamification.ts       # Pontos e ranking
│   ├── Transaction.ts        # Histórico transacional
│   ├── WithdrawalRequest.ts  # Saques de carteira
│   ├── PricingPlan.ts        # Planos de preço
│   ├── PlatformConfig.ts     # Configurações globais
│   └── StoreSubscription.ts  # Subscrição de planos
│
├── controllers/ (17 arquivos)
│   ├── authController.ts         # ✅ Registro, login, switchRole
│   ├── orderController.ts        # ✅ CRUD pedidos, aceitação
│   ├── deliveryController.ts     # ✅ Claim, status, finalização
│   ├── walletController.ts       # ✅ Crédito, transferência, histórico
│   ├── productController.ts      # ✅ CRUD produtos
│   ├── storeController.ts        # CRUD lojas
│   ├── cancellationController.ts # Fluxo cancelamentos
│   ├── gamificationController.ts # Pontos, ranking, redeem
│   ├── notificationsController.ts# Notificações
│   ├── settingsController.ts     # Config plataforma
│   └── ... (7 mais)
│
├── routes/ (13+ arquivos)
│   ├── auth.ts                   # POST /register, /login, /switch-role
│   ├── orders.ts                 # POST /, GET /:id, PUT /:id/accept
│   ├── deliveries.ts             # POST /:id/claim, PUT /:id/status
│   ├── wallets.ts                # GET /my-wallet, POST /:id/credit
│   ├── products.ts               # POST /, GET /, PUT /:id, DELETE /:id
│   ├── stores.ts                 # GET /, POST /
│   ├── admin.ts                  # ✅ Endpoints administrativos
│   ├── notifications.ts          # Notificações
│   ├── categories.ts             # Categorias
│   ├── gamification.ts           # Ranking e redeem
│   └── ... (3+ mais)
│
├── middleware/
│   ├── auth.ts                   # authenticate(), authorizeRoles()
│   ├── authorize.ts              # ✅ authorizePermission(), authorizeCEO()
│   ├── validate.ts               # validate(schema) - Zod validation
│   ├── errorHandler.ts           # Tratamento de erros global
│   ├── upload.ts                 # Multer para upload de imagens
│   └── rateLimiter.ts            # Rate limiting
│
├── validation/
│   └── schemas.ts                # ✅ Zod schemas para validação
│
├── utils/
│   ├── walletCalculations.ts     # calculateOrderDistribution(), etc
│   ├── socketEmitter.ts          # Emitir eventos Socket.IO
│   ├── AppError.ts               # Classes de erro personalizadas
│   └── ... (3+ mais)
│
├── services/
│   ├── notifier.ts               # Socket.IO initialization
│   └── ... (helpers)
│
├── jobs/
│   └── deliveryTimeout.job.ts    # ✅ Cron job para motoboys inativos
│
├── types/
│   └── index.ts                  # Interfaces TypeScript
│
└── scripts/
    └── seedRoles.ts              # Seed de roles padrão
```

### Arquivos Críticos

#### 1️⃣ `src/app.ts` - Setup Express
- Configura CORS com whitelist
- Rate limiting por tipo (auth, order, general)
- Middleware de logging
- Monta todas as rotas (13+ módulos)
- Health check em `/api/health`
- Serve uploads estáticos

#### 2️⃣ `src/index.ts` - Entry Point
- Carrega variáveis de ambiente
- Conecta ao MongoDB
- Inicializa Socket.IO
- Inicia Delivery Timeout Job
- Escuta em `process.env.PORT`

#### 3️⃣ `src/models/User.ts` - Hierarquia de Roles
```typescript
type Role = 
  | 'ceo'               // Super admin
  | 'marketing'        // Marketing
  | 'gerente_geral'    // Gerente geral
  | 'gerente_clientes' // Gerente de clientes
  | 'gerente_lojistas' // Gerente de lojistas
  | 'gerente_motoboys' // Gerente de motoboys
  | 'lojista'          // Dono de loja
  | 'cliente'          // Comprador
  | 'motoboy';         // Entregador

interface IUser {
  roles: Role[];        // Múltiplos roles
  activeRole: Role;     // Role ativo agora
  storeId?: string;     // Se for lojista
  permissions?: string[]; // Cache de permissões
  bankInfo?: {...};     // Info bancária criptografada
}
```

---

## 💾 Models (Banco de Dados)

### User Model
```typescript
{
  name: string
  email: string (unique)
  passwordHash: string
  roles: Role[]
  activeRole: Role
  storeId?: ObjectId        // Referência à loja (se lojista)
  permissions?: string[]    // Cache
  telefone?: string
  cpf?: string
  photo?: string
  bankInfo?: {              // Criptografado
    banco: string
    agencia: string
    conta: string
    cpfBanco: string
    isConfigured: boolean
  }
  addresses: IUserAddress[]
  createdAt: Date
  updatedAt: Date
}
```

### Order Model
```typescript
{
  customerId: ObjectId      // Quem comprou
  storeId: ObjectId         // Onde comprou
  products: Array<{
    productId: ObjectId
    quantity: number
    price: number           // Snapshot no momento
  }>
  totalValue: number
  deliveryFee: number
  status: 'criado' | 'pago' | 'aguardando_motoboy' | 'enviado' | 'entregue' | 'cancelado'
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded'
  paymentId?: string        // ID do gateway de pagamento
  cancellationId?: ObjectId // Referência a Cancellation
  idempotentKey?: string    // Prevenir duplicação
  walletDistribution?: {
    storeAmount: number
    ceoAmount: number
    storeFeePercent: number
  }
  deliveryId?: ObjectId
  storeRating?: number
  storeComment?: string
  createdAt: Date
  updatedAt: Date
}
```

### Wallet Model
```typescript
{
  owner: string             // userId, storeId ou 'platform'
  ownerType: 'user' | 'store' | 'platform' | 'motoboy'
  
  balance: number           // Saldo atual
  totalIncome: number       // Total que entrou
  totalSpent: number        // Total que saiu
  
  platformFeeRate?: number  // Para lojistas: % de taxa
  
  gamificationBenefits?: {
    freeDeliveriesAvailable: number
    discountPercentage: number
    lastRedeemedAt?: Date
  }
  
  history: Array<{
    date: Date
    type: 'credit' | 'debit' | 'refund'
    category: 'deposit' | 'withdrawal' | 'payment' | 'refund' | 'transfer' | 'penalty'
    amount: number
    reason: string
    paymentMethod?: string  // 'credit_card', 'pix', 'bank_transfer'
    relatedId?: string      // orderId, deliveryId, etc
    reference?: string
  }>
  
  createdAt: Date
  updatedAt: Date
}
```

### Delivery Model
```typescript
{
  orderId: ObjectId
  storeId: ObjectId
  customerId: ObjectId
  motoboyId?: ObjectId      // Quem reivindicou
  
  status: 'pendente' | 'coletada' | 'saiu' | 'entregue' | 'cancelada'
  
  pickupLocation: {
    latitude: string
    longitude: string
  }
  deliveryLocation: {
    latitude: string
    longitude: string
    address: string
  }
  
  pin: string               // PIN para confirmar entrega
  
  claimedAt?: Date
  startedAt?: Date
  completedAt?: Date
  
  rating?: number           // Avaliação do motoboy
  feedback?: string
}
```

### Store Model
```typescript
{
  name: string
  ownerId: ObjectId         // User que é o lojista
  
  description?: string
  category?: string
  logo?: string
  
  address: {
    street: string
    number: string
    city: string
    state: string
    latitude: string
    longitude: string
  }
  
  plan?: number             // 1, 2, 3 (plano atual)
  planExpiresAt?: Date
  
  isActive: boolean
  rating?: number
  reviewCount?: number
  
  createdAt: Date
  updatedAt: Date
}
```

### Outros Models
- **Product**: Nome, preço, estoque, imagem, loja
- **Category**: Nome, descrição, ícone
- **Cancellation**: Motivo, refund status, historia
- **Notification**: Conteúdo, recipients, read status
- **Gamification**: Pontos, ranking, redemptions
- **Transaction**: Log de todas as transações
- **WithdrawalRequest**: Pedido de saque
- **PricingPlan**: Configuração de planos
- **PlatformConfig**: Configurações globais

---

## 🎮 Controllers (Lógica de Negócio)

### 1. authController.ts

```typescript
// ✅ FUNÇÕES PRINCIPAIS
export const register = async (req, res)
  // Valida dados, faz hash de senha, cria wallet, retorna token
  // Roles: ['cliente'] ou ['lojista', 'cliente']
  // Obrigatório foto para lojista/motoboy

export const login = async (req, res)
  // Email + senha → JWT token com userId e activeRole

export const switchRole = async (req, res)
  // Altera activeRole do usuário logado
  // Retorna novo token

export const logout = async (req, res)
  // Invalida JWT (implementação simples)

export const updateProfile = async (req, res)
  // Atualiza dados do usuário

export const getProfile = async (req, res)
  // Retorna dados do usuário logado
```

### 2. orderController.ts

```typescript
export const createOrder = async (req, res)
  // POST /api/orders
  // Cria pedido com produtos
  // Calcula distribuição de wallet (loja, CEO, motoboy)
  // Valida estoque
  // Retorna orderId com totalValue

export const getOrder = async (req, res)
  // GET /api/orders/:id
  // Retorna pedido com detalhes (produtos, delivery, etc)

export const listOrders = async (req, res)
  // GET /api/orders
  // Filtra por customerId/storeId/status

export const acceptOrder = async (req, res)
  // PUT /api/orders/:id/accept
  // Lojista aceita pedido
  // Status: criado → pago

export const rejectOrder = async (req, res)
  // PUT /api/orders/:id/reject
  // Lojista rejeita (refund automático)

export const cancelOrder = async (req, res)
  // PUT /api/orders/:id/cancel
  // Cliente cancela (refund se pago)
  // Cria Cancellation record

export const evaluateStore = async (req, res)
  // POST /api/orders/:id/evaluate-store
  // Cliente avalia loja (1-5 stars)
```

### 3. deliveryController.ts

```typescript
export const claimDelivery = async (req, res)
  // POST /api/deliveries/:id/claim
  // Motoboy reclama entrega (first-claim-wins)
  // Inicia timeout job (30 min)

export const updateDeliveryStatus = async (req, res)
  // PUT /api/deliveries/:id/status
  // Motoboy atualiza status (coletada, saiu, entregue)

export const finalizeDelivery = async (req, res)
  // POST /api/deliveries/:id/finalizar
  // Motoboy finaliza com PIN
  // Completa ordem e distribui wallet

export const getAvailableDeliveries = async (req, res)
  // GET /api/deliveries/available
  // Lista entregas disponíveis para reivindicar

export const getMotoboyDeliveries = async (req, res)
  // GET /api/deliveries/ongoing
  // Entregas do motoboy logado

export const rateMotobody = async (req, res)
  // POST /api/deliveries/:id/rate
  // Cliente avalia motoboy
```

### 4. walletController.ts

```typescript
export const getWallet = async (req, res)
  // GET /api/wallets/:userId
  // Retorna saldo + histórico

export const getMyWallet = async (req, res)
  // GET /api/wallets/my-wallet
  // Retorna carteira do usuário logado
  // Filtra por role ativo (user/store)

export const getStoreWallet = async (req, res)
  // GET /api/wallets/store/:storeId
  // Retorna carteira da loja

export const creditWallet = async (req, res)
  // POST /api/wallets/:userId/credit
  // Cliente adiciona saldo (cartão/PIX)
  // Cria histórico

export const transferWallet = async (req, res)
  // POST /api/wallets/:userId/transfer
  // Transferência entre usuários

export const withdrawWallet = async (req, res)
  // POST /api/wallets/:userId/withdraw
  // Saque para conta bancária
  // Cria WithdrawalRequest

export const getWalletHistory = async (req, res)
  // GET /api/wallets/:userId/history
  // Histórico completo com paginação

export const getPlatformMetrics = async (req, res)
  // GET /api/wallets/platform/metrics
  // CEO visualiza total de transações (CEO only)
```

### 5. productController.ts

```typescript
export const createProduct = async (req, res)
  // POST /api/products
  // Lojista cria produto (com upload de imagem)

export const listProducts = async (req, res)
  // GET /api/products?storeId=...
  // Lista produtos filtrados

export const getProduct = async (req, res)
  // GET /api/products/:id

export const updateProduct = async (req, res)
  // PUT /api/products/:id
  // Lojista atualiza produto

export const deleteProduct = async (req, res)
  // DELETE /api/products/:id
  // Lojista deleta produto

export const updateStock = async (req, res)
  // PUT /api/products/:id/stock
  // Atualiza quantidade em estoque
```

---

## 🛣️ Routes (Endpoints)

### Auth Routes
```
POST   /api/auth/register      // Criar usuário
POST   /api/auth/login         // Autenticar
POST   /api/auth/switch-role   // Trocar role ativo
GET    /api/auth/profile       // Perfil logado
```

### Order Routes
```
POST   /api/orders             // Criar pedido
GET    /api/orders             // Listar meus pedidos
GET    /api/orders/:id         // Detalhes do pedido
PUT    /api/orders/:id/accept  // Lojista aceita
PUT    /api/orders/:id/reject  // Lojista rejeita
PUT    /api/orders/:id/cancel  // Cliente cancela
POST   /api/orders/:id/rate    // Cliente avalia loja
```

### Delivery Routes
```
POST   /api/deliveries/:id/claim        // Motoboy reclama
PUT    /api/deliveries/:id/status       // Atualiza status
POST   /api/deliveries/:id/finalizar    // Finaliza com PIN
GET    /api/deliveries/available        // Entregas disponíveis
GET    /api/deliveries/ongoing          // Minhas entregas
POST   /api/deliveries/:id/avaliar      // Cliente avalia motoboy
```

### Wallet Routes
```
GET    /api/wallets/:userId             // Saldo do usuário
GET    /api/wallets/my-wallet           // Minha carteira
GET    /api/wallets/store/:storeId      // Carteira da loja
POST   /api/wallets/:userId/credit      // Carregar saldo
POST   /api/wallets/:userId/transfer    // Transferir
POST   /api/wallets/:userId/withdraw    // Sacar
GET    /api/wallets/:userId/history     // Histórico
GET    /api/wallets/platform/metrics    // Métricas (CEO)
```

### Product Routes
```
POST   /api/products                    // Criar produto
GET    /api/products                    // Listar produtos
GET    /api/products/:id                // Detalhes
PUT    /api/products/:id                // Atualizar
DELETE /api/products/:id                // Deletar
PUT    /api/products/:id/stock          // Atualizar estoque
```

### Store Routes
```
POST   /api/stores                      // Criar loja
GET    /api/stores                      // Listar lojas
GET    /api/stores/:id                  // Detalhes
PUT    /api/stores/:id                  // Atualizar
```

### Admin Routes
```
GET    /api/admin/users                 // Listar usuários (CEO)
PUT    /api/admin/users/:id/role        // Mudar role do usuário (CEO)
PUT    /api/admin/users/:id/status      // Ativar/desativar (CEO)
GET    /api/admin/metrics/platform      // Métricas globais (CEO)
```

### Gamification Routes
```
GET    /api/gamification/:user_id       // Pontos do motoboy
POST   /api/gamification/:user_id/add   // Adicionar pontos
GET    /api/gamification/ranking        // Ranking global
GET    /api/gamification/ranking-mensal // Ranking mensal
POST   /api/gamification/redeem         // Resgatar prêmios
```

---

## 🔐 Middleware & Segurança

### auth.ts
```typescript
export const authenticate = (req, res, next)
  // Valida JWT no header Authorization
  // Popula req.user com {id, role}

export const authorizeRoles = (...roles) => (req, res, next)
  // Verifica se activeRole do usuário está em roles permitidos
```

### authorize.ts (Novo)
```typescript
export const authorizePermission = (permission) => (req, res, next)
  // Valida se usuário tem permissão específica

export const authorizeCEO = (req, res, next)
  // Verifica se activeRole === 'ceo'

export const authorizeManager = (req, res, next)
  // Verifica se é gerente de alguma categoria
```

### validate.ts
```typescript
export const validate = (schema: ZodSchema) => (req, res, next)
  // Valida body/params contra schema Zod
  // Retorna 400 se falhar validação
```

### errorHandler.ts
```typescript
export const errorHandler = (err, req, res, next)
  // Centraliza tratamento de erros
  // Logga exceções
  // Retorna 500 com mensagem segura
```

### Rate Limiting
```typescript
// Em app.ts:
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min
  max: 5,                     // 5 tentativas
})

const orderLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1 min
  max: 10,                    // 10 pedidos
})

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1 min
  max: 100,                   // 100 requests
})

app.use('/api/auth', authLimiter, authRoutes)
app.use('/api/orders', orderLimiter, ordersRoutes)
app.use('/api/', apiLimiter)
```

### CORS
```typescript
const allowedOrigins = env.CORS_ORIGIN.split(',')

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error(`CORS not allowed for ${origin}`))
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))
```

---

## 🎨 Frontend - Estrutura Detalhada

### Estrutura de Diretórios

```
frontend/
├── pages/                        # Next.js Pages Router
│   ├── _app.tsx                 # ✅ Setup global (contexts, tema)
│   ├── _document.tsx            # HTML root
│   ├── index.tsx                # Home (landing page)
│   ├── login.tsx                # Tela de login
│   ├── register.tsx             # Tela de registro
│   ├── inicio.tsx               # Dashboard para cliente
│   ├── checkout.tsx             # Checkout de pedido
│   ├── order-[id].tsx           # Detalhe do pedido
│   │
│   ├── seller/                  # 📂 Dashboard do Lojista
│   │   ├── index.tsx            # Overview
│   │   ├── products/            # Gestão de produtos
│   │   ├── orders/              # Pedidos da loja
│   │   └── settings.tsx         # Configurações
│   │
│   ├── motoboy/                 # 📂 Dashboard do Motoboy
│   │   ├── index.tsx            # Entregas disponíveis
│   │   ├── ongoing/             # Entregas em andamento
│   │   └── history.tsx          # Histórico
│   │
│   ├── admin/                   # 📂 Dashboard CEO
│   │   ├── index.tsx            # Overview de métricas
│   │   ├── users.tsx            # Gestão de usuários
│   │   ├── stores.tsx           # Gestão de lojas
│   │   └── transactions.tsx     # Histórico transações
│   │
│   ├── stores.tsx               # Listagem de lojas
│   ├── store/[id].tsx           # Detalhe da loja
│   ├── product/[id].tsx         # Detalhe do produto
│   ├── wallet.tsx               # Minha carteira
│   ├── my-wallet.tsx            # Alternativo de carteira
│   ├── notifications.tsx        # Notificações
│   ├── user-profile.tsx         # Perfil do usuário
│   ├── user-dashboard.tsx       # Dashboard do cliente
│   ├── avaliar-motoboy.tsx      # Avaliação de motoboy
│   └── access-denied.tsx        # 403 Forbidden
│
├── components/                  # ✅ Componentes reutilizáveis
│   ├── Header.tsx
│   ├── Navbar.tsx
│   ├── Footer.tsx
│   ├── ProductCard.tsx
│   ├── OrderCard.tsx
│   ├── DeliveryStatus.tsx
│   ├── WalletBalance.tsx
│   └── ... (20+ componentes)
│
├── contexts/                    # ✅ State Management
│   ├── AuthContext.tsx          # Usuário logado
│   ├── CartContext.tsx          # Carrinho de compras
│   ├── ThemeContext.tsx         # Tema (light/dark)
│   └── NotificationContext.tsx  # Notificações em tempo real
│
├── hooks/                       # ✅ Custom Hooks
│   ├── useAuth.ts              # Acesso a AuthContext
│   ├── useCart.ts              # Acesso a CartContext
│   ├── useApi.ts               # Requisições HTTP
│   └── useSocket.ts            # Conexão Socket.IO
│
├── lib/                         # Utilitários
│   ├── api.ts                  # Axios setup
│   ├── socket.ts               # Socket.IO client
│   └── utils.ts                # Helpers
│
├── styles/                      # CSS Global
│   ├── globals.css
│   └── variables.css
│
├── config/                      # Configuração
│   └── constants.ts            # URLs, mensagens, etc
│
├── public/                      # Assets estáticos
│   ├── images/
│   ├── icons/
│   └── fonts/
│
├── next.config.js              # Configuração Next.js
├── tsconfig.json               # TypeScript config
└── package.json
```

### Páginas Principais

#### 1. `_app.tsx` - Setup Global
```typescript
// Contextos globais
- AuthContext (usuário logado)
- CartContext (carrinho)
- NotificationContext (real-time)

// Tema (light/dark mode)

// Socket.IO listener
```

#### 2. `login.tsx` - Autenticação
```typescript
// Formulário com email + senha
// POST /api/auth/login
// Salva token em localStorage
// Redireciona para dashboard (baseado em role)
```

#### 3. `checkout.tsx` - Compra
```typescript
// Resumo do carrinho
// Endereço de entrega
// Método de pagamento (wallet, cartão, PIX)
// Confirmação e criação de Order
// WebSocket para atualizar status em tempo real
```

#### 4. `seller/index.tsx` - Dashboard Lojista
```typescript
// Pedidos pendentes da loja
// Produtos da loja
// Saldo da carteira
// Estatísticas de vendas
// Aceitar/rejeitar pedidos em tempo real
```

#### 5. `motoboy/index.tsx` - Dashboard Motoboy
```typescript
// Entregas disponíveis para reivindicar
// Entregas em andamento (mapa + rastreamento)
// Histórico de entregas
// Rating e gamificação
// Reivindicar nova entrega (claim)
```

#### 6. `admin/index.tsx` - Dashboard CEO
```typescript
// Métricas globais (receita, transações, usuários)
// Gráficos de performance
// Alertas e eventos importantes
// Gestão de usuários e permissões
```

---

## 🔄 Fluxo de Dados

### 1️⃣ Fluxo de Autenticação

```
┌─────────────┐
│   CLIENTE   │
│  (Browser)  │
└──────┬──────┘
       │ 1. POST /api/auth/register ou /login
       ▼
┌─────────────────────────────────────────┐
│   BACKEND - authController.ts           │
├─────────────────────────────────────────┤
│ 1. Validar email/senha                  │
│ 2. Hash de senha com bcrypt             │
│ 3. Criar User document                  │
│ 4. Criar Wallet para novo usuário       │
│ 5. Gerar JWT com {id, activeRole}       │
└──────┬──────────────────────────────────┘
       │ 2. Resposta: {token, user}
       ▼
┌──────────────────────────┐
│   FRONTEND - AuthContext │
│ 1. Salva token em local  │
│ 2. Popula user state     │
│ 3. Redireciona dashboard │
└──────────────────────────┘
```

### 2️⃣ Fluxo de Criação de Pedido

```
┌─────────────────────────┐
│  CLIENTE - checkout.tsx │
│ 1. Escolhe produtos     │
│ 2. Seleciona endereço   │
│ 3. Seleciona pagamento  │
└────────────┬────────────┘
             │ 1. POST /api/orders
             │ (com JWT no header)
             ▼
┌──────────────────────────────────────────────┐
│  BACKEND - orderController.createOrder()     │
├──────────────────────────────────────────────┤
│ 1. authenticate middleware valida JWT        │
│ 2. validate middleware verifica schema       │
│ 3. Recupera produtos do DB                   │
│ 4. Calcula totalValue + deliveryFee          │
│ 5. Calcula distribuição de wallet:           │
│    - storeAmount = total * (1 - fee%)        │
│    - ceoAmount = total * fee%                │
│ 6. Debita wallet do cliente (-amount)        │
│ 7. Cria Order document com status 'criado'   │
│ 8. Emite socket event para lojista           │
│ 9. Emite socket event para motoboys          │
└──────┬───────────────────────────────────────┘
       │ 2. Response: {orderId, totalValue}
       ▼
┌──────────────────────────────────────┐
│  FRONTEND - Socket listener          │
│  'order:new' event                   │
│ 1. Atualiza status do pedido         │
│ 2. Mostra confirmação ao cliente     │
└──────────────────────────────────────┘
```

### 3️⃣ Fluxo de Aceitação de Pedido

```
┌──────────────────────────┐
│  LOJISTA - seller app    │
│ Clica "Aceitar Pedido"   │
└────────────┬─────────────┘
             │ 1. PUT /api/orders/:id/accept
             ▼
┌──────────────────────────────────────────────┐
│  BACKEND - orderController.acceptOrder()     │
├──────────────────────────────────────────────┤
│ 1. Validar que lojista é dono da loja        │
│ 2. Mudar status: 'criado' → 'pago'           │
│ 3. Salvar no DB                              │
│ 4. Emitir socket para cliente: 'pedido:aceito' │
│ 5. Emitir socket para motoboys: 'entrega:disponível' │
└──────┬───────────────────────────────────────┘
       │ 2. Response: {status: 'pago'}
       ▼
┌─────────────────────────────────┐
│  CLIENTES & MOTOBOYS recebem    │
│  socket event em tempo real      │
└─────────────────────────────────┘
```

### 4️⃣ Fluxo de Entrega

```
┌───────────────────────────┐
│  MOTOBOY - motoboy app    │
│ Lista entregas disponíveis│
│ Clica "Reivindicar"       │
└────────────┬──────────────┘
             │ 1. POST /api/deliveries/:id/claim
             ▼
┌──────────────────────────────────────────────┐
│  BACKEND - deliveryController.claimDelivery()│
├──────────────────────────────────────────────┤
│ 1. Verificar se já foi reivindicada          │
│ 2. Associar motoboyId à entrega              │
│ 3. Status: 'pendente' → 'coletada'           │
│ 4. Iniciar timeout job (30 min)              │
│ 5. Emitir socket: 'entrega:reivindicada'     │
└──────┬───────────────────────────────────────┘
       │ 2. Response: {deliveryId, pickupLocation}
       ▼
┌────────────────────────────────────────────────┐
│  MOTOBOY - Navega até loja com mapa           │
│  Confirma coleta                               │
│  PUT /api/deliveries/:id/status → 'saiu'     │
└────────────────────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────────────┐
│  MOTOBOY - Navega até cliente                  │
│  PUT /api/deliveries/:id/status → 'entregue'  │
│  POST /api/deliveries/:id/finalizar + PIN     │
└────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│  BACKEND - finalizeDelivery()                 │
├──────────────────────────────────────────────┤
│ 1. Validar PIN                                │
│ 2. Status: 'entregue'                         │
│ 3. Distribuir saldo:                          │
│    - Loja recebe: storeAmount                 │
│    - CEO recebe: ceoAmount                    │
│    - Motoboy recebe: deliveryFee              │
│ 4. Criar Transaction records                  │
│ 5. Emitir socket para todos                   │
└──────┬───────────────────────────────────────┘
       │ 2. Response: {transactionId}
       ▼
┌────────────────────────────────────────────────┐
│  Todos recebem notificações em tempo real      │
│  - Cliente: pedido entregue                    │
│  - Loja: ganhou saldo                          │
│  - Motoboy: ganhou saldo + gamificação         │
│  - CEO: receita plataforma                     │
└────────────────────────────────────────────────┘
```

---

## 🌟 Funcionalidades Principais

### 1. Sistema de Wallets
- ✅ Cada usuário/loja/motoboy tem carteira
- ✅ Histórico de crédito/débito/refund
- ✅ Categorias de transação (depósito, saque, pagamento, etc)
- ✅ Saque para conta bancária (criptografado)
- ✅ Transferência entre usuários

### 2. Múltiplos Roles com Permissões
- ✅ 9 roles: CEO, Marketing, Gerentes (4), Lojista, Cliente, Motoboy
- ✅ Usuário pode ter múltiplos roles
- ✅ Role ativo determina permissões
- ✅ Cached permissions para performance

### 3. Planos de Preço
- ✅ Lojistas contratam planos (1, 2, 3)
- ✅ Cada plano tem % de taxa diferente
- ✅ CEO pode aprovar/rejeitar mudanças de plano
- ✅ Configuração de taxas em PlatformConfig

### 4. Gamificação
- ✅ Motoboys ganham pontos por entrega
- ✅ Ranking mensal + geral
- ✅ Resgate de prêmios (free deliveries, discounts)
- ✅ Visibilidade de pontos no dashboard

### 5. Cancelamentos
- ✅ Cliente pode cancelar pedido (com refund)
- ✅ Lojista pode rejeitar pedido
- ✅ Fluxo complexo com estados
- ✅ Notificações automáticas

### 6. Notificações Real-Time
- ✅ Socket.IO para notificações instantâneas
- ✅ Status de pedido em tempo real
- ✅ Eventos de entrega (coletada, saiu, entregue)
- ✅ Mensagens do CEO para gerentes

### 7. Segurança
- ✅ JWT authentication
- ✅ Rate limiting (auth, orders, general)
- ✅ CORS com whitelist
- ✅ Validação com Zod
- ✅ Hash de senhas com bcrypt
- ✅ Dados bancários criptografados

### 8. Jobs Agendados
- ✅ Delivery Timeout Job (30 min de inatividade)
- ✅ Lógica: Se motoboy não atualiza status → libera entrega
- ✅ Notifica motoboy da penalidade

---

## 📝 Padrões & Boas Práticas

### 1. Estrutura MVC + Services
```
Request
  ↓
Routes (definem endpoints)
  ↓
Middleware (validação, auth, logging)
  ↓
Controllers (orquestram lógica)
  ↓
Services (regra de negócio complexa)
  ↓
Models (acesso a dados)
  ↓
MongoDB
```

### 2. Validação com Zod
```typescript
// Define schema
const CreateOrderSchema = z.object({
  storeId: z.string().min(1),
  products: z.array(z.object({
    productId: z.string(),
    quantity: z.number().min(1)
  })),
  deliveryFee: z.number().min(0)
})

// Usa em rota
router.post('/', validate(CreateOrderSchema), createOrder)
```

### 3. Error Handling
```typescript
// Classe customizada
class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message)
  }
}

// No controller
if (!product) throw new AppError(404, 'Produto não encontrado')

// No middleware errorHandler
app.use(errorHandler)
```

### 4. Logging
```typescript
import logger from './config/logger'

logger.info('Pedido criado', {orderId, customerId})
logger.error('Erro ao finalizar entrega', {deliveryId, error})
```

### 5. Socket.IO Events
```typescript
// Servidor emite
io.to(room).emit('order:new', {orderId, ...})

// Cliente escuta
socket.on('order:new', (data) => {
  updateOrderStatus(data)
})
```

### 6. Rate Limiting por Tipo
```typescript
// Auth endpoints: 5 tentativas em 15 min
app.use('/api/auth', authLimiter, authRoutes)

// Order endpoints: 10 em 1 min
app.use('/api/orders', orderLimiter, ordersRoutes)

// Geral: 100 em 1 min
app.use('/api/', apiLimiter)
```

---

## ⚠️ Problemas Conhecidos & TODO

### 1. Problemas Ativos

#### 🔴 CRÍTICO
- [ ] Validação de idempotência em createOrder
  - Problema: Requests duplicadas podem criar múltiplos orders
  - Solução: Usar idempotentKey (já está no schema)
  
#### 🟡 IMPORTANTE
- [ ] Rate limiting não funciona bem com proxies
  - Problema: X-Forwarded-For pode ser fake
  - Solução: Validar IP corretamente (já feito em app.ts)
  
- [ ] Cache de permissions pode ficar stale
  - Problema: Permissions não atualizam em tempo real
  - Solução: Adicionar invalidation de cache

- [ ] Socket.IO não reconecta automaticamente
  - Problema: Cliente desconecta e perde eventos
  - Solução: Implementar reconnection logic no frontend

#### 🟠 MELHORIAS
- [ ] Paginação em listagens grandes (orders, users)
- [ ] Busca e filtros avançados
- [ ] Testes unitários para controllers
- [ ] Integração com gateway de pagamento real
- [ ] Armazenamento de imagens em S3 (ao invés de local)
- [ ] Compressão de imagens antes de upload

### 2. TODO List

#### Backend
- [ ] Implementar soft-delete para User/Store/Product
- [ ] Adicionar auditoria (quem/quando modificou)
- [ ] Webhooks para notificação de pagamento
- [ ] Rate limiting por usuário (não apenas IP)
- [ ] Criptografia E2E para dados sensíveis
- [ ] Backup automático do MongoDB
- [ ] Monitoramento com Sentry/DataDog
- [ ] API documentation com Swagger

#### Frontend
- [ ] Offline mode (service workers)
- [ ] PWA (installable app)
- [ ] Dark mode completo
- [ ] Mapa em tempo real com rastreamento
- [ ] Chat entre cliente e lojista
- [ ] Video ao receber pedido (Lojista)
- [ ] Geolocalização automática

#### DevOps
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Staging environment
- [ ] Database migrations tool (e.g., Migrate)
- [ ] Environment-specific configs
- [ ] Health checks e alertas
- [ ] Load balancing
- [ ] Redis para cache/sessions

---

## 🚀 Como Começar a Desenvolver

### 1. Setup Local

```bash
# Clone repo
git clone https://github.com/devasafe/XDXRXOXPX
cd XDXRXOXPX

# Backend
npm install
cp .env.example .env
npm run dev

# Frontend (em outro terminal)
cd frontend
npm install
npm run dev
```

### 2. Variáveis de Ambiente

**`.env`**
```
NODE_ENV=development
PORT=3001
MONGODB_URI=mongodb://localhost:27017/drop
JWT_SECRET=sua-chave-secreta-muito-segura
CORS_ORIGIN=http://localhost:3000,http://localhost:3001
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
AUTH_LIMITER_WINDOW_MS=900000
AUTH_LIMITER_MAX=5
```

### 3. Entender o Fluxo

1. **Estude um fluxo completo**: cliente criando pedido até entrega
2. **Trace o código**: login → order creation → delivery → wallet distribution
3. **Procure por edge cases**: cancelamento, timeout, refund
4. **Leia o modelo**: understand relationships (User → Order → Delivery)

### 4. Fazer Primeira Mudança

1. Abra `src/controllers/orderController.ts`
2. Entenda a função `createOrder()`
3. Adicione um log antes de criar order: `console.log('Creating order for:', customerId)`
4. Teste com `npm run dev`

---

## 📊 Estatísticas do Projeto

```
Backend:
- Controllers: 17 arquivos
- Models: 15 arquivos
- Routes: 13+ arquivos
- Middleware: 6 arquivos
- Linhas de código: ~8000+

Frontend:
- Pages: 20+ arquivos
- Components: 20+ arquivos
- Contexts: 4 arquivos
- Hooks: 4+ arquivos
- Linhas de código: ~5000+

Total:
- Arquivos TypeScript: 60+
- Dependências npm: 40+
- Endpoints API: 50+
- Socket.IO events: 20+
- MongoDB collections: 15
```

---

## 🎓 Lições Aprendidas

1. **Hierarquia de roles complexa** → Use cache de permissões
2. **Múltiplas wallets** → Manter saldo + histórico bem separados
3. **WebSocket em tempo real** → Emitir para rooms específicos
4. **Rate limiting** → Necessário em endpoints de dinheiro
5. **Validação de dados** → Zod reduz bugs em 80%
6. **Logging centralizado** → Winston salva vidas em debug

---

## 📞 Próximos Passos

1. **Estudar socket.ts** → Como eventos real-time funcionam
2. **Estudar walletCalculations.ts** → Matemática de distribuição
3. **Estudar cancellationController.ts** → Fluxo de cancelamento
4. **Implementar testes** → Jest + Supertest

 - - - 

**Fim do Estudo Completo** ✅

Qualquer dúvida, estude novamente os controllers e models!
