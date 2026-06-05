# 💰 Sistema de Repasses e Comissões - Drop Marketplace

## 📊 Visão Geral do Fluxo de Dinheiro

```
CLIENTE
  ↓ (paga valor total)
  ├─→ LOJA (recebe % conforme seu plano)
  ├─→ PLATAFORMA/CEO (recebe taxa de comissão)
  └─→ MOTOBOY (recebe na entrega finalizada)
```

---

## 💳 Como Funciona

### 1️⃣ **Cliente Cria Pedido**
**Arquivo**: `src/controllers/orderController.ts` → `createOrder()`

```typescript
// Cálculo de distribuição
const distribution = await calculateOrderDistribution(
  totalValue,     // Subtotal + Taxa entrega
  storeId,
  deliveryDistanceKm
);

// distribution.storeAmount    = 80% (exemplo)
// distribution.ceoAmount      = 20% (taxa da loja)
// distribution.motoboyAmount  = R$ 7-15 (fixa conforme distância)
```

---

## 🏪 Fluxo de Crédito da Loja

### Quando o pedido é criado:
1. **Cliente paga**: R$ 100 + R$ 10 (entrega) = **R$ 110**
2. **Taxa da loja** é calculada conforme seu plano
3. **Crédito automático** na wallet da loja

**Código**:
```typescript
// ✅ CRÉDITO - Loja
let storeWallet = await Wallet.findOne({
  owner: storeId,
  ownerType: 'store'
});

storeWallet.balance += distribution.storeAmount;  // Adiciona saldo
storeWallet.totalIncome += distribution.storeAmount;
storeWallet.history.push({
  date: new Date(),
  type: 'credit',
  category: 'payment',
  amount: distribution.storeAmount,
  reason: 'Venda',
  relatedId: customerId  // ID do cliente
});
await storeWallet.save();
```

### Taxa conforme Plano da Loja

**Arquivo**: `src/utils/walletCalculations.ts`

```typescript
export async function getStorePlanFee(storeId: string): Promise<number> {
  const user = await User.findById(storeId).populate('planId');
  
  if (user && user.planId) {
    const plan = await PricingPlan.findById(user.planId);
    return plan.commission || 0;  // Retorna % de comissão
  }

  // Fallback para planos padrão
  const planFees = {
    1: 15,   // Plano 1 = 15% de taxa
    2: 20,   // Plano 2 = 20% de taxa
    3: 30    // Plano 3 = 30% de taxa
  };
  return planFees[store.plan || 1] || 15;
}
```

### Exemplo Real:
```
Pedido de R$ 100
Taxa do plano da loja: 20%

LOJA RECEBE: R$ 100 × (1 - 0.20) = R$ 80
CEO RECEBE:  R$ 100 × 0.20 = R$ 20
```

---

## 🛵 Fluxo de Crédito do Motoboy

### Quando a entrega é finalizada:
**Arquivo**: `src/controllers/deliveryController.ts` → `finalizarEntrega()`

```typescript
export const finalizarEntrega = async (req, res) => {
  // ... validações ...
  
  // Calcula ganho dinâmico
  const earning = await calculateMotoboyEarningsWithConfig(
    delivery.distance || 0,
    delivery.rating || 0
  );
  
  // Credita na wallet do motoboy
  let motoboyWallet = await Wallet.findOne({
    owner: userId,
    ownerType: 'motoboy'
  });
  
  motoboyWallet.balance += earning;
  motoboyWallet.totalIncome += earning;
  motoboyWallet.history.push({
    date: new Date(),
    type: 'credit',
    category: 'delivery_completed',
    amount: earning,
    reason: `Ganho por entrega completada (${delivery.distance}km)`,
    relatedId: delivery._id.toString()
  });
  await motoboyWallet.save();
};
```

### Cálculo do Ganho do Motoboy

**Arquivo**: `src/utils/walletCalculations.ts`

