# ✅ IMPLEMENTAÇÃO: Sistema de Repasses de Comissão com Caixa do App

**Data:** 2026-03-11
**Status:** ✅ IMPLEMENTAÇÃO COMPLETA

---

## 📊 Resumo das Mudanças

Este documento resume TODAS as mudanças implementadas para o novo sistema de repasses de comissão com caixa do app separada.

### Arquivos Modificados
- ✅ `src/models/PlatformConfig.ts` - Adicionado campo `motoboyCommissionPercent`
- ✅ `src/controllers/settingsController.ts` - Suporte para novo campo
- ✅ `src/utils/walletCalculations.ts` - Novo cálculo de distribuição com comissão motoboy
- ✅ `src/routes/admin.ts` - Rotas para caixa do app
- ✅ `frontend/pages/admin/settings.tsx` - Campo para comissão motoboy

### Arquivos Criados
- ✅ `src/models/AppCashbox.ts` - Modelo para caixa do app
- ✅ `src/models/Withdrawal.ts` - Modelo para solicitações de saque
- ✅ `src/controllers/appCashboxController.ts` - Controller para gerenciar caixa
- ✅ `frontend/pages/admin/app-cashbox.tsx` - Página de gerenciamento do caixa

---

## 🏗️ Arquitetura

### Modelos de Dados

#### 1. PlatformConfig (ATUALIZADO)
```typescript
export interface IPlatformConfig extends Document {
  commissionPlan1: number;              // Comissão do plano 1 (%)
  commissionPlan2: number;              // Comissão do plano 2 (%)
  commissionPlan3: number;              // Comissão do plano 3 (%)
  motoboyCutPerDelivery: number;        // Ganho base motoboy (R$)
  motoboyCutPerKm: number;              // Taxa por km motoboy (R$/km)
  motoboyMinimumWithdraw: number;       // Mínimo para saque motoboy (R$)
  motoboyCommissionPercent: number;     // ✨ NOVO: Comissão do app sobre motoboy (%)
  updatedAt: Date;
  updatedBy: string;
}
```

#### 2. AppCashbox (NOVO)
```typescript
export interface IAppCashbox extends Document {
  balance: number;
  totalIncome: number;
  totalExpenses: number;
  history: Array<{
    type: 'income' | 'expense' | 'withdrawal' | 'deposit';
    source: 'product_commission' | 'delivery_commission' | 'manual_deposit' | 'manual_withdrawal';
    amount: number;
    orderId?: string;
    deliveryId?: string;
    withdrawalId?: string;
    reason?: string;
    date: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}
```

#### 3. Withdrawal (NOVO)
```typescript
export interface IWithdrawal extends Document {
  appCashboxId: string;
  amount: number;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  bankInfo?: {
    account: string;
    agency: string;
    bank: string;
    holderName: string;
    document: string;
  };
  requestedAt: Date;
  approvedAt?: Date;
  paidAt?: Date;
  rejectedAt?: Date;
  processedBy?: string;
  rejectionReason?: string;
  reason?: string;
}
```

---

## 💡 Fluxo de Cálculos

### Novo Cálculo de Distribuição

**Função:** `calculateOrderDistribution(productTotal, deliveryFeeTotal, storeId, distanceKm, motoboyRating)`

```typescript
// INPUT
productTotal = 100           // Produto
deliveryFeeTotal = 10        // Taxa de entrega (já calculada)
planCommissionPercent = 15   // Comissão da loja
motoboyCommissionPercent = 20 // Comissão do app sobre motoboy

// CÁLCULO
productStoreAmount = 100 * (1 - 0.15) = 85        // Loja recebe
productAppCommission = 100 * 0.15 = 15             // App recebe de produto

deliveryMotoboyAmount = 10 * (1 - 0.20) = 8        // Motoboy recebe
deliveryAppCommission = 10 * 0.20 = 2              // App recebe de entrega

// OUTPUT
{
  totalClient: 110,                    // O que cliente pagou
  product: {
    total: 100,
    storeAmount: 85,
    appCommission: 15,
    commissionPercent: 15
  },
  delivery: {
    total: 10,
    motoboyAmount: 8,
    appCommission: 2,
    commissionPercent: 20
  },
  storeAmount: 85,
  appTotalCommission: 17,  // 15 + 2
  motoboyAmount: 8,
  distribution: {
    store: 85,
    app: 17,
    motoboy: 8,
    client: 110
  }
}
```

