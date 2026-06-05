# 📐 Arquitetura do Drop - Marketplace de Delivery

## Visão Geral

**Drop** é uma application full-stack baseada em uma arquitetura **MERN** (MongoDB, Express, React, Node.js) moderna, com tipagem TypeScript em ambos backend e frontend.

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (Next.js 13)                   │
│  localhost:3000 | React 18 + TypeScript + TailwindCSS      │
└─────────────────────────────────────────────────────────────┘
                              ↕
                        Axios HTTP/REST
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (Express.js)                     │
│  localhost:4000 | Node.js + TypeScript + Mongoose          │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                   DATABASE (MongoDB)                        │
│           Mongoose ODM | Relational + Document              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Stack Técnico

### Frontend
- **Framework**: Next.js 13.5.0
- **UI Library**: React 18.2.0
- **Linguagem**: TypeScript
- **HTTP Client**: Axios 1.4.0
- **State Management**: React Context (Auth, Cart)
- **Maps**: Google Maps JavaScript API
- **Real-time**: Socket.io Client
- **Estilos**: CSS Modules

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js 4.18.2
- **Linguagem**: TypeScript + Strict Mode
- **Database ORM**: Mongoose 7.0.0
- **Database**: MongoDB
- **Autenticação**: JWT
- **WebSocket**: Socket.io 4.8.0
- **Validação**: Zod 3.21.4
- **File Upload**: Multer 1.4.4
- **Criptografia**: Bcrypt 5.1.0
- **Data**: Dayjs 1.11.19

---

## 🏗️ Arquitetura do Backend

### Padrão: MVC + Services

```
src/
├── app.ts                 # Configuração principal do Express
├── index.ts               # Entrypoint
├── db.ts                  # Conexão MongoDB
│
├── controllers/           # Lógica de requisição/resposta
│   ├── authController.ts
│   ├── userController.ts
│   ├── addressController.ts
│   ├── storeController.ts
│   ├── productController.ts
│   ├── orderController.ts
│   ├── deliveryController.ts
│   ├── categoryController.ts
│   ├── gamificationController.ts
│   ├── notificationsController.ts
│   ├── orderListController.ts
│   └── notificationsListController.ts
│
├── routes/                # Definição de endpoints
│   ├── auth.ts
│   ├── users.ts
│   ├── addresses.ts
│   ├── stores.ts
│   ├── products.ts
│   ├── orders.ts
│   ├── deliveries.ts
│   ├── categories.ts
│   ├── gamification.ts
│   └── notifications.ts
│
├── models/                # Schemas Mongoose
│   ├── User.ts            # Usuários (clientes, lojistas, motoboys)
│   ├── Address.ts         # Endereços (array dentro de User)
│   ├── Store.ts           # Lojas/Comerciantes
│   ├── Product.ts         # Produtos
│   ├── Order.ts           # Pedidos
│   ├── Delivery.ts        # Entregas
│   ├── Category.ts        # Categorias de produtos
│   ├── Notification.ts    # Notificações
│   ├── Gamification.ts    # Pontos e badges
│   └── Transaction.ts     # Transações (futuro)
│
├── services/              # Lógica de negócio
│   └── notifier.ts        # Socket.io + notificações em tempo real
│
├── middleware/            # Express middlewares
│   ├── auth.ts            # JWT verification + role-based authorization
│   ├── validation.ts      # Zod validation
│   └── ...
│
├── types/                 # TypeScript interfaces
│   └── index.ts           # AuthenticatedRequest, IUser, etc
│
├── validation/            # Zod schemas
│   └── schemas.ts
│
├── utils/                 # Funções utilitárias
│   ├── slugify.ts
│   └── ...
│
└── tests/                 # Jest test suites
    └── ...
```

### Data Models (MongoDB)

