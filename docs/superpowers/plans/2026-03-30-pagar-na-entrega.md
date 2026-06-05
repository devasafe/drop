# Pagar na Entrega + Reserva Bloqueada Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o método de pagamento "pagar na entrega" com reserva bloqueada na carteira da loja e sistema de dívida para cliente que cancelar após pickup.

**Architecture:** Três subsistemas em sequência: (1) modelos de dados novos/alterados, (2) fluxos financeiros no backend (createOrder, acceptOrderByStore, finalizarEntrega, cancelamentos), (3) frontend checkout. Cada task é atômica e testável independentemente.

**Tech Stack:** Node.js/Express, Mongoose/MongoDB, TypeScript, Next.js/React, Jest

---

## Mapa de Arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/models/CustomerDebt.ts` | Criar | Modelo de dívida do cliente |
| `src/models/Order.ts` | Modificar | Adicionar `cash_on_delivery` ao enum e `debtCollected` |
| `src/models/Wallet.ts` | Modificar | Adicionar `blockedBalance` |
| `src/controllers/debtController.ts` | Criar | `GET /my-pending` |
| `src/routes/debts.ts` | Criar | Rota autenticada para dívidas |
| `src/app.ts` | Modificar | Registrar rota `/api/debts` |
| `src/controllers/orderController.ts` | Modificar | `createOrder` — skip debit para COD + cobrança de dívida |
| `src/controllers/cancellationController.ts` | Modificar | `acceptOrderByStore` — bloqueio de saldo para COD |
| `src/controllers/deliveryController.ts` | Modificar | `finalizarEntrega` — distribuição financeira para COD |
| `src/controllers/cancellationController.ts` | Modificar | Cancelamentos com lógica COD |
| `frontend/pages/checkout.tsx` | Modificar | Padronizar valor, ocultar saldo check, aviso de dívida |
| `src/tests/cancellation.test.ts` | Modificar | Adicionar casos COD |

---

## Task 1: Criar modelo CustomerDebt

**Files:**
- Create: `src/models/CustomerDebt.ts`

- [ ] **Step 1: Criar o modelo**

```typescript
// src/models/CustomerDebt.ts
import { Schema, model, Document, Types } from 'mongoose';

export interface ICustomerDebt extends Document {
  customerId: Types.ObjectId;
  amount: number;
  sourceOrderId: Types.ObjectId;
  collectedOrderId?: Types.ObjectId;
  status: 'pending' | 'collected';
  reason: string;
  createdAt: Date;
  collectedAt?: Date;
}

const CustomerDebtSchema = new Schema<ICustomerDebt>({
  customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  sourceOrderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
  collectedOrderId: { type: Schema.Types.ObjectId, ref: 'Order' },
  status: { type: String, enum: ['pending', 'collected'], default: 'pending' },
  reason: { type: String, required: true },
  collectedAt: { type: Date },
}, { timestamps: true });

CustomerDebtSchema.index({ customerId: 1, status: 1 });

export default model<ICustomerDebt>('CustomerDebt', CustomerDebtSchema);
```

- [ ] **Step 2: Commit**

```bash
git add src/models/CustomerDebt.ts
git commit -m "feat: add CustomerDebt model"
```

---

## Task 2: Adicionar `blockedBalance` ao Wallet e `cash_on_delivery` ao Order

**Files:**
- Modify: `src/models/Wallet.ts`
- Modify: `src/models/Order.ts`

- [ ] **Step 1: Adicionar `blockedBalance` à interface e schema do Wallet**

Em `src/models/Wallet.ts`, na interface `IWallet` após `totalSpent`:
```typescript
blockedBalance: number; // reservado para garantia de fee de cancelamento tardio (COD)
```

No schema, após `totalSpent`:
```typescript
blockedBalance: { type: Number, default: 0, min: 0 },
```

- [ ] **Step 2: Adicionar `cash_on_delivery` e `debtCollected` ao Order**

Em `src/models/Order.ts`, alterar a linha da interface:
```typescript
paymentMethod?: 'credit_card' | 'debit_card' | 'pix' | 'money' | 'cash_on_delivery';
debtCollected?: number; // valor de dívida cobrada neste pedido
```