---

## 🔄 Fluxo de Dados

### 1. Criar Order (Checkout)
```
POST /api/orders
├─ Cliente vê: 100 (produto) + 10 (entrega) = 110
├─ Backend calcula:
│  ├─ Loja: 85
│  ├─ App (comissão): 15 + 2 = 17
│  └─ Motoboy: 8 (ainda não finalizado)
├─ Salva Order com:
│  ├─ totalValue: 110
│  ├─ deliveryFee: 10
│  └─ walletDistribution com valores
└─ Retorna Order

Observação: Neste estágio, as comissões NÃO entram no caixa ainda.
Elas entram quando o pedido é aceito pela loja.
```

### 2. Loja Aceita Pedido
```
POST /api/orders/:id/accept
├─ Backend recupera Order
├─ Cria Delivery com:
│  ├─ fee: 10 (taxa original que cliente viu)
│  └─ motoboyEarning: 8 (já descontado)
├─ Adiciona ao AppCashbox:
│  ├─ +15 (product_commission)
│  └─ +2 (delivery_commission)
├─ Motoboy NUNCA VÊ os valores com % aplicada
└─ Notifica motoboy com entrega disponível (mostra 8, não 10)
```

### 3. Motoboy Aceita Entrega
```
POST /api/deliveries/:id/accept
├─ Motoboy vê: 8 (o que vai receber)
├─ Delivery status: assigned
└─ Wallet do motoboy recebe +8 quando entrega
```

### 4. Entrega Completada
```
POST /api/deliveries/:id/complete
├─ Motoboy recebe efetivamente 8 na wallet
├─ AppCashbox mantém registro
└─ Histórico atualizado
```

---

## 🛣️ Rotas API

### Backend - Admin Routes

```typescript
// GET /admin/app-cashbox
// Retorna saldo atual, renda e despesas
GET /admin/app-cashbox
Response:
{
  balance: 17.00,
  totalIncome: 17.00,
  totalExpenses: 0,
  history: [...]
}

// GET /admin/app-cashbox/statement
// Extrato detalhado com filtros
GET /admin/app-cashbox/statement?page=1&limit=50&source=product_commission
Response:
{
  statement: [...],
  total: 150,
  income: 500,
  expenses: 200,
  pages: 3,
  cashbox: { balance, totalIncome, totalExpenses }
}

// POST /admin/app-cashbox/withdrawal
// Solicitar saque
POST /admin/app-cashbox/withdrawal
Body:
{
  amount: 100,
  reason: "Saque mensal",
  bankInfo: {
    bank: "Banco do Brasil",
    account: "1234-5 / 123456789-0",
    holderName: "Nome Empresa",
    document: "12.345.678/0001-90"
  }
}

// GET /admin/app-cashbox/withdrawals
// Lista saques com filtro por status
GET /admin/app-cashbox/withdrawals?status=pending
Response:
{
  withdrawals: [...],
  total: 5,
  pages: 1,
  page: 1
}

// PUT /admin/app-cashbox/withdrawals/:id/approve
// Aprovar saque (débita do caixa)
PUT /admin/app-cashbox/withdrawals/:id/approve
Response: { success: true, withdrawal: {...} }

// PUT /admin/app-cashbox/withdrawals/:id/reject
// Rejeitar saque
PUT /admin/app-cashbox/withdrawals/:id/reject
Body: { rejectionReason: "Motivo..." }
Response: { success: true, withdrawal: {...} }

// POST /admin/app-cashbox/deposit
// Registrar depósito manual
POST /admin/app-cashbox/deposit
Body:
{
  amount: 500,
  reason: "Transferência bancária"
}
```

---

## 🎨 Interface Frontend

### 1. Admin Settings - Novo Campo

