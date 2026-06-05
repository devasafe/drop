# 🏗️ ARQUITETURA: SYSTEM DE WALLETS + NOTIFICAÇÕES + ADMIN

**Data**: 28/02/2026  
**Status**: 🎨 Design Phase  
**Objetivo**: Implementar sistema completo de carteiras, notificações gerenciadas e painel administrativo com hierarquia de roles

---

## 📋 ÍNDICE

1. [Hierarquia de Roles](#hierarquia-de-roles)
2. [Sistema de Wallets](#sistema-de-wallets)
3. [Sistema de Notificações](#sistema-de-notificações)
4. [Dashboard CEO](#dashboard-ceo)
5. [Matriz de Permissões](#matriz-de-permissões)
6. [Models Mongoose](#models-mongoose)
7. [Endpoints API](#endpoints-api)
8. [Fluxos Transacionais](#fluxos-transacionais)

---

## 🎭 Hierarquia de Roles

```
                          ┌─────────────────┐
                          │      CEO        │
                          │   (Você)        │
                          └────────┬────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
            ┌───────▼─────┐  ┌──────▼──────┐  ┌──▼──────────────┐
            │  Marketing  │  │ Gerente     │  │  Gerente Geral  │
            │ (Func.)     │  │ Clientes    │  │  (Intermediário)│
            └─────────────┘  └─────────────┘  └─────────────────┘
                                   │                      │
                  ┌────────────────┼──────────┬───────────┘
                  │                │          │
          ┌───────▼──────┐  ┌──────▼──┐  ┌──▼──────────┐
          │  Cliente     │  │ Lojista │  │ Gerente MTB │
          │  (User)      │  │ (Seller)│  │ (Admins)    │
          └──────────────┘  └─────────┘  └─────────────┘
                                              │
                                         ┌────▼─────┐
                                         │ Motoboy  │
                                         │ (Driver) │
                                         └──────────┘
```

### 📌 Roles Definidos

| Role | Descrição | Acesso |
|------|-----------|--------|
| **ceo** | Administrador máximo | Tudo |
| **marketing** | Gerencia conteúdo visual | Banners, temas, imagens |
| **gerente_geral** | Supervisão geral | Notificações, todas as áreas, aprova posts |
| **gerente_clientes** | Admin de clientes | Clientes, notificações para clientes |
| **gerente_lojistas** | Admin de lojas | Lojistas, notificações para lojistas |
| **gerente_motoboys** | Admin de motoboys | Motoboys, notificações para motoboys |
| **lojista** | Dono de loja | Sua loja, seus produtos, sua carteira |
| **cliente** | Comprador | Seu carrinho, suas compras, sua carteira |
| **motoboy** | Entregador | Suas entregas, sua carteira, gamificação |

---

## 💰 Sistema de Wallets

### Estrutura de Carteiras

```typescript
// Cliente: Saldo para usar na plataforma
Wallet {
  userId: ObjectId,
  type: "cliente",
  balance: 100.50,        // Saldo atual
  totalIncome: 500.00,    // Total que entrou
  totalSpent: 399.50,     // Total gasto
  history: [
    { date, type: "credit"|"debit", amount, reason, orderId? }
  ]
}

// Loja: Caixa da loja
Wallet {
  storeId: ObjectId,
  type: "loja",
  balance: 5000.00,       // Caixa atual
  totalIncome: 50000.00,  // Total vendido
  platformFee: -5000.00,  // Taxa da plataforma (% das vendas)
  history: [
    { date, type: "credit", amount, reason: "Venda de produto", orderId },
    { date, type: "debit", amount, reason: "Taxa plataforma 10%", batchId }
  ]
}

// Motoboy: Receita de entregas
Wallet {
  userId: ObjectId,
  type: "motoboy",
  balance: 800.00,        // Valor a receber
  totalEarned: 8000.00,   // Total ganho
  benefits: {
    freeDeliveriesAvailable: 2,    // Cupons de entrega grátis
    discountPercentage: 10,        // Desconto de gamificação
    lastRedeemed: "2026-02-28"
  },
  history: [
    { date, type: "credit", amount, reason: "Entrega finalizada", deliveryId },
    { date, type: "debit", amount, reason: "Saque para banco", bankTransferId }
  ]
}

// CEO/Admin: Caixa master da plataforma
Wallet {
  userId: ObjectId,  // O CEO
  type: "platform",
  balance: 25000.00,      // Caixa geral
  totalIncome: 250000.00, // Total entrada
  fees: {
    perLoja: 10,          // % cobrado de cada loja
    perMotoboy: 5,        // % cobrado de cada motoboy (ou taxa fixa)
    customRates: [        // Taxas customizadas por cliente
      { clientId, rate }
    ]
  },
  history: [
    { date, type: "credit", amount, reason: "Taxa loja XPTO", storeId },
    { date, type: "credit", amount, reason: "Taxa motoboy João", userId },
    { date, type: "debit", amount, reason: "Repasse loja", storeId, bankTransferId }
  ]
}
```

### Fluxo de Dinheiro

```
┌─────────────────┐
│   Comprador     │
│   Carteira      │ <- Débito: R$ 50
└────────┬────────┘
         │
    [Pagamento via carteira]
         │
    ┌────▼─────────────────────┐
    │                           │
    │  ORDEM CRIADA             │
    │  Valor: R$ 50            │
    │                           │
    └────┬─────────────────┬────┘
         │                 │
         │                 │
    ┌────▼────┐    ┌───────▼────────┐
    │ Loja    │    │ CEO/Platform   │
    │Carteira │    │ Wallet         │
    │ +R$ 45  │    │ +R$ 5 (10%)    │
    │(90%)    │    │ (Taxa)         │
    └────┬────┘    └────────────────┘
         │
         │ [Entrega finalizada]
         │
    ┌────▼────┐
    │ Motoboy │
    │Carteira │
    │ +R$ 7   │
    │ (Taxa)  │
    └─────────┘

[Após retirada da taxa:]
Loja: R$ 45 - R$ 4,50 (10% fee) = R$ 40,50 final
```

### Endpoints de Wallets

```typescript
// Consultar saldo
GET /wallets/:userId
GET /wallets/store/:storeId
GET /wallets/platform
Response: { balance, totalIncome, totalSpent, ... }

// Adicionar saldo (cliente carrega crédito)
POST /wallets/:userId/credit
{
  amount: 100.00,
  paymentMethod: "credit_card"|"pix"|"bank_transfer",
  reference: "Carregamento de saldo"
}

// Transferência (motoboy saca para banco)
POST /wallets/:userId/transfer
{
  amount: 500.00,
  bankAccount: { banco, agencia, conta, cpf },
  reason: "Saque para banco"
}
Response: { transactionId, status: "pending"|"completed" }

// Histórico
GET /wallets/:userId/history?limit=50&offset=0
Response: [
  { date, type: "credit"|"debit", amount, reason, relatedId }
]

// Aplicar benefício (gamificação)
POST /wallets/:userId/apply-benefit
{
  benefitType: "free_delivery"|"discount",
  amount: 7.00,
  deliveryId?: "..."
}

// CEO: Consultar métricas de receita
GET /wallets/platform/metrics
Response: {
  totalPlatformBalance: 25000,
  totalIncome: 250000,
  totalStoreFees: 50000,
  totalMotoboyFees: 30000,
  pendingTransfers: 5000,
  breakdown: {
    byStore: [{ storeId, name, fee }],
    byMotoboy: [{ userId, name, fee }]
  }
}

// CEO: Ajustar taxa de cliente específico
POST /wallets/platform/set-custom-rate
{
  clientId,      // storeId ou userId
  clientType: "store"|"motoboy",
  rate: 5,       // % ou valor fixo
  reason: "Novo parceiro - período introdutório"
}
Response: { success, updatedWallet }
```

---

## 📢 Sistema de Notificações com Aprovação

### Fluxo de Notificações

```
Marketing/Gerente cria POST
            │
            ▼
    ┌─────────────────┐
    │ Estado: PENDING │ <- Aguardando aprovação
    └────────┬────────┘
             │
      CEO aprova OU Gerente Geral aprova
             │
      ┌──────▼──────┐
      │   APPROVED  │
      └──────┬──────┘
             │
    Notification enviada para:
    ✅ Users específicos
    ✅ Role específicas
    ✅ Região geográfica
    ✅ Broadcast (todos)
```

### Model de NotificationPost

```typescript
NotificationPost {
  _id: ObjectId,
  title: "Entrega grátis hoje!",
  content: "Aproveite 50% em...",
  image?: "url/image.png",
  
  // Segmentação
  targetType: "all" | "role" | "user" | "region" | "store",
  targetRoles?: ["cliente", "motoboy"],
  targetUsers?: ["userId1", "userId2"],
  targetRegion?: { state: "SP", city: "São Paulo" },
  targetStores?: ["storeId1"],
  
  // Validação
  status: "pending" | "approved" | "rejected",
  createdBy: ObjectId,      // Quem criou
  approvedBy?: ObjectId,    // Quem aprovou
  rejectedBy?: ObjectId,    // Quem rejeitou
  rejectionReason?: "Conteúdo impróprio",
  
  // Timestamps
  createdAt: Date,
  approvedAt?: Date,
  scheduledFor?: Date,      // Para posts agendados
  
  // Auditoria
  auditLog: [
    { date, action: "created"|"submitted"|"approved"|"rejected", by, reason? }
  ]
}

NotificationReceipt {
  _id: ObjectId,
  postId: ObjectId,
  userId: ObjectId,
  readAt?: Date,            // Null = não lido
  createdAt: Date
}
```

### Endpoints de Notificações

```typescript
// Qualquer usuário autenticado: criar notificação (fica pending)
POST /notifications/posts
{
  title: "Cupom de entrega grátis",
  content: "Use código GRATIS50",
  image?: "url",
  targetType: "role",
  targetRoles: ["motoboy"],
  scheduledFor?: "2026-03-01"
}
Response: { postId, status: "pending", createdBy, ... }

// CEO/Gerente Geral: listar posts pendentes
GET /notifications/posts/pending
Filters: ?createdBy=userId, ?targetType=role, ?status=pending
Response: [
  {
    postId, title, content, createdBy, createdAt,
    needsApprovalFrom: ["CEO", "Gerente Geral"],
    auditLog
  }
]

// CEO/Gerente Geral: aprovar post
POST /notifications/posts/:postId/approve
{
  reason?: "Conteúdo validado"
}
Response: { success, postId, newStatus: "approved", approvedAt }

// CEO/Gerente Geral: rejeitar post
POST /notifications/posts/:postId/reject
{
  reason: "Conteúdo inapropriado"
}
Response: { success, postId, newStatus: "rejected", rejectionReason }

// User: listar notificações recebidas
GET /notifications/inbox
Response: [
  {
    postId, title, content, image,
    createdAt, readAt,
    icon: "📢"
  }
]

// User: marcar como lido
POST /notifications/:postId/read
Response: { success, readAt }

// CEO: visualizar estatísticas de delivery
GET /notifications/posts/:postId/analytics
Response: {
  totalTargeted: 500,
  totalDelivered: 500,
  totalRead: 345,
  readRate: 69%,
  timeline: [
    { hour, read, unread }
  ]
}
```

---

## 📊 Dashboard CEO

### Métricas Principais

```typescript
Dashboard {
  // USUÁRIOS
  clients: {
    total: 1250,
    active: 890,          // Login últimos 30 dias
    new: 45,              // Últimos 7 dias
    retention: 71%
  },
  
  // LOJISTAS
  stores: {
    total: 89,
    active: 76,
    new: 3,
    avgProductsPerStore: 24,
    totalProducts: 2140,
    avgInventory: 15
  },
  
  // MOTOBOYS
  motoboys: {
    total: 234,
    active: 198,
    new: 12,
    avgDeliveriesPerDay: 8,
    avgRating: 4.7,
    topPerformers: [{ id, name, deliveries, rating }]
  },
  
  // ENTREGAS
  deliveries: {
    today: 456,
    inProgress: 89,
    completed: 367,
    avgTime: "35 min",
    completionRate: 98%,
    avgRating: 4.6
  },
  
  // FINANCEIRO
  revenue: {
    daily: 15000.00,
    weekly: 105000.00,
    monthly: 450000.00,
    totalAllTime: 2500000.00,
    platformFees: {
      fromStores: 45000.00,      // 10% das vendas
      fromMotoboys: 12000.00,    // Taxa ou %
      total: 57000.00
    },
    pending: 8000.00            // Não repassado ainda
  },
  
  // ESTOQUE
  inventory: {
    totalItems: 15420,
    lowStock: 342,              // < 10 unidades
    outOfStock: 12,
    avgRotation: 2.3            // Vezes por mês
  },
  
  // CUPONS & PROMOÇÕES
  promotions: {
    activeDiscountCoupons: 8,
    activeFreeDeliveryCoupons: 3,
    totalRedeemed: 1245,
    costToDate: 12450.00
  },
  
  // BENEFICIÁRIOS
  benefits: {
    freeDeliveries: 45,         // Cupons pendentes de uso
    gamificationRedeems: 23,
    customRates: 12             // Lojistas com taxa customizada
  }
}
```

### Endpoints do Dashboard

```typescript
// CEO: dashboard principal
GET /dashboard/ceo
Response: { clients, stores, motoboys, deliveries, revenue, inventory, ... }

// CEO: detalhes de uma métrica
GET /dashboard/ceo/revenue?period=month
Response: { daily, weekly, monthly, chartData: [...] }

GET /dashboard/ceo/stores?sort=revenue&limit=10
Response: [
  {
    storeId, name, ownerName, email,
    productsCount, inventory,
    revenue: { monthly, allTime },
    rating, completionRate
  }
]

GET /dashboard/ceo/motoboys?sort=deliveries&limit=10
Response: [
  {
    userId, name, email,
    deliveriesCompleted, avgTime,
    rating, earnings,
    gamificationLevel, badges,
    active: true
  }
]

// CEO: exportar relatório
GET /dashboard/ceo/export?format=csv&period=month
Response: CSV file

// Gerentes: dashboard reduzido (apenas sua área)
GET /dashboard/manager/:managerRole
Response: (subset de métricas conforme role)
```

---

## 🔐 Matriz de Permissões

```typescript
const permissionsMatrix = {
  ceo: {
    wallets: ["view_all", "create", "approve_transfers", "set_rates"],
    notifications: ["create", "approve", "reject", "send", "view_analytics"],
    dashboard: ["view_all_metrics"],
    users: ["view_all", "create", "edit", "delete", "ban"],
    stores: ["view_all", "approve", "ban", "set_commissions"],
    coupons: ["create", "delete", "view_all", "disable"],
    audit: ["view_all_logs"]
  },
  
  marketing: {
    notifications: ["create"],          // Fica pending para aprovação
    dashboard: [],
    banners: ["create", "edit", "delete"],
    theme: ["edit"]
  },
  
  gerente_geral: {
    wallets: ["view_all"],
    notifications: ["create", "approve", "reject", "view_analytics"],
    dashboard: ["view_all_metrics"],
    users: ["view_all", "edit", "ban"],
    stores: ["view_all"],
    audit: ["view_all_logs"]
  },
  
  gerente_clientes: {
    wallets: ["view_clients"],
    notifications: ["create"],           // Apenas para clientes
    dashboard: ["view_client_metrics"],
    users: ["view_clients", "edit_clients"],
    // Não pode: gerenciar lojistas, motoboys
  },
  
  gerente_lojistas: {
    wallets: ["view_stores"],
    notifications: ["create"],           // Apenas para lojistas
    dashboard: ["view_store_metrics"],
    stores: ["view_all", "edit"],
    // Não pode: gerenciar clientes, motoboys
  },
  
  gerente_motoboys: {
    wallets: ["view_motoboys"],
    notifications: ["create"],           // Apenas para motoboys
    dashboard: ["view_motoboy_metrics"],
    users: ["view_motoboys", "edit_motoboys"],
    // Não pode: gerenciar clientes, lojistas
  },
  
  lojista: {
    wallets: ["view_own"],
    stores: ["view_own", "edit_own"],
    products: ["create_own", "edit_own", "delete_own"],
    orders: ["view_own"],
    // Limitado apenas à sua loja
  },
  
  cliente: {
    wallets: ["view_own"],
    orders: ["view_own", "cancel_own"],
    addresses: ["view_own", "create", "edit_own"],
    profile: ["edit_own"]
  },
  
  motoboy: {
    wallets: ["view_own"],
    deliveries: ["view_own", "accept", "complete"],
    gamification: ["view_own", "redeem_benefits"],
    profile: ["edit_own"]
  }
};
```

---

## 📦 Models Mongoose

### 1. Wallet Model

```typescript
interface IWallet extends Document {
  // Identificação
  owner: ObjectId;              // userId ou storeId
  ownerType: "user" | "store" | "platform";
  
  // Saldos
  balance: number;              // Saldo atual
  totalIncome: number;          // Total entrada
  totalSpent: number;           // Total saída
  
  // Para lojistas: taxas
  platformFee?: number;         // % ou valor fixo
  customFeeApplied?: boolean;
  
  // Para motoboys: benefícios
  gamificationBenefits?: {
    freeDeliveries: number;
    discountPercentage: number;
    lastRedeemedAt?: Date;
  };
  
  // Histórico
  history: Array<{
    date: Date;
    type: "credit" | "debit";
    amount: number;
    reason: string;
    relatedId?: ObjectId;       // orderId, deliveryId, etc
    reference?: string;
  }>;
  
  // Auditoria
  createdAt: Date;
  updatedAt: Date;
}

const walletSchema = new Schema<IWallet>({
  owner: { type: Schema.Types.ObjectId, required: true },
  ownerType: { type: String, enum: ["user", "store", "platform"], required: true },
  balance: { type: Number, default: 0, index: true },
  totalIncome: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  platformFee: { type: Number, default: 10 },
  customFeeApplied: { type: Boolean, default: false },
  gamificationBenefits: {
    freeDeliveries: { type: Number, default: 0 },
    discountPercentage: { type: Number, default: 0 },
    lastRedeemedAt: { type: Date }
  },
  history: [
    {
      date: { type: Date, default: Date.now },
      type: { type: String, enum: ["credit", "debit"], required: true },
      amount: { type: Number, required: true },
      reason: { type: String, required: true },
      relatedId: { type: Schema.Types.ObjectId },
      reference: { type: String }
    }
  ],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Índices
walletSchema.index({ owner: 1, ownerType: 1 }, { unique: true });
walletSchema.index({ "history.date": -1 });
```

### 2. NotificationPost Model

```typescript
interface INotificationPost extends Document {
  title: string;
  content: string;
  image?: string;
  
  targetType: "all" | "role" | "user" | "region" | "store";
  targetRoles?: string[];
  targetUsers?: ObjectId[];
  targetRegion?: { state?: string; city?: string };
  targetStores?: ObjectId[];
  
  status: "pending" | "approved" | "rejected";
  createdBy: ObjectId;
  approvedBy?: ObjectId;
  rejectedBy?: ObjectId;
  rejectionReason?: string;
  
  createdAt: Date;
  approvedAt?: Date;
  scheduledFor?: Date;
  deliveredAt?: Date;
  
  auditLog: Array<{
    date: Date;
    action: "created" | "submitted" | "approved" | "rejected" | "sent";
    by: ObjectId;
    reason?: string;
  }>;
}

const notificationPostSchema = new Schema<INotificationPost>({
  title: { type: String, required: true, maxlength: 200 },
  content: { type: String, required: true, maxlength: 5000 },
  image: { type: String },
  
  targetType: {
    type: String,
    enum: ["all", "role", "user", "region", "store"],
    default: "all"
  },
  targetRoles: { type: [String] },
  targetUsers: { type: [Schema.Types.ObjectId] },
  targetRegion: {
    state: String,
    city: String
  },
  targetStores: { type: [Schema.Types.ObjectId] },
  
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
    index: true
  },
  createdBy: { type: Schema.Types.ObjectId, required: true, index: true },
  approvedBy: Schema.Types.ObjectId,
  rejectedBy: Schema.Types.ObjectId,
  rejectionReason: String,
  
  createdAt: { type: Date, default: Date.now },
  approvedAt: Date,
  scheduledFor: Date,
  deliveredAt: Date,
  
  auditLog: [
    {
      date: { type: Date, default: Date.now },
      action: {
        type: String,
        enum: ["created", "submitted", "approved", "rejected", "sent"]
      },
      by: Schema.Types.ObjectId,
      reason: String
    }
  ]
});

notificationPostSchema.index({ status: 1, createdAt: -1 });
```

### 3. Role Model (Atualizado)

```typescript
interface IRole extends Document {
  name: string;                 // "ceo", "marketing", etc
  displayName: string;          // "CEO", "Gerente Geral", etc
  description: string;
  hierarchy: number;            // 1 = CEO (topo), 9 = cliente (base)
  permissions: string[];        // ["wallet:view_all", "notification:approve", ...]
  canApproveNotifications: boolean;
  canAccessDashboard: boolean;
  dashboardMetrics: string[];   // Quais métricas pode ver
}

const roleSchema = new Schema<IRole>({
  name: { type: String, required: true, unique: true },
  displayName: { type: String, required: true },
  description: String,
  hierarchy: { type: Number, required: true },
  permissions: { type: [String], default: [] },
  canApproveNotifications: { type: Boolean, default: false },
  canAccessDashboard: { type: Boolean, default: false },
  dashboardMetrics: { type: [String], default: [] }
});

// Seeding roles
const defaultRoles = [
  {
    name: "ceo",
    displayName: "CEO",
    hierarchy: 1,
    canApproveNotifications: true,
    canAccessDashboard: true,
    dashboardMetrics: ["all"],
    permissions: ["*"]  // Acesso total
  },
  {
    name: "marketing",
    displayName: "Marketing",
    hierarchy: 2,
    permissions: ["notification:create", "banner:manage", "theme:edit"]
  },
  // ... mais roles
];
```

---

## 🔄 Fluxos Transacionais

### Fluxo 1: Criar Pedido → Distribuir Valores

```typescript
async createOrderWithWalletDistribution(orderData) {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // 1. Criar pedido
    const order = await Order.create([orderData], { session });
    
    // 2. Débito: Cliente
    const clientWallet = await Wallet.findOneAndUpdate(
      { owner: clientId, ownerType: "user" },
      {
        $inc: { balance: -orderTotal, totalSpent: orderTotal },
        $push: { history: { type: "debit", amount: orderTotal, reason: "Pedido criado" } }
      },
      { session, new: true }
    );
    
    if (clientWallet.balance < 0) throw new Error("Saldo insuficiente");
    
    // 3. Crédito: Loja (90%)
    const storeAmount = orderTotal * 0.9;
    await Wallet.findOneAndUpdate(
      { owner: storeId, ownerType: "store" },
      {
        $inc: { balance: storeAmount, totalIncome: storeAmount },
        $push: { history: { type: "credit", amount: storeAmount, reason: "Venda", relatedId: orderId } }
      },
      { session }
    );
    
    // 4. Crédito: CEO (10%)
    const ceoAmount = orderTotal * 0.1;
    await Wallet.findOneAndUpdate(
      { owner: ceoId, ownerType: "platform" },
      {
        $inc: { balance: ceoAmount, totalIncome: ceoAmount },
        $push: { history: { type: "credit", amount: ceoAmount, reason: "Taxa plataforma", relatedId: orderId } }
      },
      { session }
    );
    
    // 5. Commit
    await session.commitTransaction();
    return order;
    
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}
```

### Fluxo 2: Notificação com Aprovação

```typescript
async createAndApproveNotification(postData, approverRole) {
  // 1. Marketing cria post → status = "pending"
  const post = await NotificationPost.create({
    ...postData,
    status: "pending",
    createdBy: marketingUserId
  });
  
  // 2. Sistema notifica CEO/Gerente Geral
  await NotificationReceipt.create({
    userId: ceoUserId,
    message: `Nova notificação pendente de aprovação: "${post.title}"`
  });
  
  // 3. CEO/Gerente Geral aprova
  const approvedPost = await NotificationPost.findByIdAndUpdate(
    postId,
    {
      status: "approved",
      approvedBy: ceoUserId,
      approvedAt: new Date(),
      $push: { auditLog: { action: "approved", by: ceoUserId } }
    }
  );
  
  // 4. Sistema distribui notificação
  await distributeNotification(approvedPost);
}

async distributeNotification(post) {
  // Buscar usuários conforme targetType
  let users = [];
  
  if (post.targetType === "all") {
    users = await User.find({});
  } else if (post.targetType === "role") {
    users = await User.find({ role: { $in: post.targetRoles } });
  } else if (post.targetType === "user") {
    users = await User.find({ _id: { $in: post.targetUsers } });
  } else if (post.targetType === "region") {
    users = await User.find({ "address.state": post.targetRegion.state });
  } else if (post.targetType === "store") {
    // Users que fizeram pedidos nessas lojas
  }
  
  // Criar NotificationReceipt para cada usuário
  const receipts = users.map(u => ({
    postId: post._id,
    userId: u._id,
    createdAt: new Date()
  }));
  
  await NotificationReceipt.insertMany(receipts);
  
  // Atualizar post com status "delivered"
  await NotificationPost.updateOne(
    { _id: post._id },
    { deliveredAt: new Date() }
  );
}
```

---

## 📋 Checklist de Implementação

### Fase 1: Modelos (Backend)
- [ ] Atualizar User schema com novo role hierarchy
- [ ] Criar Wallet model
- [ ] Criar NotificationPost model
- [ ] Criar Role model com seed
- [ ] Criar NotificationReceipt model
- [ ] Criar Zod schemas de validação

### Fase 2: Controllers & Routes
- [ ] Wallet controller (CRUD, transfer, credit)
- [ ] Wallet routes
- [ ] NotificationPost controller
- [ ] NotificationPost routes (create, list, approve, reject)
- [ ] Dashboard controller (CEO)
- [ ] Dashboard routes

### Fase 3: Frontend
- [ ] Dashboard CEO page
- [ ] Admin panel pages (por role)
- [ ] Notification inbox
- [ ] Wallet pages (por tipo de user)
- [ ] Settings para taxas customizadas

### Fase 4: Testes & Deploy
- [ ] Testes unitários
- [ ] Testes integração
- [ ] Documentação Postman
- [ ] Deploy staging
- [ ] Testes E2E

---

## 🎯 Próximos Passos

1. **Você quer que eu começar por qual parte?**
   - [ ] Models Mongoose
   - [ ] Controllers & Routes
   - [ ] Frontend Pages
   - [ ] Testes

2. **Alguma clarificação nas regras de negócio?**
   - Taxa customizada por cliente?
   - Quanto é a taxa padrão de cada loja?
   - Quanto é a taxa para motoboy?
   - Quando a taxa é cobrada? (Imediato ou fim do mês?)

3. **Timing: Você quer isso tudo em uma sprint ou por fases?**

---

**Criado em**: 28/02/2026  
**Status**: ✅ Ready to discuss and implement