```typescript
// User (múltiplos roles)
{
  _id: ObjectId
  name: string
  email: string (unique)
  passwordHash: string (bcrypt)
  role: "customer" | "lojista" | "motoboy"
  mainAddress?: IUserAddress
  addresses: [IUserAddress]
  cpf?: string
  phone?: string
  createdAt: Date
}

// Store (Loja)
{
  _id: ObjectId
  name: string
  ownerId: ObjectId (ref: User)
  slug: string (unique)
  description?: string
  image?: string
  rating?: number
  mainAddress?: IUserAddress
  deliveryRadius?: number
  createdAt: Date
}

// Product
{
  _id: ObjectId
  storeId: ObjectId (ref: Store)
  name: string
  description?: string
  price: number
  quantity: number
  category: string
  subCategory?: string
  tags?: [string]
  image?: string
  createdAt: Date
}

// Order
{
  _id: ObjectId
  customerId: ObjectId (ref: User)
  storeId: ObjectId (ref: Store)
  products: [{ productId, quantity, price }]
  totalValue: number
  status: "pending" | "confirmed" | "preparing" | "ready" | "entregue" | "cancelado"
  paymentMethod: "pix" | "cartao" | "dinheiro"
  deliveryId?: ObjectId (ref: Delivery)
  createdAt: Date
}

// Delivery
{
  _id: ObjectId
  orderId: ObjectId (ref: Order)
  motoboyId?: ObjectId (ref: User)
  status: "pending" | "assigned" | "pickup" | "in_transit" | "delivered" | "failed"
  pickupAddress: IUserAddress
  deliveryAddress: IUserAddress
  rating?: number
  startedAt?: Date
  completedAt?: Date
  createdAt: Date
}

// Gamification
{
  _id: ObjectId
  user_id: ObjectId (ref: User)
  points: number
  totalPoints: number
  level: "Bronze" | "Prata" | "Ouro" | "Platina"
  badges: [string]
  history: [{ date, action, points }]
}
```

### Fluxo de Requisição

```
Request → Router → Middleware (JWT, Validation)
  ↓
Controller (Business Logic) → Service (Core Logic)
  ↓
Model (Database Operations) ← MongoDB
  ↓
Response (JSON) → Socket.io (Real-time updates)
```

### Autenticação & Autorização

- **JWT** com `authenticateToken` middleware
- **Role-based access control** com `authorizeRoles` 
- **Três roles**: customer, lojista, motoboy
- **JWT_SECRET** obrigatório (sem fallback inseguro)
- **Senha** criptografada com bcrypt

---

## 🎨 Arquitetura do Frontend

### Padrão: Next.js Pages Router + Context API

```
frontend/
├── pages/                 # Rotas via file-system
│   ├── _app.tsx           # Root component
│   ├── _document.tsx      # HTML template
│   ├── index.tsx          # Home page
│   ├── checkout.tsx       # Checkout com mapa
│   ├── register.tsx       # Registro
│   ├── login.tsx          # Login
│   ├── stores/
│   │   └── [id].tsx       # Detalhes da loja
│   ├── product/
│   │   └── [id].tsx       # Detalhes do produto
│   ├── user-dashboard.tsx # Painel do cliente
│   ├── order-[id].tsx     # Detalhes do pedido
│   └── seller/            # Rotas do lojista
│       ├── dashboard.tsx
│       ├── create-store.tsx
│       ├── products.tsx
│       ├── create-product.tsx
│       └── ...
│   
├── components/            # Componentes reutilizáveis
│   ├── AddressSelector.tsx
│   ├── Cart Component
│   ├── MapPicker.tsx      # Seletor de localização com mapa
│   ├── Nav.tsx            # Navigation
│   ├── MotoboyRouteMap.tsx
│   ├── Ratings Blocks
│   └── ...
│
├── contexts/              # State Management (Context API)
│   ├── AuthContext.tsx    # User, token, login/logout
│   └── CartContext.tsx    # Items do carrinho
│
├── pages/
│   ├── motoboy/           # Painel do motoboy
│   │   ├── dashboard.tsx
│   │   ├── ongoing.tsx
│   │   ├── history.tsx
│   │   └── ...
│   └── seller/            # Painel do lojista
│       ├── dashboard.tsx
│       ├── products.tsx
│       └── ...
│
├── lib/
│   ├── api.ts            # Axios instance (baseURL, interceptors)
│   └── utils.ts
│
├── styles/
│   ├── globals.css
│   └── modules/
│
├── hooks/                # Custom React hooks
│   └── ...
│
├── next.config.js        # Configuração Next.js
├── tsconfig.json         # TypeScript config
└── package.json
```

### Contexts (State Management)

```typescript
// AuthContext
{
  user: { id, name, email, role, mainAddress }
  token: string (JWT)
  login(email, password): Promise
  logout(): void
  isAuthenticated: boolean
}

// CartContext
{
  cart: [{ productId, quantity, name, price, storeId }]
  addToCart(item)
  removeFromCart(productId)
  clear()
}
```

### Fluxo de Página