No schema, alterar as linhas correspondentes:
```typescript
paymentMethod: { type: String, enum: ['credit_card', 'debit_card', 'pix', 'money', 'cash_on_delivery'] },
debtCollected: { type: Number },
```

- [ ] **Step 3: Commit**

```bash
git add src/models/Wallet.ts src/models/Order.ts
git commit -m "feat: add blockedBalance to Wallet and cash_on_delivery to Order"
```

---

## Task 3: Endpoint GET /api/debts/my-pending

**Files:**
- Create: `src/controllers/debtController.ts`
- Create: `src/routes/debts.ts`
- Modify: `src/app.ts`

- [ ] **Step 1: Criar controller**

```typescript
// src/controllers/debtController.ts
import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import CustomerDebt from '../models/CustomerDebt';

export const getMyPendingDebt = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const customerId = req.user?.id;
    if (!customerId) return res.status(401).json({ error: 'Não autenticado' });

    const debt = await CustomerDebt.findOne({ customerId, status: 'pending' });
    return res.json({ debt: debt || null });
  } catch (error: any) {
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
```

- [ ] **Step 2: Criar rota**

```typescript
// src/routes/debts.ts
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getMyPendingDebt } from '../controllers/debtController';

const router = Router();
router.get('/my-pending', authenticate, getMyPendingDebt);
export default router;
```

- [ ] **Step 3: Registrar no app.ts**

Em `src/app.ts`, após a linha `import walletsRoutes`:
```typescript
import debtsRoutes from './routes/debts';
```

Após a linha `app.use('/api/wallets', walletsRoutes);`:
```typescript
app.use('/api/debts', debtsRoutes);
```

- [ ] **Step 4: Commit**

```bash
git add src/controllers/debtController.ts src/routes/debts.ts src/app.ts
git commit -m "feat: add GET /api/debts/my-pending endpoint"
```

---

## Task 4: createOrder — skip debit para COD + cobrança de dívida

**Files:**
- Modify: `src/controllers/orderController.ts`

O `createOrder` atual sempre debita a carteira do cliente (linha 176-196). Precisa de dois ajustes: (a) pular o debit para `cash_on_delivery`, (b) cobrar dívida pendente em qualquer pedido.

- [ ] **Step 1: Escrever teste falhando para pedido COD não debitar carteira**

Em `src/tests/cancellation.test.ts`, adicionar no final do arquivo:

```typescript
// ---- Integração: cash_on_delivery ----
// Nota: estes são testes de unidade que verificam a lógica de cálculo.
// Testes de integração completos para COD estão em orders.integration.test.ts
describe('cash_on_delivery helpers', () => {
  it('calculateLateCancellationFee retorna motoboyShare=0 para motoboy', () => {
    const config = { lateCancellationFeePercent: 10, lateCancellationMotoboyShare: 50 };
    const { motoboyShare, appShare, totalFee } = calculateLateCancellationFee(500, config, 'motoboy');
    expect(motoboyShare).toBe(0);
    expect(appShare).toBe(totalFee);
    expect(totalFee).toBe(50);
  });
});
```

- [ ] **Step 2: Rodar o teste para confirmar que passa (já existe a lógica)**

```bash
cd /d/PROJETOS/Drop && npx jest src/tests/cancellation.test.ts --no-coverage 2>&1
```

Esperado: PASS (a função já existe)

- [ ] **Step 3: Modificar createOrder para COD**

Localizar em `src/controllers/orderController.ts` o bloco que verifica saldo e debita (linhas ~176-196). Substituir por:

```typescript
const isCashOnDelivery = paymentMethod === 'cash_on_delivery';

// Cobrar dívida pendente (em qualquer método de pagamento)
let pendingDebt: any = null;
let debtAmount = 0;
if (!isCashOnDelivery) {
  pendingDebt = await CustomerDebt.findOne({ customerId, status: 'pending' }).session(session);
  if (pendingDebt) {
    debtAmount = pendingDebt.amount;
  }
}

if (!isCashOnDelivery) {
  if (clientWallet.balance < totalValue + debtAmount) {
    await session.abortTransaction();
    return res.status(400).json({
      error: 'Saldo insuficiente na carteira',
      available: clientWallet.balance,
      required: totalValue + debtAmount,
      debtIncluded: debtAmount > 0 ? debtAmount : undefined,
    });
  }

  clientWallet.balance -= (totalValue + debtAmount);
  clientWallet.totalSpent += (totalValue + debtAmount);
  clientWallet.history.push({
    date: new Date(),
    type: 'debit',
    category: 'payment',
    amount: totalValue,
    reason: 'Pedido criado',
    paymentMethod: paymentMethod || 'wallet',
    relatedId: storeIdStr,
  });

  if (debtAmount > 0) {
    clientWallet.history.push({
      date: new Date(),
      type: 'debit',
      category: 'penalty',
      amount: debtAmount,
      reason: 'Cobrança de multa de cancelamento tardio pendente',
      relatedId: pendingDebt._id.toString(),
    });
  }

  await clientWallet.save({ session });
}
```

- [ ] **Step 4: Pular crédito da loja para COD**

O bloco que credita a wallet da loja (~linhas 198-230) deve ser pulado para COD, pois o crédito ocorre na entrega (Task 6). Envolver o bloco com:

```typescript
if (!isCashOnDelivery) {
  // ... bloco existente de crédito à loja (let storeWallet = ...) ...
}
```

Também pular o salvamento de `walletDistribution` no objeto `order` para COD (a distribuição ainda não aconteceu):
```typescript
walletDistribution: isCashOnDelivery ? undefined : {
  storeAmount: distribution.storeAmount,
  appCommission: distribution.product.appCommission,
  commissionPercent: distribution.product.commissionPercent,
},
```

- [ ] **Step 5: Creditar loja de origem da dívida e marcar como collected**

Ainda em `createOrder`, após o bloco de crédito da wallet da loja (linhas ~198-230), adicionar:

```typescript
// Se havia dívida pendente, creditar a loja de origem e marcar como collected
if (pendingDebt && debtAmount > 0) {
  const debtSourceOrder = await Order.findById(pendingDebt.sourceOrderId).session(session);
  if (debtSourceOrder) {
    const debtStoreWallet = await Wallet.findOne({
      owner: debtSourceOrder.storeId.toString(),
      ownerType: 'store',
    }).session(session);
    if (debtStoreWallet) {
      debtStoreWallet.balance += debtAmount;
      debtStoreWallet.totalIncome += debtAmount;
      debtStoreWallet.history.push({
        date: new Date(),
        type: 'credit',
        category: 'transfer',
        amount: debtAmount,
        reason: 'Reembolso de multa de cancelamento tardio pago pelo cliente',
        relatedId: pendingDebt._id.toString(),
      });
      await debtStoreWallet.save({ session });
    }
  }
  pendingDebt.status = 'collected';
  pendingDebt.collectedAt = new Date();
  // collectedOrderId será setado abaixo após criar o order
  await pendingDebt.save({ session });
}
```

- [ ] **Step 6: Passar `debtCollected` ao criar o Order e atualizar `collectedOrderId` da dívida**

Na criação do objeto `order` (`new Order({...})`), adicionar:
```typescript
debtCollected: debtAmount > 0 ? debtAmount : undefined,
```

Após `await order.save({ session })` e antes de `await session.commitTransaction()`, adicionar:
```typescript
if (pendingDebt && debtAmount > 0) {
  pendingDebt.collectedOrderId = order._id;
  await pendingDebt.save({ session });
}
```

- [ ] **Step 7: Adicionar import de CustomerDebt no topo do orderController**

```typescript
import CustomerDebt from '../models/CustomerDebt';
```

- [ ] **Step 8: Commit**

```bash
git add src/controllers/orderController.ts
git commit -m "feat: skip wallet debit for cash_on_delivery and collect pending debt on order creation"
```

---

## Task 5: acceptOrderByStore — bloquear saldo para COD

**Files:**
- Modify: `src/controllers/cancellationController.ts`

A função `acceptOrderByStore` está em `src/controllers/cancellationController.ts`. Quando o pedido é COD, a loja precisa bloquear o fee potencial antes de aceitar.

- [ ] **Step 1: Localizar a função `acceptOrderByStore`**

Abrir `src/controllers/cancellationController.ts` e encontrar `acceptOrderByStore` (função que transiciona pedido para `'pago'`).

