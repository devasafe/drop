# 📊 Arquitetura: Sistema de Repasses de Comissão com Caixa do App

## 🎯 Objetivo
Implementar um sistema completo de cálculo e repasse de comissões onde:
1. **Cliente** vê o valor total com todas as porcentagens incluídas
2. **Motoboy** recebe o valor já descontado pela comissão do app
3. **Caixa do App** recebe as comissões do produto e do motoboy (separadas das carteiras)
4. **CEO** tem controle total sobre configurações e pode sacar/depositar no caixa do app

---

## 💡 Fluxo de Valores

### Exemplo Prático
```
PRODUTO: R$ 100.00
TAXA ENTREGA: R$ 10.00
TOTAL CLIENTE: R$ 110.00

├─ Comissão Plano da Loja: 15%
│  └─ Do PRODUTO (100): 15% = R$ 15.00 → CAIXA DO APP
│  └─ Loja recebe: 100 - 15 = R$ 85.00
│
├─ Taxa Entrega: R$ 10.00
│  ├─ Comissão Motoboy do App: 20% (novo campo)
│  │  └─ 20% de 10 = R$ 2.00 → CAIXA DO APP
│  │
│  └─ Motoboy recebe: 10 - 2 = R$ 8.00
│
└─ CAIXA DO APP recebe: R$ 15.00 + R$ 2.00 = R$ 17.00
```

### O que o Motoboy Vê
```
Corrida disponível:
├─ Distância: 2.5 km
├─ Valor da entrega: R$ 8.00  ← JÁ DESCONTADO
└─ Status: Disponível

(Ele NÃO vê que é R$ 10 - 20% do app)
```

---

## 📁 Modelos de Dados

### 1. PlatformConfig (ATUALIZADO)
```typescript
export interface IPlatformConfig extends Document {
  // COMISSÕES POR PLANO (do produto)
  commissionPlan1: number;      // %
  commissionPlan2: number;      // %
  commissionPlan3: number;      // %

  // GANHOS MOTOBOY
  motoboyCutPerDelivery: number;  // R$
  motoboyCutPerKm: number;         // R$/km

  // ✨ NOVO: Comissão do motoboy para o app
  motoboyCommissionPercent: number; // % da taxa de entrega que o app fica
  
  // Metadata
  updatedAt: Date;
  updatedBy: string;
}
```

### 2. AppCashbox (NOVO)
```typescript
export interface IAppCashbox extends Document {
  balance: number;                    // Saldo atual
  totalIncome: number;               // Renda acumulada
  totalExpenses: number;             // Despesas acumuladas
  history: Array<{
    type: 'income' | 'expense' | 'withdrawal' | 'deposit';
    source: 'product_commission' | 'delivery_commission' | 'manual_deposit' | 'manual_withdrawal';
    amount: number;
    orderId?: string;
    deliveryId?: string;
    reason?: string;
    date: Date;
  }>;
}
```

### 3. Withdrawal (NOVO - para saques do caixa)
```typescript
export interface IWithdrawal extends Document {
  appCashboxId: string;
  amount: number;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  bankInfo?: {
    account: string;
    agency: string;
    bank: string;
  };
  requestedAt: Date;
  processedAt?: Date;
  processedBy?: string;
  reason?: string;
}
```

---

## 🔄 Fluxo de Dados

### 1️⃣ Quando Pedido é Criado
```
POST /api/orders
├─ Cliente vê: Subtotal (100) + Taxa Entrega (10) = R$ 110
├─ Calcula distribuição:
│  ├─ storeAmount = 100 * (1 - 0.15) = 85
│  ├─ appCommission = 100 * 0.15 = 15  ← GUARDA para depois
│  └─ motoboyEarning = 10 - 2 = 8      ← CALCULA JÁ DESCONTADO
└─ Salva em Order: { appCommission: 15, motoboyPreCalculatedEarning: 8 }
```

### 2️⃣ Quando Loja Aceita Pedido
```
POST /api/orders/:id/accept
├─ Cria Delivery:
│  ├─ distance: 2.5
│  ├─ fee: 10 (taxa original do cliente)
│  ├─ motoboyEarning: 8  ← VALOR QUE MOTOBOY GANHA
│  └─ appCommission: 2   ← VALOR QUE APP GANHA
└─ Adiciona ao AppCashbox.history
```

