# 🏗️ ARQUITETURA: Carteiras Lojista = Motoboy

## 📊 Visão Geral do Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                    SISTEMA DE CARTEIRAS                         │
│                                                                  │
│  Tipos de Carteira:                                             │
│  1. User (👤) - Carteira pessoal do cliente/lojista            │
│  2. Store (🏪) - Carteira de vendas da loja                    │
│  3. Motoboy (🏍️) - Carteira de ganhos do motoboy              │
│                                                                  │
│  Todas operam com MESMA LÓGICA ✅                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Fluxo Completo: Pedido até Saque

```
CLIENTE FAZ PEDIDO
│
├─1. POST /orders/create
│   ├─ Cliente: -R$ 100 (user wallet)
│   ├─ Loja: +R$ 80 (store wallet) ✅
│   └─ Plataforma: +R$ 20 (comissão)
│
├─2. GET /wallets/my-wallet/by-role/lojista
│   └─ Retorna: store wallet com R$ 80
│
├─3. POST /wallets/transfer (store→user)
│   ├─ Store wallet: -R$ 50
│   └─ User wallet: +R$ 50
│
├─4. Switch role via navbar avatar
│   └─ user.activeRole = 'cliente'
│
├─5. GET /wallets/my-wallet/by-role/cliente
│   └─ Retorna: user wallet com R$ 50
│
├─6. POST /wallets/{id}/credit (depositar)
│   └─ User wallet: +R$ 30 (agora R$ 80)
│
├─7. POST /wallets/transfer (user→store, voltar)
│   ├─ User wallet: -R$ 25
│   └─ Store wallet: +R$ 25
│
└─8. POST /wallets/{id}/withdraw (sacar)
    └─ User wallet: -R$ 55 (retira do banco)

RESULTADO FINAL:
├─ Store wallet: R$ 55 (80 - 50 + 25)
├─ User wallet: R$ 0 (50 + 30 - 25 - 55)
└─ Banco: -R$ 55 (saque confirmado)
```

---

## 🗂️ Estrutura de Arquivos Backend

```
src/
├── controllers/
│   ├── orderController.ts (254-288)
│   │   └─ createOrder → credita loja automaticamente
│   │
│   ├── walletController.ts
│   │   ├─ getMyWallet (260-330)
│   │   │  └─ Retorna wallet certa baseado em role
│   │   │
│   │   ├─ transferBetweenWallets (438-550)
│   │   │  └─ Loja ↔ Usuário bidirecionalmente
│   │   │
│   │   ├── creditWallet (POST /wallets/{id}/credit)
│   │   │  └─ Depositar dinheiro
│   │   │
│   │   └── withdrawWallet (POST /wallets/{id}/withdraw)
│   │      └─ Sacar dinheiro
│   │
│   ├── deliveryController.ts (282-306)
│   │   └─ finalizarEntrega → credita motoboy
│   │
│   └── cancellationController.ts
│       └─ Desfaz transações se cancelado
│
├── models/
│   ├── Wallet.ts
│   │   └─ Schema com: owner, ownerType, balance, history
│   │
│   ├── User.ts
│   │   └─ Campo: storeId (link para loja)
│   │
│   └── Store.ts
│       └─ Campo: ownerId (link para usuário)
│
├── routes/
│   ├── wallets.ts
│   │   ├─ GET /wallets/my-wallet/by-role/:role
│   │   ├─ POST /wallets/transfer
│   │   ├─ POST /wallets/{id}/credit
│   │   └─ POST /wallets/{id}/withdraw
│   │
│   └── orders.ts
│       └─ POST /orders/create
│
└── utils/
    └── walletCalculations.ts
        ├─ calculateOrderDistribution (20% comissão)
        ├─ calculateDeliveryFeeWithConfig (80/20 split)
        └─ calculateMotoboyEarningsWithConfig
```

---

## 🎨 Estrutura de Arquivos Frontend