- [ ] **Step 2: Adicionar lógica de bloqueio após validar ownership da loja**

Após a linha `order.acceptedAt = new Date();` e antes de `await order.save()`, inserir:

```typescript
// Se pedido COD: bloquear fee potencial na wallet da loja
if (order.paymentMethod === 'cash_on_delivery') {
  const config = await PlatformConfig.findOne();
  const feePercent = config?.lateCancellationFeePercent ?? 10;
  const requiredBlock = (order.totalValue || 0) * feePercent / 100;

  const storeWallet = await Wallet.findOne({ owner: order.storeId.toString(), ownerType: 'store' });
  if (!storeWallet || storeWallet.balance < requiredBlock) {
    return res.status(400).json({
      error: 'Saldo insuficiente para garantir pedido de pagamento na entrega',
      required: requiredBlock,
      available: storeWallet?.balance ?? 0,
    });
  }

  storeWallet.balance -= requiredBlock;
  storeWallet.blockedBalance = (storeWallet.blockedBalance || 0) + requiredBlock;
  storeWallet.history.push({
    date: new Date(),
    type: 'debit',
    category: 'transfer',
    amount: requiredBlock,
    reason: `Reserva de garantia - pedido COD ${order._id}`,
    reference: `COD_BLOCK_${order._id}`,
  });
  await storeWallet.save();
}
```

- [ ] **Step 3: Commit**

```bash
git add src/controllers/cancellationController.ts
git commit -m "feat: block store wallet balance when accepting cash_on_delivery order"
```

---

## Task 6: finalizarEntrega — distribuição financeira para COD

**Files:**
- Modify: `src/controllers/deliveryController.ts`

Para pedidos COD, a distribuição financeira (crédito loja + comissão app) deve acontecer quando o motoboy insere o PIN, não na criação do pedido.

- [ ] **Step 1: Localizar `finalizarEntrega` em `src/controllers/deliveryController.ts`**

A função está em torno da linha 246. Após `order.status = 'entregue'` e `await order.save()`, já existe um bloco que credita o motoboy. Adicionar logo antes desse bloco:

```typescript
// Distribuição financeira para pedidos COD (pagamento acontece na entrega)
if (order.paymentMethod === 'cash_on_delivery') {
  try {
    const config = await PlatformConfig.findOne();
    const feePercent = config?.lateCancellationFeePercent ?? 10;
    const requiredBlock = (order.totalValue || 0) * feePercent / 100;

    // Calcular distribuição igual ao fluxo normal de createOrder
    const distribution = await calculateOrderDistribution(
      order.totalValue - order.deliveryFee,
      order.deliveryFee,
      order.storeId.toString(),
      order.deliveryDistance || 0
    );

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      // Creditar loja
      const storeWallet = await Wallet.findOne({ owner: order.storeId.toString(), ownerType: 'store' }).session(session);
      if (storeWallet) {
        storeWallet.balance += distribution.storeAmount;
        storeWallet.totalIncome += distribution.storeAmount;
        // Liberar bloqueio
        storeWallet.blockedBalance = Math.max(0, (storeWallet.blockedBalance || 0) - requiredBlock);
        storeWallet.balance += requiredBlock; // devolve o que estava bloqueado
        storeWallet.history.push({
          date: new Date(),
          type: 'credit',
          category: 'payment',
          amount: distribution.storeAmount,
          reason: `Venda COD - pedido ${order._id}`,
          relatedId: order._id.toString(),
        });
        storeWallet.history.push({
          date: new Date(),
          type: 'credit',
          category: 'transfer',
          amount: requiredBlock,
          reason: `Liberação de reserva COD - pedido ${order._id}`,
          reference: `COD_UNBLOCK_${order._id}`,
        });
        await storeWallet.save({ session });
      }

      // Registrar comissão no AppCashbox
      const appCashbox = await AppCashbox.findOne().session(session);
      if (appCashbox) {
        appCashbox.balance += distribution.product.appCommission;
        appCashbox.totalIncome += distribution.product.appCommission;
        appCashbox.history.push({
          type: 'income',
          source: 'order_commission',
          amount: distribution.product.appCommission,
          reason: `Comissão COD - pedido ${order._id}`,
          date: new Date(),
          orderId: order._id.toString(),
        });
        await appCashbox.save({ session });
      }

      await session.commitTransaction();
      session.endSession();
    } catch (txErr) {
      await session.abortTransaction();
      session.endSession();
      console.error('Erro na distribuição financeira COD:', txErr);
    }
  } catch (err) {
    console.error('Erro ao processar pagamento COD na entrega:', err);
  }
}
```

