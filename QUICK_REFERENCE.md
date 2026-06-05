# ⚡ QUICK REFERENCE - GUIA RÁPIDO DO SISTEMA

---

## 🎯 O QUE CADA PAPEL FAZ

```
┌─────────────────┬──────────────────┬──────────────────┐
│   CLIENTE 🛍️    │   LOJISTA 🏪     │   MOTOBOY 🚗     │
├─────────────────┼──────────────────┼──────────────────┤
│ • Compra        │ • Vende          │ • Entrega        │
│ • Paga          │ • Recebe $       │ • Ganha $        │
│ • Rastreia      │ • Gerencia       │ • Escolhe jobs   │
│ • Avalia        │ • Estoque        │ • Sobe ranking   │
│ • Saca $        │ • Carteira       │ • Retira comissão│
└─────────────────┴──────────────────┴──────────────────┘
```

---

## 🔗 ENDPOINTS PRINCIPAIS

### Authentication
```
POST   /auth/register          Criar conta
POST   /auth/login             Fazer login
POST   /auth/switch-role       Mudar para outro role
```

### Orders (Pedidos)
```
POST   /orders                 Criar pedido (cliente)
GET    /orders                 Listar meus pedidos
GET    /orders/:id             Ver detalhes
POST   /orders/:id/accept      Aceitar (lojista)
POST   /orders/:id/reject      Rejeitar (lojista)
POST   /orders/:id/cancel      Cancelar (cliente)
POST   /orders/:id/evaluate-store  Avaliar loja
```

### Deliveries (Entregas)
```
POST   /deliveries                    Criar entrega (lojista)
GET    /deliveries/available          Listar disponíveis (motoboy)
POST   /deliveries/:id/claim          Aceitar entrega (motoboy) ⭐
PUT    /deliveries/:id/status         Atualizar status (motoboy)
POST   /deliveries/:id/finalizar      Finalizar (motoboy)
GET    /deliveries/:id                Ver detalhes
POST   /deliveries/:id/avaliar        Avaliar motoboy (cliente)
```

### Wallets (Carteiras)
```
GET    /wallets/my-wallet             Minha carteira
GET    /wallets/my-wallet/by-role/:role  Carteira por role
GET    /wallets/:userId               Carteira de alguém
POST   /wallets/:userId/credit        Depositar (cliente)
POST   /wallets/transfer              Transferir
POST   /wallets/:userId/withdraw      Sacar (lojista)
```

### Products (Produtos)
```
GET    /products                      Listar todos
GET    /products/:id                  Ver detalhes
POST   /products                      Criar (lojista)
PUT    /products/:id                  Editar (lojista)
DELETE /products/:id                  Deletar (lojista)
```

### Admin
```
GET    /admin/users                   Listar usuários (CEO)
PUT    /admin/users/:id/role          Mudar role (CEO)
PUT    /admin/users/:id/status        Ban/unban (CEO)
GET    /wallets/platform/metrics      Métricas da plataforma (CEO)
```

---

## 💾 MODELOS DE DADOS (Rápido)

### User
```typescript
{
  _id: ObjectId
  name: string
  email: string
  passwordHash: string
  roles: string[]           // ['cliente', 'lojista', 'motoboy']
  activeRole: string        // 'lojista' ou 'cliente'
  storeId?: ObjectId        // Se for lojista
  bankInfo?: {
    banco: string
    agencia: string
    conta: string
    isConfigured: boolean
  }
  addresses?: Array<{
    street, number, neighborhood, city, state, cep
  }>
}
```

### Order
```typescript
{
  _id: ObjectId
  customerId: ObjectId
  storeId: ObjectId
  products: [{productId, quantity, price}]
  totalValue: number        // R$ 100
  deliveryFee: number       // R$ 12
  status: 'criado' | 'pago' | 'aguardando_motoboy' | 'enviado' | 'entregue' | 'cancelado'
  paymentStatus: 'pending' | 'paid' | 'refunded'
  storeRating?: number      // 1-5
  deliveryId?: ObjectId
  idempotentKey?: string    // UUID para prevenir duplicação
}
```