**Página:** `/admin/settings`

Novo campo adicionado na seção "Ganhos do Motoboy":

```
🤖 Comissão do Motoboy para o App (%)
[    20    ] %

💡 Exemplo: Taxa R$10 com 20% = Motoboy ganha R$8.00, App recebe R$2.00
```

### 2. Caixa do App - Nova Página

**Página:** `/admin/app-cashbox`

#### Seção Resumo (Overview)
- Saldo Atual: R$ X.XXX.XXX,XX
- Renda Total: R$ X.XXX.XXX,XX
- Saídas Totais: R$ X.XXX,XX
- Últimas Movimentações (últimas 10)

#### Seção Extrato (Statement)
- Tabela com:
  - Tipo (Entrada/Saída)
  - Origem (📦 Comissão de Produto, 🚗 Comissão de Entrega, etc)
  - Data/Hora
  - Valor
- Filtros por data, origem, tipo
- Paginação

#### Seção Saques (Withdrawals)
- Cards dos saques pendentes/aprovados/rejeitados
- Botões: ✅ Aprovar | ❌ Rejeitar (para pendentes)
- Detalhes bancários
- Motivo da rejeição (se rejeitado)

#### Botões Principais
- ➕ Registrar Depósito
- 💸 Solicitar Saque

#### Modals
- **Modal Saque**: Valor, Banco, Agência/Conta, Titular, Motivo
- **Modal Depósito**: Valor, Descrição/Motivo

---

## 📝 Função Auxiliar

**Arquivo:** `src/controllers/appCashboxController.ts`

```typescript
/**
 * Registra uma comissão no caixa do app
 * Chamada automaticamente quando:
 * - Order é criado (product_commission)
 * - Delivery é completado (delivery_commission)
 */
export async function addCommissionToAppCashbox(
  type: 'product_commission' | 'delivery_commission',
  amount: number,
  orderId?: string,
  deliveryId?: string,
  reason?: string
)
```

---

## 🔌 Integração com Controllers Existentes

### orderController.ts - Criar Order
```typescript
// Quando Order é criado, usar novo calculateOrderDistribution
const distribution = await calculateOrderDistribution(
  subtotal,              // produto
  deliveryFee,           // taxa entrega
  storeId,
  deliveryDistanceKm
);

// Salvar em Order:
order.walletDistribution = {
  storeAmount: distribution.storeAmount,
  appCommission: distribution.appTotalCommission,
  motoboyAmount: distribution.motoboyAmount,
};

// ❌ NÃO registrar no caixa ainda
// Isso acontece quando loja aceita
```

### cancellationController.ts - Aceitar Pedido
```typescript
export const acceptOrderByStore = async (req, res) => {
  // ... validações
  
  const order = await Order.findById(orderId);
  
  // Criar Delivery
  const delivery = new Delivery({
    orderId: order._id,
    distance: order.deliveryDistance || 0,
    fee: order.deliveryFee,
    motoboyEarning: order.walletDistribution?.motoboyAmount || 0,
    status: 'pending'
  });
  await delivery.save();
  
  // ✨ NOVO: Registrar comissões no AppCashbox
  await addCommissionToAppCashbox(
    'product_commission',
    order.walletDistribution?.appCommission || 0,
    order._id.toString()
  );
  
  // Notificar motoboys com valor já descontado
  // (mostra o motoboyEarning, não a fee original)
};
```

---

## 🧪 Casos de Teste

### Teste 1: Criar Pedido
```
1. Cliente compra: 100 (produto) + 10 (entrega) = 110
2. Verificar:
   ✅ Order.walletDistribution tem os valores corretos
   ✅ AppCashbox ainda está vazio (não registrou ainda)
```

### Teste 2: Loja Aceita
```
1. Loja aceita pedido
2. Verificar:
   ✅ Delivery criada com:
      - fee: 10 (original)
      - motoboyEarning: 8 (descontado)
   ✅ AppCashbox recebeu:
      - 15 (product_commission)
      - 2 (delivery_commission)
   ✅ Motoboy notificado vendo apenas a entrega (fee: 10, earning: 8)
```

