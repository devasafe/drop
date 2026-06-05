# 🚀 QUICK REFERENCE - CÓDIGO PARA COPIAR/COLAR

Copie e cole estes código para corrigir os bugs. Cada seção tem LINE NUMBER aproximado.

---

## 🔧 FIX #1: Remover 'enviado'

**Arquivo:** `src/controllers/cancellationController.ts`  
**Função:** `cancelOrderByCustomer`  
**Linha ~60:** Procure por:

```typescript
const cancellableStatuses = ['criado', 'pago', 'enviado'];
```

**Substitua por:**

```typescript
const cancellableStatuses = ['criado', 'pago'];
```

**Pronto!** ✅

---

## 🔧 FIX #2 & #4: Refund + Reverter Wallets em rejectOrderByStore

**Arquivo:** `src/controllers/cancellationController.ts`  
**Função:** `rejectOrderByStore`  
**Linha ~360-400:** Adicione ANTES de `order.save()`:

```typescript
    // ✅ FIX #2 & #4: Processa refund + reverte wallets
    if (refundAmount > 0 && refundStatus === 'processed') {
      try {
        // Wallet(cliente) recebe dinheiro
        let wallet = await Wallet.findOne({
          owner: order.customerId,
          ownerType: 'user'
        });

        if (!wallet) {
          wallet = await Wallet.create({
            owner: order.customerId,
            ownerType: 'user',
            balance: refundAmount,
            totalIncome: 0,
            totalSpent: 0,
            history: [{
              type: 'refund',
              category: 'refund',
              amount: refundAmount,
              reason: `Reembolso - Rejected by store: ${reason}`,
              date: new Date(),
              relatedOrderId: orderId
            }]
          });
        } else {
          wallet.balance += refundAmount;
          wallet.history.push({
            type: 'refund',
            category: 'refund',
            amount: refundAmount,
            reason: `Reembolso - Rejected by store: ${reason}`,
            date: new Date(),
            relatedOrderId: orderId
          });
          await wallet.save();
        }

        // Reverter Wallet(loja)
        const storeAmount = order.walletDistribution?.storeAmount || 0;
        if (storeAmount > 0) {
          await Wallet.updateOne(
            { owner: order.storeId, ownerType: 'store' },
            {
              $inc: { balance: -storeAmount },
              $push: {
                history: {
                  type: 'debit',
                  category: 'refund',
                  amount: storeAmount,
                  reason: `Reembolso - refunded order ${orderId}`,
                  date: new Date(),
                  relatedOrderId: orderId
                }
              }
            }
          );
        }

        // Reverter Wallet(platform)
        const ceoAmount = order.walletDistribution?.ceoAmount || 0;
        if (ceoAmount > 0) {
          await Wallet.updateOne(
            { ownerType: 'platform' },
            {
              $inc: { balance: -ceoAmount },
              $push: {
                history: {
                  type: 'debit',
                  category: 'refund',
                  amount: ceoAmount,
                  reason: `Refund commission - order ${orderId}`,
                  date: new Date(),
                  relatedOrderId: orderId
                }
              }
            }
          );
        }

        console.log(`✅ Refund processed: R$ ${refundAmount}`);
      } catch (err) {
        console.error('❌ Refund error:', err);
      }
    }

    // ✅ FIX #5: Reverter estoque
    try {
      for (const item of order.products) {
        await Product.findByIdAndUpdate(
          item.productId,
          { $inc: { quantity: item.quantity } }
        );
      }
      console.log(`✅ Stock reverted for order ${orderId}`);
    } catch (err) {
      console.error('❌ Stock error:', err);
    }
```

**Pronto!** ✅

---

## 🔧 FIX #3: Refund em rejectDeliveryByMotoboy (action='cancel')

**Arquivo:** `src/controllers/cancellationController.ts`  
**Função:** `rejectDeliveryByMotoboy`  
**Linha ~190:** Procure por:

```typescript
    else if (action === 'cancel') {
      delivery.status = 'cancelled';
      delivery.cancelledAt = new Date();
      await delivery.save();

      order.status = 'cancelado';
      order.cancelledAt = new Date();
      await order.save();
```

**Substitua por:**