```
_app.tsx (AuthProvider, CartProvider)
  ↓
_document.tsx (HTML template, Google Maps API)
  ↓
Page Component (Pages/checkout, etc)
  ↓
useAuth() / useCart() (Context hooks)
  ↓
api.ts (Axios calls)
  ↓
Express Backend (localhost:4000)
```

---

## 🔄 Fluxo de Comunicação

### Requisição HTTP (REST API)

```
Frontend (React/Next.js)
    ↓
    Axios → GET/POST/PUT/DELETE
    ↓
Backend (Express)
    ↓
    Routes → Controllers → Services → Models
    ↓
    MongoDB
    ↓
    Response JSON ← Backend
    ↓
Frontend (Update state/UI)
```

### Comunicação Real-time (WebSocket)

```
Backend (Socket.io Server)
    ↓
    notifier.ts (Socket instance)
    ↓
    Frontend (Socket.io Client)
    ↓
    Listen to events: order_update, delivery_assigned, etc
```

---

## 📋 Domínios (Features)

### 1. **Autenticação & Usuários**
- Registro / Login
- JWT token
- 3 roles: customer, lojista, motoboy
- Perfil do usuário

### 2. **Endereços**
- Múltiplos endereços por usuário
- Endereço principal
- Integração com Google Maps

### 3. **Lojas (Sellers)**
- Criar loja
- Dashboard com métricas
- Gerenciar produtos
- Ver pedidos
- Avaliações

### 4. **Produtos**
- CRUD de produtos
- Categoria/Subcategoria
- Upload de imagem
- Estoque

### 5. **Pedidos**
- Criar pedido
- Checkout com mapa
- Histórico
- Status tracking
- Avaliação

### 6. **Entregas**
- Atribuição de motoboy
- Rastreamento em tempo real
- Validação de PIN
- Histórico

### 7. **Gamificação**
- Pontos por entrega
- Badges
- Ranking mensal
- Níveis (Bronze, Prata, Ouro, Platina)

### 8. **Notificações**
- SSE (Server-Sent Events)
- Socket.io updates
- Notificações em tempo real

---

## 🔐 Segurança

✅ **Implementado:**
- JWT autenticação
- Password hashing (bcrypt)
- Role-based authorization
- TypeScript strict mode
- Input validation (Zod)
- CORS configurado
- No secrets em código

⚠️ **A Implementar:**
- Rate limiting
- HTTPS/TLS
- CSRF protection
- Structured logging
- Audit trails

---

## 📦 Tecnologias Principais

| Camada | Tecnologia | Versão |
|--------|-----------|---------|
| **Frontend** | Next.js | 13.5.0 |
| | React | 18.2.0 |
| | TypeScript | Latest |
| **Backend** | Express | 4.18.2 |
| | Node.js | ≥16 |
| | TypeScript | Latest |
| **Database** | MongoDB | Cloud/Local |
| | Mongoose | 7.0.0 |
| **Real-time** | Socket.io | 4.8.0 |
| **Auth** | JWT | Standard |
| **Maps** | Google Maps API | Latest |

---

## 🚀 Como Rodar

### Backend
```bash
cd d:\PROJETOS\Drop
npm install
npm run dev          # Localhost:4000
```

### Frontend
```bash
cd d:\PROJETOS\Drop\frontend
npm install
npm run dev          # Localhost:3000
```

---

## 📊 Diagrama Entidade-Relacionamento

```
User ─┬─→ multiple Address
      ├─→ Store (if lojista)
      ├─→ Order (if customer)
      ├─→ Delivery (if motoboy)
      └─→ Gamification

Store ──→ multiple Product
      └─→ Category

Product ─→ multiple OrderItem

Order ──┬─→ User (customer)
        ├─→ Store
        ├─→ Product (via OrderItem)
        └─→ Delivery

Delivery ─→ User (motoboy)
         └─→ Order

Category ─→ multiple Product
```

---

## 🎯 Próximos Passos (Roadmap)

- [ ] Payment integration (Stripe/PayPal)
- [ ] Advanced search & filtering
- [ ] Analytics dashboard
- [ ] Mobile app (React Native)
- [ ] Microservices refactoring
- [ ] GraphQL API alternative
- [ ] ElasticSearch indexing
- [ ] CI/CD pipeline
- [ ] Kubernetes deployment
- [ ] Advanced notifications (Email, SMS)

---

**Última atualização**: 23 de Fevereiro de 2026