```
frontend/pages/
├── my-wallet.tsx (MAIN PAGE)
│   ├─ useState: wallet, selectedWalletType, showTransfer, etc
│   │
│   ├─ useEffect: Carrega wallet por role (user ou store)
│   │
│   ├─ handleTransfer() 
│   │   └─ POST /wallets/transfer (user→store)
│   │
│   ├─ handleDeposit()
│   │   └─ POST /wallets/{id}/credit
│   │
│   ├─ handleWithdraw()
│   │   ├─ Se store: POST /wallets/transfer (store→user)
│   │   └─ Se user: POST /wallets/{id}/withdraw
│   │
│   └─ Render:
│       ├─ Header com role (👤 ou 🏪)
│       ├─ Saldo principal (grande destaque)
│       ├─ Stats grid (entrada, gasto, etc)
│       ├─ Botões de ação (diferentes por role)
│       ├─ Forms (transfer, deposit, withdraw)
│       └─ Histórico de transações
│
├── navbar component
│   ├─ Avatar com menu dropdown
│   ├─ [👤 Usuário] [🏪 Loja] buttons (para lojista)
│   └─ onclick: POST /auth/switch-role → atualiza user.activeRole
│
└── contexts/AuthContext.ts
    ├─ user.activeRole (role ativo)
    ├─ user.storeId (referência à loja, se lojista)
    └─ switchRole(newRole) function
```

---

## 🔌 Fluxo de APIs

### PARA LOJISTA

```
1. Login
   POST /auth/login
   ↓
   JWT com: userId, activeRole='cliente', storeId

2. Acessar /my-wallet
   GET /wallets/my-wallet/by-role/cliente
   ↓
   Retorna: user wallet com saldo

3. Mudar role via navbar
   POST /auth/switch-role { role: 'lojista' }
   ↓
   JWT atualizado: activeRole='lojista'

4. Ver carteira de loja
   GET /wallets/my-wallet/by-role/lojista
   ↓
   Retorna: store wallet com vendas

5. Transferir para usuário
   POST /wallets/transfer {
     toUserId: userId,
     amount: 50,
     fromStoreId: storeId,
     reason: '...'
   }
   ↓
   Store wallet -50, User wallet +50

6. Voltar para role de cliente
   POST /auth/switch-role { role: 'cliente' }
   ↓
   Ver carteira de usuário atualizada

7. Depositar
   POST /wallets/{userId}/credit { amount: 100 }
   ↓
   User wallet +100

8. Transferir de volta para loja
   POST /wallets/transfer {
     toUserId: userId,
     amount: 25,
     reason: '...'
   }
   ↓
   User wallet -25, Store wallet +25

9. Sacar
   POST /wallets/{userId}/withdraw { amount: 55 }
   ↓
   User wallet -55, retira do banco
```

---

## 🛡️ Validações de Segurança

```
┌──────────────────────────────────────────┐
│ TRANSFERÊNCIA STORE → USER               │
├──────────────────────────────────────────┤
│ ✅ user.storeId === fromStoreId         │
│    └─ Lojista só transfere SUA loja     │
│                                          │
│ ✅ toUserId === userId                  │
│    └─ Só transfere para SI MESMO        │
│                                          │
│ ✅ fromWallet.balance >= amount         │
│    └─ Tem saldo suficiente              │
│                                          │
│ ✅ wallet exist or auto-create          │
│    └─ Cria carteira se não existir      │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│ TRANSFERÊNCIA USER → STORE               │
├──────────────────────────────────────────┤
│ ✅ toUserId === userId (mesmo userId)   │
│    └─ Detecta que vai para sua loja     │
│                                          │
│ ✅ user.storeId exists                  │
│    └─ Usuário tem uma loja              │
│                                          │
│ ✅ fromWallet.balance >= amount         │
│    └─ Tem saldo suficiente              │
│                                          │
│ ✅ store wallet exist or auto-create    │
│    └─ Cria se não existir               │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│ SACAR DA WALLET DE USUÁRIO               │
├──────────────────────────────────────────┤
│ ✅ bankInfoConfigured === true          │
│    └─ Banco configurado (lojista)       │
│                                          │
│ ✅ wallet.balance >= amount             │
│    └─ Tem saldo suficiente              │
│                                          │
│ ✅ Registra no histórico                │
│    └─ Rastreabilidade completa          │
└──────────────────────────────────────────┘
```

---

## 📊 Modelo de Dados: Wallet