### Delivery
```typescript
{
  _id: ObjectId
  orderId: ObjectId
  motoboyId?: ObjectId
  distance: number          // 5 km
  fee: number              // R$ 12 (o que motoboy ganha)
  status: 'pending' | 'assigned' | 'picked' | 'delivered' | 'cancelled'
  pin?: string             // PIN de entrega
  pinRetirada?: string     // PIN de retirada
  rating?: number          // 1-5 stars
}
```

### Wallet
```typescript
{
  _id: ObjectId
  owner: string            // userId ou storeId
  ownerType: 'user' | 'store' | 'platform'
  balance: number          // R$ 100
  totalIncome: number      // R$ 500 (total que entrou)
  totalSpent: number       // R$ 400 (total que saiu)
  history: [{
    date: Date
    type: 'credit' | 'debit' | 'refund'
    category: 'deposit' | 'withdrawal' | 'payment' | 'refund'
    amount: number         // R$ 50
    reason: string         // 'order_payment', etc
    relatedId?: ObjectId   // orderId, deliveryId, etc
  }]
}
```

### Store
```typescript
{
  _id: ObjectId
  ownerId: ObjectId        // User que é o lojista
  name: string
  address: string
  plan: 1 | 2 | 3         // 1: 15%, 2: 20%, 3: 30% comissão
  planSince: Date
  customCommissionRate?: number
}
```

---

## 📊 QUICK MATH (Cálculos Rápidos)

### Ganho do Motoboy
```
BASE_VALUE = R$ 7
PER_KM = R$ 1

ganho = 7 + (distance_km × 1) + bonus_rating

Bônus:
- Rating ≥ 4.5: +R$ 2
- Rating ≥ 3.5: +R$ 1
- Else: +R$ 0

Exemplo: 5 km, rating 4.8
ganho = 7 + (5 × 1) + 2 = R$ 14 ✅
```

### Distribuição de Pedido
```
Exemplo: Cliente compra R$ 100
Loja está no Plano 2 (20% comissão)

Total: R$ 100
├─ Loja recebe: R$ 100 × (1 - 20%) = R$ 80
└─ CEO recebe:  R$ 100 × 20% = R$ 20
```

### Cálculo de Taxa de Entrega
```
deliveryFee = 7 + (distanceKm × 1)

0 km:  R$ 7
5 km:  R$ 12
10 km: R$ 17
```

---

## 🔑 VARIÁVEIS DE AMBIENTE

```bash
# Backend (.env)
MONGO_URI=mongodb+srv://...  # MongoDB
JWT_SECRET=<gerar>           # openssl rand -base64 32
PORT=4000
NODE_ENV=development

# Frontend (.env.local)
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

---

## 🚀 RODAR LOCALMENTE

```bash
# Backend
cd Drop
npm install
npm run dev                # localhost:4000

# Frontend
cd frontend
npm install
npm run dev                # localhost:3000

# Docker (MongoDB)
docker-compose up          # mongo:27017, mongo-express:8081
```

---

## 🔐 ROLES E PERMISSÕES

### Verificar Role
```typescript
// Backend
const activeRole = user.activeRole || user.role;

if (activeRole !== 'cliente') {
  return res.status(403).json({ error: 'Apenas clientes podem comprar' });
}

// Frontend
const { user } = useAuth();
const activeRole = user?.activeRole || user?.role;

if (activeRole !== 'cliente') {
  return <AccessDenied />;
}
```

### Middleware de Autorização
```typescript
router.post('/orders', 
  authenticate,                           // Verifica JWT
  authorizeRoles('cliente'),              // Verifica role
  validate(CreateOrderSchema),            // Valida dados (Zod)
  createOrder                             // Controller
);
```

---

## 📡 WEBSOCKET - LISTENERS PRINCIPAIS

```typescript
// Cliente conecta
const socket = io('http://localhost:4000', {
  auth: { token: localStorage.getItem('token') }
});

// Ouve eventos
socket.on('order:created', (data) => {
  console.log('Novo pedido:', data);
});

socket.on('delivery:assigned', (data) => {
  console.log('Entrega atribuída:', data);
  // Cliente vê "Motoboy a caminho" em tempo real!
});

socket.on('delivery:completed', (data) => {
  console.log('Entrega finalizada:', data);
});
```

---

## 💾 TRANSAÇÕES (Importante)

```typescript
// Exemplo: Aceitar pedido (múltiplas operações)
const session = await mongoose.startSession();
session.startTransaction();