### 3️⃣ Quando Motoboy Aceita Entrega
```
POST /api/deliveries/:id/accept
├─ Motoboy vê: Ganho de R$ 8.00
├─ Crédito na wallet do motoboy: +8
└─ AppCashbox mantém registro
```

### 4️⃣ Quando Entrega é Completada
```
POST /api/deliveries/:id/complete
├─ Motoboy recebe R$ 8.00 (débito do caixa do app se necessário)
├─ AppCashbox: +8 de ganho com entrega + 15 de comissão produto = +23 total
└─ Historicamente registrado
```

---

## 📊 Modelos MongoDB

### AppCashbox Schema
```typescript
const appCashboxSchema = new Schema({
  balance: { type: Number, default: 0 },
  totalIncome: { type: Number, default: 0 },
  totalExpenses: { type: Number, default: 0 },
  history: [{
    type: { type: String, enum: ['income', 'expense', 'withdrawal', 'deposit'] },
    source: { type: String },
    amount: { type: Number },
    orderId: String,
    deliveryId: String,
    reason: String,
    date: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
```

---

## 🛣️ Rotas Implementadas

### Backend
```
PUT /settings/platform-config
  ├─ Atualizar: motoboyCommissionPercent (novo campo)
  └─ Existentes: commissionPlan1/2/3, motoboyCutPerDelivery, etc

GET /admin/app-cashbox
  └─ Ver saldo e histórico do caixa

GET /admin/app-cashbox/statement
  └─ Extrato detalhado com filtros

POST /admin/app-cashbox/withdrawal
  └─ Solicitar saque

GET /admin/app-cashbox/withdrawals
  └─ Ver histórico de saques

POST /admin/app-cashbox/deposit
  └─ Registrar depósito manual (com comprovante)
```

### Frontend
```
GET /admin/app-cashbox
  └─ Página: /admin/app-cashbox
     ├─ Saldo atual
     ├─ Entrada total
     ├─ Saídas totais
     ├─ Histórico de movimentações
     ├─ Botão: Sacar
     └─ Botão: Registrar Depósito

PUT /admin/settings
  └─ Página: /admin/settings (EXISTENTE)
     └─ Novo campo: Comissão do Motoboy (%)
```

---

## 📋 Cálculos Detalhados

### Distribuição ao Criar Order
```typescript
// Input
const orderTotal = 100;        // Só o produto
const deliveryFee = 10;        // Taxa de entrega
const planCommission = 15;     // % da loja
const motoboyCommission = 20;  // % da taxa do app

// Output
const storeAmount = 100 * (1 - 0.15) = 85;
const appProductCommission = 100 * 0.15 = 15;
const motoboyEarning = 10 * (1 - 0.20) = 8;
const appDeliveryCommission = 10 * 0.20 = 2;

Total Cliente = 100 + 10 = 110
Total Loja = 85
Total Motoboy (quando aceitar) = 8
Total App = 15 + 2 = 17
```

---

## 🔐 Permissões

- **CEO**: Acesso total a /admin/app-cashbox, /admin/settings
- **Marketing/Gerente**: Apenas visualização
- **Lojista**: Sem acesso
- **Motoboy**: Sem acesso (nunca vê a comissão)

---

## ✅ Checklist de Implementação

- [ ] Adicionar campo `motoboyCommissionPercent` ao PlatformConfig
- [ ] Criar modelo AppCashbox
- [ ] Atualizar `calculateOrderDistribution()` para incluir comissão do motoboy
- [ ] Atualizar `acceptOrderByStore()` para registrar comissões no AppCashbox
- [ ] Criar controller AppCashboxController
- [ ] Criar rotas: /admin/app-cashbox/*
- [ ] Atualizar UI: /admin/settings (novo campo)
- [ ] Criar página: /admin/app-cashbox
- [ ] Adicionar link na navbar do CEO
- [ ] Testes de cálculo e distribuição