```typescript
interface Wallet {
  _id: ObjectId;
  owner: string;           // userId ou storeId
  ownerType: 'user' | 'store' | 'motoboy';
  balance: number;         // Saldo atual
  totalIncome: number;     // Total recebido
  totalSpent: number;      // Total gasto
  history: [{
    date: Date;
    type: 'credit' | 'debit';
    category: string;      // 'payment', 'transfer', 'delivery_completed', etc
    amount: number;
    reason: string;
    paymentMethod?: string; // 'wallet_transfer', 'credit_card', etc
    relatedId?: string;    // orderId, deliveryId, etc
    reference?: string;    // TRF_timestamp para rastreabilidade
  }];
  transactions?: [{...}];  // Legacy field
  createdAt: Date;
  updatedAt: Date;
}

// User model agora tem:
interface User {
  ...
  storeId?: ObjectId;      // ← CRÍTICO! Link bidirecional
  activeRole: Role;        // ← Qual role está ativo agora
  ...
}

// Store model já tem:
interface Store {
  ownerId: ObjectId;       // ← Link para User
  ...
}
```

---

## 🔄 State Management (Frontend)

```typescript
// AuthContext
{
  user: {
    id: "userId",
    name: "João Silva",
    email: "joao@example.com",
    role?: "lojista",           // Legacy
    roles: ["lojista", "cliente"],
    activeRole: "lojista",      // ← IMPORTANTE
    storeId: "storeId123",      // ← IMPORTANTE
    ...
  },
  switchRole: (newRole: string) => Promise<void>
  // Chama: POST /auth/switch-role
  // Retorna: JWT atualizado com novo activeRole
}

// My Wallet Page
{
  wallet: {
    _id: "walletId",
    owner: "storeId123",        // ou userId
    ownerType: "store",         // ou "user"
    balance: 80.50,
    totalIncome: 100.00,
    totalSpent: 19.50,
    history: [...]
  },
  loading: false,
  selectedWalletType: "store",
  showTransfer: false,
  showDeposit: false,
  showWithdraw: false,
  ...
}
```

---

## 🧪 Diagrama de Testes

```
┌─────────────────────────────────────┐
│ TESTE 1: Receber em Pedido          │
├─────────────────────────────────────┤
│ Cliente faz pedido                  │
│      ↓                              │
│ Loja vê saldo aumentar ✅           │
│      ↓                              │
│ Histórico: +crédito ✅              │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ TESTE 2: Transferir para Usuário    │
├─────────────────────────────────────┤
│ Loja clica "Enviar para Usuário"   │
│      ↓                              │
│ Digita valor ✅                     │
│      ↓                              │
│ Confirma ✅                         │
│      ↓                              │
│ Store -R$, User +R$ ✅              │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ TESTE 3: Usar Carteira Pessoal      │
├─────────────────────────────────────┤
│ Muda role via navbar ✅             │
│      ↓                              │
│ Vê carteira de usuário ✅           │
│      ↓                              │
│ Deposita +R$ ✅                     │
│      ↓                              │
│ Transfere de volta -R$ ✅           │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ TESTE 4: Sacar                      │
├─────────────────────────────────────┤
│ Clica "Sacar" ✅                    │
│      ↓                              │
│ Verifica banco configurado ✅       │
│      ↓                              │
│ Digita valor ✅                     │
│      ↓                              │
│ Confirma -R$ do saldo ✅            │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ TESTE 5: Comparar com Motoboy       │
├─────────────────────────────────────┤
│ Mesmo fluxo ✅                      │
│ Mesmas operações ✅                 │
│ Mesma segurança ✅                  │
│ Mesma interface ✅                  │
└─────────────────────────────────────┘
```

---

## 🎯 Summary

```
LOJISTA CARTEIRA SYSTEM:

1. Automatic Crediting
   └─ Pedido criado → Loja recebe automaticamente

2. Role-Based Access
   └─ Muda role via navbar → Vê wallet correta

3. Bidirectional Transfers
   └─ Store ↔ User transferências funcionam

4. User Operations
   └─ Depositar, Sacar, Transferir no user wallet

5. Security & Validation
   └─ Apenas seu próprio dinheiro, suas próprias operações

6. Complete History
   └─ Toda transação registrada e rastreável

RESULTADO: 🎉 IDÊNTICO AO MOTOBOY
```

---

**Status: 🟢 PRONTO PARA PRODUÇÃO**