try {
  // 1. Criar delivery
  const delivery = new Delivery({...});
  await delivery.save({ session });
  
  // 2. Atualizar order
  await Order.updateOne({_id: orderId}, {status: 'pago'}, {session});
  
  // 3. Atualizar wallets
  await Wallet.updateOne(
    {owner: customerId},
    {$inc: {balance: -orderTotal}},
    {session}
  );
  
  // 4. Commit
  await session.commitTransaction();
  
} catch (err) {
  await session.abortTransaction();  // Desfaz tudo
  throw err;
}
```

---

## 🛣️ FLUXO PADRÃO DE COMPRA

```
1️⃣ Cliente browsa produtos
   GET /products

2️⃣ Cliente adiciona ao carrinho
   localStorage.setItem('cart', JSON.stringify([...]))

3️⃣ Cliente vai ao checkout
   /checkout

4️⃣ Cliente faz pedido
   POST /orders
   ├─ Valida activeRole = 'cliente'
   ├─ Valida saldo em wallet
   └─ Cria Order (status: 'criado')

5️⃣ Lojista recebe notificação (WebSocket)
   socket.on('order:created', ...)

6️⃣ Lojista aceita
   POST /orders/:id/accept
   ├─ Cria Delivery (status: 'pending')
   ├─ Débita cliente
   ├─ Credita loja e CEO
   └─ Notifica motoboys

7️⃣ Motoboy aceita
   POST /deliveries/:id/claim
   ├─ Atomic: Atribui motoboyId
   ├─ Cliente notificado em tempo real 🎯
   └─ Delivery (status: 'assigned')

8️⃣ Motoboy pega produto e entrega
   PUT /deliveries/:id/status → 'picked'
   POST /deliveries/:id/finalizar
   ├─ Valida PIN
   ├─ Credita motoboy
   └─ Order (status: 'entregue')

9️⃣ Cliente avalia
   POST /orders/:id/evaluate-store
   POST /deliveries/:id/avaliar
   └─ Ratings salvos
```

---

## ❌ ERROS COMUNS

### 403 Forbidden - Compra bloqueada
```
Erro: "Compras não são permitidas para usuários no modo ${activeRole}"

Causa: Cliente está em role errado (ex: 'lojista')

Solução:
1. Verificar user.activeRole
2. Chamar switchRole({ newRole: 'cliente' })
3. Re-fazer a compra
```

### 401 Unauthorized
```
Erro: "Not authenticated"

Causa: Falta header Authorization ou token expirado

Solução: Fazer login novamente
```

### Sem saldo na wallet
```
Erro: "Saldo insuficiente"

Solução: Fazer depósito primeiro
POST /wallets/${userId}/credit
body: { amount: 100, paymentMethod: 'credit_card' }
```

### Entrega já foi aceita por outro motoboy
```
Erro: "Esta entrega já foi aceita"

Causa: First-claim-wins - outro motoboy foi mais rápido

Solução: Procurar outra entrega disponível
```

---

## 📚 ARQUIVOS IMPORTANTES PARA ESTUDAR

```
Entender Arquitetura:
├─ src/app.ts                         (Setup Express)
├─ src/index.ts                       (Entry point)
└─ frontend/pages/_app.tsx            (Frontend setup)

Autenticação:
├─ src/middleware/auth.ts             (JWT validation)
├─ src/controllers/authController.ts  (Register/Login)
└─ frontend/contexts/AuthContext.tsx  (State management)

Pedidos:
├─ src/controllers/orderController.ts (Lógica de pedidos)
├─ src/routes/orders.ts               (Endpoints)
└─ frontend/pages/checkout.tsx        (Checkout UI)

Entregas:
├─ src/controllers/deliveryController.ts
├─ src/routes/deliveries.ts
└─ frontend/pages/motoboy/index.tsx

Wallets:
├─ src/controllers/walletController.ts
├─ src/utils/walletCalculations.ts
├─ src/routes/wallets.ts
└─ frontend/pages/my-wallet.tsx

Real-time:
├─ src/services/notifier.ts           (Socket.IO setup)
└─ src/utils/socketEmitter.ts         (Emit events)