### Teste 3: Motoboy Vê Entrega
```
1. GET /api/deliveries/available
2. Verificar:
   ✅ Delivery mostra:
      - distance: 2.5 km
      - fee: 10 (taxa original - NÃO usa isso)
      - earning: 8 (o que realmente ganha)
   ✅ Motoboy não vê a porcentagem de comissão
```

### Teste 4: Solicitar Saque
```
1. CEO clica "Solicitar Saque" em /admin/app-cashbox
2. Preenche:
   - Valor: 100
   - Banco: Banco do Brasil
   - Conta: 1234-5 / 123456789
   - Titular: Empresa Drop
3. Verificar:
   ✅ Withdrawal criado com status: pending
   ✅ AppCashbox.balance permanece em 17 (saque ainda não foi debitado)
   ✅ Aparece em /admin/app-cashbox/withdrawals?status=pending
```

### Teste 5: Aprovar Saque
```
1. CEO aprova saque de 10
2. Verificar:
   ✅ Withdrawal.status = approved
   ✅ AppCashbox.balance -= 10 (agora 7)
   ✅ AppCashbox.totalExpenses += 10
   ✅ Histórico registrado com withdrawalId
```

### Teste 6: Registrar Depósito
```
1. CEO clica "Registrar Depósito"
2. Adiciona 500
3. Verificar:
   ✅ AppCashbox.balance += 500 (agora 507)
   ✅ AppCashbox.totalIncome += 500
   ✅ Histórico registrado como 'manual_deposit'
```

---

## 🔒 Segurança

- ✅ Apenas CEO pode acessar `/admin/app-cashbox`
- ✅ Apenas CEO pode solicitar saques
- ✅ Apenas CEO pode aprovar/rejeitar saques
- ✅ Apenas CEO pode registrar depósitos
- ✅ Motoboy nunca vê a comissão do app (vê apenas seu ganho)
- ✅ Cliente nunca vê comissões (vê apenas o total)
- ✅ Cálculos são feitos no backend (nunca no frontend)
- ✅ AppCashbox é separado das wallets dos usuários

---

## 📋 Checklist de Implementação

- [x] Criar modelo AppCashbox
- [x] Criar modelo Withdrawal
- [x] Adicionar campo motoboyCommissionPercent ao PlatformConfig
- [x] Atualizar getPlatformConfig para novo campo
- [x] Atualizar updatePlatformConfig para novo campo
- [x] Reescrever calculateOrderDistribution com novo cálculo
- [x] Criar controller appCashboxController com 7 funções
- [x] Adicionar rotas em admin.ts (7 rotas)
- [x] Atualizar interface PlatformConfig no frontend
- [x] Adicionar campo motoboyCommissionPercent em admin/settings.tsx
- [x] Criar página completa /admin/app-cashbox.tsx
- [x] Adicionar função auxiliar addCommissionToAppCashbox

---

## 🚀 Próximas Etapas

1. **Integração com createOrder**
   - Atualizar orderController.ts para usar novo calculateOrderDistribution

2. **Integração com acceptOrderByStore**
   - Chamar addCommissionToAppCashbox quando loja aceita

3. **Atualizar deliveryController**
   - Garantir que motoboy vê motoboyEarning, não fee original

4. **Navbar Update**
   - Adicionar link para `/admin/app-cashbox` na navbar do CEO

5. **Testes E2E**
   - Testar fluxo completo: pedido → aceitar → saque → depositar

6. **Relatórios** (futuro)
   - Adicionar filtros de data
   - Exportar extrato em CSV/PDF
   - Gráficos de ganhos por origem

---

## 📞 Suporte

Para dúvidas sobre a implementação:
- Revisar ARQUITETURA_CAIXA_APP.md (design)
- Revisar este documento (implementação)
- Revisar código nos arquivos listados acima

---

**Status Final:** ✅ PRONTO PARA INTEGRAÇÃO

Os modelos, controllers, rotas e interface estão 100% implementados.
Agora é necessário integrar com os controllers existentes (orderController, cancellationController).