```typescript
    else if (action === 'cancel') {
      delivery.status = 'cancelled';
      delivery.cancelledAt = new Date();
      await delivery.save();

      order.status = 'cancelado';
      order.cancelledAt = new Date();

      // ✅ FIX #3: Processa refund
      const refundAmount = order.totalValue || 0;
      if (refundAmount > 0) {
        try {
          let wallet = await Wallet.findOne({
            owner: order.customerId,
            ownerType: 'user'
          });

          if (!wallet) {
            wallet = await Wallet.create({
              owner: order.customerId,
              ownerType: 'user',
              balance: refundAmount,
              totalIncome: 0,
              totalSpent: 0,
              history: [{
                type: 'refund',
                category: 'refund',
                amount: refundAmount,
                reason: `Refund - Delivery cancelled: ${reason}`,
                date: new Date(),
                relatedDeliveryId: deliveryId
              }]
            });
          } else {
            wallet.balance += refundAmount;
            wallet.history.push({
              type: 'refund',
              category: 'refund',
              amount: refundAmount,
              reason: `Refund - Delivery cancelled: ${reason}`,
              date: new Date(),
              relatedDeliveryId: deliveryId
            });
            await wallet.save();
          }

          // Reverter store wallet
          const storeAmount = order.walletDistribution?.storeAmount || 0;
          if (storeAmount > 0) {
            await Wallet.updateOne(
              { owner: order.storeId, ownerType: 'store' },
              {
                $inc: { balance: -storeAmount },
                $push: {
                  history: {
                    type: 'debit',
                    category: 'refund',
                    amount: storeAmount,
                    reason: `Refund - cancelled delivery ${deliveryId}`,
                    date: new Date()
                  }
                }
              }
            );
          }

          // Reverter platform wallet
          const ceoAmount = order.walletDistribution?.ceoAmount || 0;
          if (ceoAmount > 0) {
            await Wallet.updateOne(
              { ownerType: 'platform' },
              {
                $inc: { balance: -ceoAmount },
                $push: {
                  history: {
                    type: 'debit',
                    category: 'refund',
                    amount: ceoAmount,
                    reason: `Commission refund - delivery ${deliveryId}`,
                    date: new Date()
                  }
                }
              }
            );
          }

          // Reverter stock
          for (const item of order.products) {
            await Product.findByIdAndUpdate(
              item.productId,
              { $inc: { quantity: item.quantity } }
            );
          }

          console.log(`✅ Refund: R$ ${refundAmount}`);
        } catch (err) {
          console.error('❌ Refund error:', err);
        }
      }

      await order.save();

      // ✅ FIX #9: Notificar cliente
      emitToRoom(`user:${order.customerId}`, 'delivery:cancelled', {
        orderId: order._id,
        deliveryId: delivery._id,
        reason: reason || 'Cancelled by motoboy',
        refund: refundAmount,
        message: `Refund of R$ ${refundAmount} processed`,
        timestamp: new Date()
      });
```

**Pronto!** ✅

---

## 🔧 FIX #4: Transação em acceptOrderByStore

**Arquivo:** `src/controllers/orderController.ts`  
**Função:** `acceptOrderByStore`  
**Linha ~270:** Adicione no início:

```typescript
export const acceptOrderByStore = async (req, res) => {
  const { orderId } = req.params;
  const { distance } = req.body;
  const userId = req.user!._id;

  // ✅ FIX #4: Inicializar transação
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
```

**Linha ~280-310:** Substitua toda a lógica Save por:

```typescript
    // ✅ FIX #4: Usar session
    const order = await Order.findById(orderId).session(session);
    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!['criado', 'pago'].includes(order.status)) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'Cannot accept order' });
    }

    const store = await Store.findById(order.storeId).session(session);
    if (store?.owner.toString() !== userId) {
      await session.abortTransaction();
      return res.status(403).json({ error: 'Not authorized' });
    }

    // UPDATE order within transaction
    order.status = 'pago';
    order.acceptedAt = new Date();
    await order.save({ session });

    // CREATE delivery within transaction
    const delivery = new Delivery({
      orderId: order._id,
      storeId: order.storeId,
      customerId: order.customerId,
      distance: distance || 5,
      fee: 7 + ((distance || 5) * 1),
      status: 'pending',
      pinRetirada: Math.random().toString().slice(2, 8),
      pin: Math.random().toString().slice(2, 8),
      pinCreatedAt: new Date()
    });
    await delivery.save({ session });

    order.deliveryId = delivery._id;
    await order.save({ session });

    // ✅ COMMIT
    await session.commitTransaction();

    emitOrderAcceptedByStore(order.toObject());
    emitDeliveryCreated(delivery.toObject());
    
    return res.json({
      message: 'Order accepted',
      order: order.toObject(),
      delivery: delivery.toObject()
    });

  } catch (error) {
    // ✅ ABORT se erro
    await session.abortTransaction();
    console.error('Error accepting order:', error);
    return res.status(500).json({ error: 'Error accepting order' });

  } finally {
    await session.endSession();
  }
};
```

**Pronto!** ✅

---

## 🔧 FIX #5: Auto-Reassignment com Timeout

**Arquivo (novo):** `src/jobs/deliveryTimeout.job.ts`

Crie este arquivo completo:

```typescript
import cron from 'node-cron';
import Delivery from '../models/Delivery';
import Order from '../models/Order';
import { emitToRoom } from '../utils/socketEmitter';

export function initDeliveryTimeoutJob() {
  // Rodar a cada 5 minutos
  cron.schedule('*/5 * * * *', async () => {
    try {
      console.log('🔄 Checking delivery timeouts...');

      const TIMEOUT_MINUTES = 30;
      const cutoffTime = new Date(Date.now() - TIMEOUT_MINUTES * 60 * 1000);

      // Encontra entregas com timeout
      const timedOut = await Delivery.find({
        status: 'assigned',
        createdAt: { $lt: cutoffTime },
        motoboyId: { $ne: null }
      }).populate('motoboyId').populate('orderId');

      if (timedOut.length === 0) {
        console.log('✅ No timeouts');
        return;
      }

      console.log(`⚠️  Found ${timedOut.length} timeouts`);

      for (const delivery of timedOut) {
        try {
          const order = delivery.orderId as any;
          const motoboy = delivery.motoboyId as any;

          console.log(`⏰ Timeout: ${delivery._id} - motoboy ${motoboy?.name}`);

          // Voltar para pending
          delivery.status = 'pending';
          delivery.motoboyId = undefined;
          delivery.updatedAt = new Date();
          await delivery.save();

          // Notificar cliente
          emitToRoom(`user:${order.customerId}`, 'delivery:reassigned', {
            deliveryId: delivery._id,
            orderId: order._id,
            reason: 'Motoboy timeout',
            message: 'Reassigned to another motoboy',
            timestamp: new Date()
          });

          // Notificar motoboys para nova reclamação
          emitToRoom('motoboys', 'delivery:available', {
            deliveryId: delivery._id,
            orderId: order._id,
            distance: delivery.distance,
            fee: delivery.fee,
            location: order.address
          });

          console.log(`✅ Reassigned: ${delivery._id}`);

        } catch (err) {
          console.error(`❌ Error reassigning: ${err}`);
        }
      }

    } catch (err) {
      console.error('❌ Timeout job error:', err);
    }
  });
}
```

**Arquivo:** `src/app.ts` ou `src/server.ts`

Adicione no `listen()`:

```typescript
import { initDeliveryTimeoutJob } from './jobs/deliveryTimeout.job';

app.listen(PORT, () => {
  console.log(`🚀 Server on port ${PORT}`);
  
  // ✅ FIX #5: Inicializar job
  initDeliveryTimeoutJob();
  console.log('📅 Jobs started');
});
```

**Pronto!** ✅

---

## 🔧 FIX #9: Notificar Cliente em Reassignment

**Arquivo:** `src/controllers/cancellationController.ts`  
**Função:** `rejectDeliveryByMotoboy`  
**Linha ~170:** Procure por:

```typescript
    if (action === 'reassign') {
      delivery.status = 'pending';
      delivery.motoboyId = undefined;
      await delivery.save();

      emitDeliveryRejected(delivery.toObject(), 'motoboy', reason);
```

**Substitua por:**

```typescript
    if (action === 'reassign') {
      delivery.status = 'pending';
      delivery.motoboyId = undefined;
      await delivery.save();

      // ✅ FIX #9: Notificar cliente
      emitToRoom(`user:${order.customerId}`, 'delivery:reassigned', {
        orderId: order._id,
        deliveryId: delivery._id,
        reason: reason || 'Motoboy unavailable',
        message: 'New motoboy will be assigned soon',
        timestamp: new Date()
      });

      // Notificar loja
      emitToRoom(`store:${order.storeId}`, 'delivery:reassigned', {
        deliveryId: delivery._id,
        reason,
        timestamp: new Date()
      });

      emitDeliveryRejected(delivery.toObject(), 'motoboy', reason);
```

**Pronto!** ✅

---

## ✅ Checklist Implementação

```
PARTE 1 - cancellationController.ts:
├─ FIX #1: Remover 'enviado' (2 segundos)
├─ FIX #2 & #4: Refund + wallets em rejectOrderByStore (~50 linhas)
├─ FIX #3: Refund em rejectDeliveryByMotoboy (~80 linhas)
├─ FIX #5: Stock revert (copiar de FIX #2)
└─ FIX #9: Notificar cliente (~10 linhas)

PARTE 2 - orderController.ts:
├─ FIX #4: Transação em acceptOrderByStore (~15 linhas mod)

PARTE 3 - Novo arquivo:
├─ Criar: src/jobs/deliveryTimeout.job.ts (~60 linhas)
├─ Editar: src/app.ts (~3 linhas)

TOTAL: ~200 linhas de código novo/editado
TEMPO ESTIMADO: 2-3 horas dev
IMPACTO: 🚀 Salva sistema de bugs críticos
```

---

## 🧪 Testar

Depois de cada implementação, rode:

```bash
# Teste #1: Cliente cancela
POST /orders/123/cancel
{ "reason": "customer_request" }

# Teste #2: Loja rejeita
POST /orders/123/reject
{ "reason": "not_available" }

# Teste #3: Motoboy cancela
POST /deliveries/456/reject
{ "action": "cancel", "reason": "invalid address" }

# Teste #4: Timeout job (espere 5+ minutos)
# Verifique logs: "Checking delivery timeouts..."
```

---

## ⚡ Ordem de Implementação

1. FIX #1 (2 seg) → Testar
2. FIX #2 & #4 & #5 (30 min) → Testar rejectOrderByStore
3. FIX #3 (15 min) → Testar rejectDeliveryByMotoboy
4. FIX #4 Transação (20 min) → Testar acceptOrderByStore
5. FIX #5 Job (15 min) → Testar timeout
6. FIX #9 (5 min) → Testar notificação

**Total: ~1 hora 30 min de implementação**

---

**Pronto para copiar/colar!** 🚀