Admin:
├─ src/routes/admin.ts
└─ frontend/pages/admin/dashboard.tsx
```

---

## 🎬 VÍDEO MENTAL (O QUE ACONTECE)

```
┌─ CLIENTE ─────────────────────┐
│ Acesso frontend/pages/index   │
│ Browse 100+ produtos          │
│ Clica: Adicionar ao carrinho  │
│ Vai para checkout             │
│ (Valida role='cliente') ✅    │
│ Confirma pedido               │
│ "Aguarde aceitação..."        │
│                               │
│ POST /orders ←─────┐          │
│                    │          │
└────────────────────┼──────────┘
                     │ ✉️ Socket: 'order:created'
                     │
┌────────────────────▼──────────┐
│ LOJISTA                        │
│ Dashboard notificado           │
│ Badge: "Novo pedido! 🔴"       │
│                                │
│ Clica: Ver pedido              │
│ Clica: Aceitar                 │
│                                │
│ POST /orders/:id/accept ←────┐ │
│                               │ │
└───────────────────────────────┼─┘
                        ✉️ Socket: 'delivery:created'
                                │ ✉️ Socket: 'order:status_changed'
                                │
        ┌───────────────────────┼──────────────────┐
        │                       │                  │
┌───────▼──────────────┐  ┌─────▼─────────────┐  ┌─▼────────────────┐
│ MOTOBOY 1 (rápido)   │  │ MOTOBOY 2         │  │ CLIENTE (real)   │
│                      │  │                   │  │                  │
│ Vê entrega disponível│  │ Vê entrega        │  │ Vê status mudou: │
│ 5 km, R$ 12          │  │                   │  │ ⏳ → 🚗 ENVIADO  │
│                      │  │                   │  │                  │
│ Clica: ACEITAR       │  │ Clica: ACEITAR    │  │ SEM F5! ✨       │
│ POST /:id/claim ✅   │  │ POST: JÁ FOI! ❌  │  │                  │
│ (first-claim-wins)   │  │                   │  │ Recebe localizaçã│
│                      │  │                   │  │ em tempo real     │
│ Vai until loja       │  │                   │  │                  │
│ Pega produto (PIN)   │  │                   │  │                  │
│ Vai até cliente      │  │                   │  │                  │
│ Entrega (PIN validar)│  │                   │  │ Recebe PIN       │
│ POST /:id/finalizar  │  │                   │  │ Digita PIN       │
│                      │  │                   │  │ ENTREGUE ✅      │
│ GANHOU: R$ 14 💰     │  │                   │  │                  │
│ Carteira: +14        │  │                   │  │ Carteira: -100   │
└──────────────────────┘  └───────────────────┘  └──────────────────┘

═══════════════════════════════════════════════════════════════════

RESUMO:
├─ Todo comunicado via WebSocket em tempo real
├─ Sem F5 (refresh)
├─ Sem polling (chamadas contínuas)
├─ Socket.IO maneja múltiplos clientes
├─ Cada um sabe seu status exato
└─ Dinheiro distribuído corretamente 💰
```

---

## 🎓 Próximos Passos para Aprender

```
1️⃣ Ler arquivo START_HERE.md
   └─ Entender status do projeto

2️⃣ Ler ANALISE_COMPLETA_SISTEMA.md
   └─ Visão geral de tudo

3️⃣ Ler DIAGRAMAS_E_FLUXOS.md
   └─ Entender fluxos visuais

4️⃣ Estudar modelos
   ├─ src/models/User.ts
   ├─ src/models/Order.ts
   ├─ src/models/Wallet.ts
   └─ src/models/Delivery.ts

5️⃣ Estudar controllers principais
   ├─ src/controllers/authController.ts
   ├─ src/controllers/orderController.ts
   ├─ src/controllers/deliveryController.ts
   └─ src/controllers/walletController.ts

6️⃣ Entender WebSocket
   └─ src/services/notifier.ts

7️⃣ Rodar localmente
   ├─ npm run dev (backend)
   ├─ npm run dev (frontend)
   └─ Testar fluxo completo

8️⃣ Fazer modificações pequenas
   └─ Bug fixes, melhorias
```

---

**Criado em:** 3 de Março de 2026  
**Tipo:** Quick Reference Card  
**Atualizado:** Pronto para produção