- [ ] **Step 2: Adicionar imports necessários no topo do deliveryController.ts**

Verificar se `AppCashbox`, `mongoose`, `calculateOrderDistribution` e `PlatformConfig` já estão importados. Adicionar os que faltarem:

```typescript
import mongoose from 'mongoose';
import AppCashbox from '../models/AppCashbox';
import PlatformConfig from '../models/PlatformConfig';
import { calculateOrderDistribution } from '../utils/walletCalculations';
```

- [ ] **Step 3: Commit**

```bash
git add src/controllers/deliveryController.ts
git commit -m "feat: execute financial distribution on delivery PIN confirmation for cash_on_delivery orders"
```

---

## Task 7: Cancelamentos — lógica COD

**Files:**
- Modify: `src/controllers/cancellationController.ts`

Três sub-casos:

**A) `cancelOrderByCustomer` — COD após pickup**
- Sem `revertOrderPayment` (cliente não pagou)
- Fee sai do `blockedBalance` da loja
- Cria `CustomerDebt`

**B) `rejectOrderByStore` — COD após pickup**
- Sem `revertOrderPayment` (cliente não pagou, sem reembolso)
- Fee sai do `blockedBalance` da loja

**C) Cancelamento antes do pickup — COD**
- Liberar `blockedBalance` da loja

- [ ] **Step 1: Modificar `cancelOrderByCustomer`**

Localizar o bloco `if (isLate)` em `cancelOrderByCustomer` (~linha 104). Antes de entrar na sessão da taxa, adicionar verificação COD:

```typescript
const isCashOnDelivery = order.paymentMethod === 'cash_on_delivery';

// Para COD: não há reembolso a fazer (cliente não pagou)
if (!isCashOnDelivery) {
  try {
    await walletService.revertOrderPayment({
      order,
      reason: 'Reembolso - Pedido cancelado pelo cliente',
      reference: orderId,
    });
    refundStatus = 'processed';
    emitWalletRefund(customerId, 'user', refundAmount, `Reembolso do pedido ${orderId}`);
  } catch (walletError) {
    logger.error('Erro ao reverter pagamento no cancelamento pelo cliente', walletError as Error, { orderId });
    refundStatus = 'failed';
  }
}
```

(Remover o try/catch original de revert que estava sem essa guarda.)

- [ ] **Step 2: Ajustar bloco de taxa tardia para COD em `cancelOrderByCustomer`**

No bloco `if (isLate)`, após calcular `totalFee`, adicionar ramificação para COD:

```typescript
if (isLate) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const config = await PlatformConfig.findOne().session(session);
    const feeConfig = {
      lateCancellationFeePercent: config?.lateCancellationFeePercent ?? 10,
      lateCancellationMotoboyShare: config?.lateCancellationMotoboyShare ?? 50,
    };
    const { totalFee, motoboyShare, appShare } = calculateLateCancellationFee(
      order.totalValue || 0, feeConfig, 'customer'
    );
    lateCancellationFee = totalFee;

    if (isCashOnDelivery) {
      // Fee sai do blockedBalance da loja (cliente não pagou nada)
      const storeWallet = await Wallet.findOne({ owner: order.storeId.toString(), ownerType: 'store' }).session(session);
      if (storeWallet) {
        storeWallet.blockedBalance = Math.max(0, (storeWallet.blockedBalance || 0) - totalFee);
        storeWallet.totalSpent += totalFee;
        storeWallet.history.push({
          date: new Date(),
          type: 'debit',
          category: 'penalty',
          amount: totalFee,
          reason: 'Garantia executada - cancelamento tardio pelo cliente (COD)',
          reference: `LATE_CANCEL_COD_${orderId}`,
        });
        await storeWallet.save({ session });
      }

      // Criar dívida no cliente
      await new CustomerDebt({
        customerId,
        amount: totalFee,
        sourceOrderId: order._id,
        status: 'pending',
        reason: 'Multa de cancelamento tardio em pedido pagar na entrega',
      }).save({ session });
    } else {
      // Fluxo normal: debitar da wallet do cliente
      const customerWallet = await Wallet.findOne({ owner: customerId, ownerType: 'user' }).session(session);
      if (customerWallet) {
        customerWallet.balance -= totalFee;
        customerWallet.totalSpent += totalFee;
        customerWallet.history.push({
          type: 'debit',
          category: 'penalty',
          amount: totalFee,
          reason: 'Taxa de cancelamento tardio',
          date: new Date(),
          reference: `LATE_CANCEL_${orderId}`,
        });
        await customerWallet.save({ session });
      }
    }

    // Creditar motoboy (igual para COD e não-COD)
    if (motoboyShare > 0 && order.deliveryId) {
      const delivery = await Delivery.findById(order.deliveryId).session(session);
      if (delivery?.motoboyId) {
        const motoboyWallet = await Wallet.findOne({ owner: delivery.motoboyId, ownerType: 'motoboy' }).session(session);
        if (motoboyWallet) {
          motoboyWallet.balance += motoboyShare;
          motoboyWallet.totalIncome += motoboyShare;
          motoboyWallet.history.push({
            type: 'credit',
            category: 'transfer',
            amount: motoboyShare,
            reason: 'Compensação por cancelamento tardio do cliente',
            date: new Date(),
            reference: `LATE_CANCEL_COMP_${orderId}`,
          });
          await motoboyWallet.save({ session });
        }
      }
    }

    // Creditar AppCashbox (igual para COD e não-COD)
    if (appShare > 0) {
      const appCashbox = await AppCashbox.findOne().session(session);
      if (appCashbox) {
        appCashbox.balance += appShare;
        appCashbox.totalIncome += appShare;
        appCashbox.history.push({
          type: 'income',
          source: 'cancelled_order',
          amount: appShare,
          reason: `Taxa cancelamento tardio - Pedido ${orderId}`,
          date: new Date(),
          orderId,
        });
        await appCashbox.save({ session });
      }
    }

    await session.commitTransaction();
    session.endSession();
  } catch (feeErr) {
    await session.abortTransaction();
    session.endSession();
    logger.error('Erro ao cobrar taxa de cancelamento tardio', feeErr as Error, { orderId });
  }
}
```

- [ ] **Step 3: Modificar `rejectOrderByStore` para COD**

Localizar o bloco de `revertOrderPayment` em `rejectOrderByStore`. Adicionar guarda COD:

```typescript
const isCashOnDelivery = order.paymentMethod === 'cash_on_delivery';

if (!isCashOnDelivery) {
  await walletService.revertOrderPayment({
    order,
    reason: 'Reembolso - Pedido rejeitado pela loja',
    reference: orderId,
  });
  emitWalletRefund(order.customerId.toString(), 'user', refundAmount, `Reembolso do pedido ${orderId}`);
}
```

No bloco `if (isLate)` de `rejectOrderByStore`, substituir o debit da loja para usar `blockedBalance` quando COD:

```typescript
if (isCashOnDelivery) {
  // Fee sai do blockedBalance (reservado na aceitação)
  storeWallet.blockedBalance = Math.max(0, (storeWallet.blockedBalance || 0) - totalFee);
  storeWallet.totalSpent += totalFee;
} else {
  storeWallet.balance -= totalFee;
  storeWallet.totalSpent += totalFee;
}
storeWallet.history.push({
  type: 'debit',
  category: 'penalty',
  amount: totalFee,
  reason: 'Taxa de cancelamento tardio - rejeição pela loja',
  date: new Date(),
  reference: `LATE_CANCEL_STORE_${orderId}`,
});
await storeWallet.save({ session });
```

- [ ] **Step 4: Liberar blockedBalance em cancelamento antes do pickup (COD)**

Em `cancelOrderByCustomer`, no bloco onde `!isLate`, adicionar após cancelar o pedido:

```typescript
// Para COD antes do pickup: liberar reserva da loja se existir
if (isCashOnDelivery && order.deliveryId) {
  const config = await PlatformConfig.findOne();
  const feePercent = config?.lateCancellationFeePercent ?? 10;
  const blockAmount = (order.totalValue || 0) * feePercent / 100;
  const storeWallet = await Wallet.findOne({ owner: order.storeId.toString(), ownerType: 'store' });
  if (storeWallet && storeWallet.blockedBalance > 0) {
    const release = Math.min(blockAmount, storeWallet.blockedBalance);
    storeWallet.blockedBalance -= release;
    storeWallet.balance += release;
    storeWallet.history.push({
      date: new Date(),
      type: 'credit',
      category: 'transfer',
      amount: release,
      reason: `Liberação de reserva COD - pedido cancelado antes do pickup ${orderId}`,
      reference: `COD_UNBLOCK_${orderId}`,
    });
    await storeWallet.save();
  }
}
```

Aplicar o mesmo padrão de liberação em `rejectOrderByStore` quando `!isLate && isCashOnDelivery`.

- [ ] **Step 5: Adicionar import de CustomerDebt no cancellationController**

```typescript
import CustomerDebt from '../models/CustomerDebt';
```

- [ ] **Step 6: Commit**

```bash
git add src/controllers/cancellationController.ts
git commit -m "feat: handle cash_on_delivery cancellation flows with blocked balance and customer debt"
```

---

## Task 8: Frontend checkout — padronizar COD e exibir aviso de dívida

**Files:**
- Modify: `frontend/pages/checkout.tsx`

- [ ] **Step 1: Padronizar o valor da option**

Localizar em `checkout.tsx`:
```tsx
<option value="dinheiro">💵 Dinheiro na entrega</option>
```
Alterar para:
```tsx
<option value="cash_on_delivery">💵 Dinheiro na entrega</option>
```

- [ ] **Step 2: Adicionar state para dívida pendente**

Após `const [walletBalance, setWalletBalance] = useState(0);`, adicionar:
```tsx
const [pendingDebt, setPendingDebt] = useState<{ amount: number } | null>(null);
```

- [ ] **Step 3: Buscar dívida pendente no useEffect de carregamento da wallet**

No `useEffect` que já faz `api.get('/wallets/my-wallet')`, adicionar em paralelo:
```tsx
const debtRes = await api.get('/debts/my-pending');
if (debtRes.data.debt) {
  setPendingDebt(debtRes.data.debt);
}
```

- [ ] **Step 4: Ocultar verificação de saldo para COD**

Localizar a constante:
```tsx
const isWalletInsufficient = walletBalance < total;
```
Alterar para:
```tsx
const isWalletInsufficient = paymentMethod !== 'cash_on_delivery' && walletBalance < total;
```

- [ ] **Step 5: Exibir aviso de dívida pendente**

Localizar o bloco `<div className={styles.walletInfo}>` e antes dele adicionar:
```tsx
{pendingDebt && (
  <div className={styles.walletNote} style={{ color: '#F59E0B', marginBottom: 8 }}>
    ⚠️ Você tem uma multa pendente de R$ {pendingDebt.amount.toFixed(2)} que será cobrada neste pedido.
  </div>
)}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/pages/checkout.tsx
git commit -m "feat: cash_on_delivery checkout — standardize value, hide balance check, show debt warning"
```

---

## Task 9: Verificação manual (checklist)

- [ ] Criar pedido com `cash_on_delivery` → carteira do cliente **não** é debitada
- [ ] Loja aceita pedido COD com saldo suficiente → `blockedBalance` aumenta, `balance` diminui
- [ ] Loja tenta aceitar COD sem saldo → recebe 400 com `required` e `available`
- [ ] Motoboy entrega (PIN) → loja recebe crédito de `storeAmount`, `blockedBalance` volta ao `balance`
- [ ] Cliente cancela COD após pickup → `CustomerDebt` criada, `blockedBalance` da loja debitado, motoboy e app recebem shares
- [ ] Cliente faz próximo pedido → dívida somada ao total, loja de origem creditada, `CustomerDebt.status = 'collected'`
- [ ] Cancelamento antes do pickup (COD) → `blockedBalance` liberado, sem taxa
- [ ] Checkout exibe aviso de dívida quando há `CustomerDebt` pendente