```typescript
export async function calculateMotoboyEarningsWithConfig(
  distanceKm: number,
  rating?: number
): Promise<number> {
  const config = await PlatformConfig.findOne();
  
  // Valores configuráveis pelo CEO
  const baseValue = config?.motoboyCutPerDelivery || 5;    // R$ 5 base
  const perKmValue = config?.motoboyCutPerKm || 1;         // R$ 1 por km
  
  const distanceEarning = distanceKm * perKmValue;
  
  // Bônus por avaliação
  let ratingBonus = 0;
  if (rating >= 4.5) {
    ratingBonus = 2.0;  // R$ 2 extra
  } else if (rating >= 3.5) {
    ratingBonus = 1.0;  // R$ 1 extra
  }
  
  return baseValue + distanceEarning + ratingBonus;
}
```

### Exemplo Real:
```
Entrega de 5km com rating 4.8

Base:          R$ 5.00
Distância:     5km × R$ 1 = R$ 5.00
Bônus rating:  R$ 2.00

TOTAL MOTOBOY: R$ 12.00
```

---

## 🏛️ Fluxo de Crédito da Plataforma (CEO)

### Quando o pedido é criado:
**Arquivo**: `src/controllers/orderController.ts` → `createOrder()`

```typescript
// ✅ CRÉDITO - CEO/Platform
let ceoWallet = await Wallet.findOne({
  owner: 'platform',
  ownerType: 'platform'
});

ceoWallet.balance += distribution.ceoAmount;
ceoWallet.totalIncome += distribution.ceoAmount;
ceoWallet.history.push({
  date: new Date(),
  type: 'credit',
  amount: distribution.ceoAmount,
  reason: 'Taxa plataforma',
  relatedId: storeId
});
await ceoWallet.save();
```

---

## 💼 Modelo de Dados - Wallet

**Arquivo**: `src/models/Wallet.ts`

```typescript
interface IWallet extends Document {
  owner: string;              // userId, storeId, 'platform', ou motoboyId
  ownerType: 'user' | 'store' | 'platform' | 'motoboy';
  
  balance: number;            // Saldo atual
  totalIncome: number;        // Total recebido
  totalSpent: number;         // Total gasto
  
  platformFeeRate?: number;   // % de taxa
  
  history: Array<{
    date: Date;
    type: 'credit' | 'debit' | 'refund';
    category?: 'deposit' | 'withdrawal' | 'payment' | 'delivery_completed' | 'penalty';
    amount: number;
    reason: string;
    paymentMethod?: string;
    relatedId?: string;       // ID do pedido/entrega relacionado
  }>;
}
```

---

## 📊 Exemplo Completo de Pedido

### Pedido:
- **Cliente**: João
- **Loja**: Pizzaria XYZ (Plano 2 = 20% taxa)
- **Produtos**: R$ 100
- **Distância**: 5km
- **Taxa Entrega**: R$ 10
- **Motoboy Rating**: 4.8 ⭐

### Cálculo:
```
SUBTOTAL: R$ 100 + R$ 10 = R$ 110

DISTRIBUIÇÃO:
├─ LOJA RECEBE:        R$ 110 × (1 - 0.20) = R$ 88
├─ PLATAFORMA RECEBE:  R$ 110 × 0.20 = R$ 22
└─ MOTOBOY RECEBE:     R$ 5 + (5km × R$ 1) + R$ 2 = R$ 12

TOTAL DISTRIBUÍDO: R$ 88 + R$ 22 = R$ 110 ✅ (cliente paga tudo)
MOTOBOY ADICIONAL: R$ 12 (pago quando finaliza entrega)
```

---

## 🔄 Fluxo Transacional Completo

```
1️⃣ CLIENTE CRIA PEDIDO
   └─ Wallet Cliente: -R$ 110 (debit)
   └─ Wallet Loja: +R$ 88 (credit)
   └─ Wallet Platform: +R$ 22 (credit)

2️⃣ MOTOBOY FINALIZA ENTREGA
   └─ Wallet Motoboy: +R$ 12 (credit)

3️⃣ [FUTURO] SAQUE LOJA
   └─ Wallet Loja: -R$ 50 (debit para saque)
   └─ Conta Bancária Loja: +R$ 50

4️⃣ [FUTURO] SAQUE MOTOBOY
   └─ Wallet Motoboy: -R$ 12 (debit para saque)
   └─ Conta Bancária Motoboy: +R$ 12
```

---

## 🎯 Para Aonde Vai o Dinheiro?

### Cliente
- Carteira `Wallet` com `ownerType: 'user'`
- Débito ao fazer pedido
- Crédito ao depositar saldo
- Histórico completo em `wallet.history`

### Loja (Seller)
- Carteira `Wallet` com `ownerType: 'store'`
- Crédito imediato quando pedido é criado
- Pode sacar via `POST /withdrawals`
- Taxa deduzida automaticamente conforme plano

### Motoboy
- Carteira `Wallet` com `ownerType: 'motoboy'`
- Crédito quando entrega é finalizada
- Valor dinâmico conforme distância + avaliação
- Pode sacar via `POST /withdrawals`

### Plataforma/CEO
- Carteira `Wallet` com `owner: 'platform'`, `ownerType: 'platform'`
- Recebe taxa de cada pedido
- Quantidade = Taxa da loja × Valor total pedido
- Representa a receita da plataforma

---

## ⚙️ Configurações (PlatformConfig)

**Arquivo**: `src/models/PlatformConfig.ts`

O CEO pode ajustar:
```typescript
{
  motoboyCutPerDelivery: 5,      // R$ 5 base por entrega
  motoboyCutPerKm: 1,            // R$ 1 por km
  platformBaseFee: 0.20,         // 20% de taxa padrão
  deliveryFeeBase: 5,
  deliveryFeePerKm: 1
}
```

---

## 📱 Como Consultam Saldo?

### Cliente
```
GET /wallets/:userId
{
  balance: 45.50,
  totalIncome: 500,
  totalSpent: 454.50,
  history: [...]
}
```

### Loja
```
GET /wallets/store/:storeId
{
  plan: 2,
  feePercent: 20,
  balance: 1250.00,
  totalIncome: 5000,
  totalSpent: 3750,
  history: [...]
}
```

### Motoboy
```
GET /wallets/motoboy/:motoboyId
{
  balance: 234.00,
  totalIncome: 500,
  totalSpent: 266,
  history: [...]
}
```

---

## 🚀 Fluxo de Saque (Withdrawal)

**Arquivo**: `src/controllers/withdrawalController.ts`

```typescript
POST /withdrawals
{
  amount: 100,
  bankAccount: "123456789",
  bankCode: "001"
}

// Sistema:
// 1. Verifica saldo
// 2. Cria WithdrawalRequest (pendente)
// 3. Loja/Motoboy aguarda aprovação CEO
// 4. CEO aprova e banco processa
```

---

## 📈 Resumo das Transações

| Momento | Quem | Tipo | Categoria | Valor | Para Onde |
|---------|------|------|-----------|-------|-----------|
| Pedido criado | Cliente | Debit | payment | -R$ 110 | Sai da wallet |
| Pedido criado | Loja | Credit | payment | +R$ 88 | Entra na wallet |
| Pedido criado | Platform | Credit | tax | +R$ 22 | Entra na wallet |
| Entrega finalizada | Motoboy | Credit | delivery_completed | +R$ 12 | Entra na wallet |
| Saque | Loja | Debit | withdrawal | -R$ 88 | Sai da wallet |
| Transferência | Loja | Transfer | bank_transfer | +R$ 88 | Banco da loja |

---

## 🔐 Segurança

- ✅ Transações em **MongoDB Sessions** (ACID)
- ✅ Saldo **nunca pode ser negativo**
- ✅ Histórico **imutável** (append-only)
- ✅ Criptografia de dados sensíveis (bank info)
- ✅ Rate limiting em operações críticas

---

**Status**: ✅ Completamente implementado  
**Nota**: Motoboy recebe ALÉM do valor que loja paga = custo adicional da plataforma
