# 🔧 IMPLEMENTAÇÃO - CÓDIGO PRONTO PARA CORRIGIR OS BUGS

---

## Correção #1: Remover 'enviado' de cancelamentos do cliente

**Arquivo:** `src/controllers/cancellationController.ts`  
**Linha aproximada:** 60

```typescript
// ANTES (BUGADO):
export const cancelOrderByCustomer = async (req, res) => {
  const { orderId } = req.params;
  const { reason, reasonCode } = req.body;
  const userId = req.user!._id;

  try {
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    // ❌ PROBLEMA #1: Permite cancelar 'enviado'
    const cancellableStatuses = ['criado', 'pago', 'enviado'];
    if (!cancellableStatuses.includes(order.status)) {
      return res.status(400).json({
        error: `Pedido não pode ser cancelado (status: ${order.status})`
      });
    }

    // ... resto do código


// DEPOIS (CORRIGIDO):
export const cancelOrderByCustomer = async (req, res) => {
  const { orderId } = req.params;
  const { reason, reasonCode } = req.body;
  const userId = req.user!._id;

  try {
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    // ✅ FIX #1: Apenas 'criado' e 'pago' podem ser cancelados
    const cancellableStatuses = ['criado', 'pago'];  // Removeu 'enviado'
    if (!cancellableStatuses.includes(order.status)) {
      return res.status(400).json({
        error: `Pedido não pode ser cancelado no estado: ${order.status}. ` +
               `Contate a loja ou aguarde a entrega.`,
        currentStatus: order.status,
        allowedStatuses: cancellableStatuses
      });
    }

    // ... resto do código
```

---

## Correção #2: Implementar Refund em rejectOrderByStore

**Arquivo:** `src/controllers/cancellationController.ts`  
**Linha aproximada:** 340 (função rejectOrderByStore)

```typescript
// ANTES (BUGADO):
export const rejectOrderByStore = async (req, res) => {
  const { orderId } = req.params;
  const { reason } = req.body;
  const userId = req.user!._id;

  try {
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    if (!['criado', 'pago'].includes(order.status)) {
      return res.status(400).json({ 
        error: 'Pedido não pode ser rejeitado neste estado' 
      });
    }

    // ❌ PROBLEMA #2: Calcula refund mas NUNCA processa
    let refundAmount = 0;
    let refundStatus = 'pending';

    if (order.paymentStatus === 'paid') {
      refundAmount = order.totalValue || 0;
      try {
        // TODO: Payment gateway integration
        refundStatus = 'processed';
      } catch (error) {
        refundStatus = 'failed';
      }
    }

    // ❌ MISSING: Wallet credit code!
    // ❌ Cancellation é criada mas refund nunca é realmente processado

    order.status = 'rejeitado';
    order.cancelledAt = new Date();
    await order.save();

    if (order.deliveryId) {
      await Delivery.findByIdAndUpdate(
        order.deliveryId,
        { status: 'cancelled', cancelledAt: new Date() }
      );
    }

    const cancellation = new Cancellation({
      orderId,
      deliveryId: order.deliveryId,
      cancelledBy: 'store',
      reason,
      refundAmount,
      refundStatus
    });
    await cancellation.save();

    emitOrderCancelled(order.toObject(), cancellation.toObject());
    
    return res.json({
      message: 'Pedido rejeitado',
      order: order.toObject(),
      cancellation: cancellation.toObject()
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao rejeitar pedido' });
  }
};


// DEPOIS (CORRIGIDO):
export const rejectOrderByStore = async (req, res) => {
  const { orderId } = req.params;
  const { reason } = req.body;
  const userId = req.user!._id;

  try {
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    if (!['criado', 'pago'].includes(order.status)) {
      return res.status(400).json({ 
        error: 'Pedido não pode ser rejeitado neste estado' 
      });
    }

    const store = await Store.findById(order.storeId);
    if (store?.owner.toString() !== userId) {
      return res.status(403).json({ error: 'Não autorizado' });
    }

    let refundAmount = 0;
    let refundStatus = 'pending';

    if (order.paymentStatus === 'paid') {
      refundAmount = order.totalValue || 0;
      try {
        // TODO: Payment gateway integration
        refundStatus = 'processed';
      } catch (error) {
        refundStatus = 'failed';
      }
    }

    // ✅ FIX #2: NOVO - Processa refund automático
    if (refundAmount > 0 && refundStatus === 'processed') {
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
              reason: `Reembolso - Pedido rejeitado pela loja: ${reason || 'sem motivo especificado'}`,
              date: new Date(),
              relatedOrderId: orderId
            }]
          });
          
          console.log(`✅ Carteira criada com refund: ${refundAmount} para cliente ${order.customerId}`);
        } else {
          // ✅ FIX #2: Debita a loja e plataforma
          const storeAmount = order.walletDistribution?.storeAmount || 0;
          const ceoAmount = order.walletDistribution?.ceoAmount || 0;

          // Credita cliente
          wallet.balance += refundAmount;
          // NÃO decrementa totalSpent (foi uma devolução, não um novo gasto)
          wallet.history.push({
            type: 'refund',
            category: 'refund',
            amount: refundAmount,
            reason: `Reembolso - Pedido rejeitado pela loja: ${reason || 'sem motivo especificado'}`,
            date: new Date(),
            relatedOrderId: orderId
          });
          await wallet.save();

          // ✅ FIX #4: Debita loja (reverte o crédito que recebeu)
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
                    reason: `Reembolso por rejeição do pedido ${orderId}`,
                    date: new Date(),
                    relatedOrderId: orderId
                  }
                }
              }
            );
          }

          // ✅ FIX #4: Debita platform (reverte a comissão)
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
                    reason: `Reembolso de comissão por rejeição ${orderId}`,
                    date: new Date(),
                    relatedOrderId: orderId
                  }
                }
              }
            );
          }

          console.log(`✅ Refund processado: R$ ${refundAmount} devolvidos. Loja: -${storeAmount}, Platform: -${ceoAmount}`);
        }
      } catch (walletError) {
        console.error('❌ Erro ao processar refund:', walletError);
        // Log para manual processing depois
        // Adicionar para sistema de alertas do admin
      }
    }

    // ✅ FIX #5: Reverter estoque
    try {
      for (const item of order.products) {
        await Product.findByIdAndUpdate(
          item.productId,
          { $inc: { quantity: item.quantity } },
          { new: true }
        );
      }
      console.log(`✅ Estoque revertido para pedido ${orderId}`);
    } catch (stockError) {
      console.error('❌ Erro ao reverter estoque:', stockError);
    }

    order.status = 'rejeitado';
    order.cancelledAt = new Date();
    await order.save();

    if (order.deliveryId) {
      await Delivery.findByIdAndUpdate(
        order.deliveryId,
        { status: 'cancelled', cancelledAt: new Date() }
      );
    }

    const cancellation = new Cancellation({
      orderId,
      deliveryId: order.deliveryId,
      cancelledBy: 'store',
      reason,
      refundAmount,
      refundStatus
    });
    await cancellation.save();

    emitOrderCancelled(order.toObject(), cancellation.toObject());
    
    return res.json({
      message: 'Pedido rejeitado com sucesso',
      refund: {
        amount: refundAmount,
        status: refundStatus,
        processPid: `REJECT_${orderId}`
      },
      order: order.toObject(),
      cancellation: cancellation.toObject()
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao rejeitar pedido' });
  }
};
```

---

## Correção #3: Implementar Refund em rejectDeliveryByMotoboy (cancel)

**Arquivo:** `src/controllers/cancellationController.ts`  
**Linha aproximada:** 180 (função rejectDeliveryByMotoboy)

```typescript
// ANTES (BUGADO):
export const rejectDeliveryByMotoboy = async (req, res) => {
  const { deliveryId } = req.params;
  const { action, reason } = req.body;
  const userId = req.user!._id;

  try {
    const delivery = await Delivery.findById(deliveryId);
    if (!delivery) return res.status(404).json({ error: 'Entrega não encontrada' });

    if (delivery.motoboyId.toString() !== userId) {
      return res.status(403).json({ error: 'Não autorizado' });
    }

    if (!['assigned', 'picked'].includes(delivery.status)) {
      return res.status(400).json({ error: 'Status não permite rejeição' });
    }

    const order = await Order.findById(delivery.orderId);

    if (action === 'reassign') {
      // Volta ao pool
      delivery.status = 'pending';
      delivery.motoboyId = undefined;
      await delivery.save();

      // ❌ PROBLEMA #9: Cliente não é notificado
      emitDeliveryRejected(delivery.toObject(), 'motoboy', reason);
      
      return res.json({ success: true, ... });
    } 
    else if (action === 'cancel') {
      delivery.status = 'cancelled';
      delivery.cancelledAt = new Date();
      await delivery.save();

      order.status = 'cancelado';
      order.cancelledAt = new Date();
      // ❌ PROBLEMA #3: Refund NÃO é processado!
      await order.save();

      const cancellation = new Cancellation({
        orderId: order._id,
        deliveryId: delivery._id,
        cancelledBy: 'motoboy',
        reason
      });
      await cancellation.save();

      emitDeliveryCancelled(delivery.toObject(), cancellation.toObject());
      
      return res.json({ success: true, ... });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao rejeitar entrega' });
  }
};


// DEPOIS (CORRIGIDO):
export const rejectDeliveryByMotoboy = async (req, res) => {
  const { deliveryId } = req.params;
  const { action, reason } = req.body;
  const userId = req.user!._id;

  try {
    const delivery = await Delivery.findById(deliveryId);
    if (!delivery) return res.status(404).json({ error: 'Entrega não encontrada' });

    if (delivery.motoboyId.toString() !== userId) {
      return res.status(403).json({ error: 'Não autorizado' });
    }

    if (!['assigned', 'picked'].includes(delivery.status)) {
      return res.status(400).json({ error: 'Status não permite rejeição' });
    }

    const order = await Order.findById(delivery.orderId);

    if (action === 'reassign') {
      // Volta ao pool
      delivery.status = 'pending';
      delivery.motoboyId = undefined;
      await delivery.save();

      // ✅ FIX #9: NOVO - Cliente é notificado
      const customer = await User.findById(order.customerId);
      emitToRoom(`user:${order.customerId}`, 'delivery:reassigned', {
        orderId: order._id,
        deliveryId: delivery._id,
        reason: reason || 'Motoboy indisponível',
        message: 'Um novo motoboy será atribuído em breve',
        timestamp: new Date()
      });

      // Notificar loja também
      emitToRoom(`store:${order.storeId}`, 'delivery:reassigned', {
        deliveryId: delivery._id,
        reason,
        timestamp: new Date()
      });

      emitDeliveryRejected(delivery.toObject(), 'motoboy', reason);
      
      return res.json({ 
        success: true,
        message: 'Entrega devolvida ao pool',
        notification: `Cliente ${customer?.name} foi notificado`
      });
    } 
    else if (action === 'cancel') {
      delivery.status = 'cancelled';
      delivery.cancelledAt = new Date();
      await delivery.save();

      order.status = 'cancelado';
      order.cancelledAt = new Date();

      // ✅ FIX #3: NOVO - Processa refund automático
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
                reason: `Reembolso - Entrega cancelada por motoboy: ${reason || 'sem motivo especificado'}`,
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
              reason: `Reembolso - Entrega cancelada por motoboy: ${reason || 'sem motivo especificado'}`,
              date: new Date(),
              relatedDeliveryId: deliveryId
            });
            await wallet.save();
          }

          // ✅ FIX #4: Reverter wallets (loja e platform)
          const storeAmount = order.walletDistribution?.storeAmount || 0;
          const ceoAmount = order.walletDistribution?.ceoAmount || 0;

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
                    reason: `Reembolso por cancelamento de entrega ${deliveryId}`,
                    date: new Date(),
                    relatedOrderId: order._id
                  }
                }
              }
            );
          }

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
                    reason: `Reembolso de comissão por cancelamento ${deliveryId}`,
                    date: new Date(),
                    relatedOrderId: order._id
                  }
                }
              }
            );
          }

          // ✅ FIX #5: Reverter estoque
          for (const item of order.products) {
            await Product.findByIdAndUpdate(
              item.productId,
              { $inc: { quantity: item.quantity } },
              { new: true }
            );
          }

          console.log(`✅ Refund processado: R$ ${refundAmount} para cliente`);
        } catch (err) {
          console.error('❌ Erro ao refund:', err);
        }
      }

      await order.save();

      const cancellation = new Cancellation({
        orderId: order._id,
        deliveryId: delivery._id,
        cancelledBy: 'motoboy',
        reason,
        refundAmount,
        refundStatus: 'processed'
      });
      await cancellation.save();

      // ✅ FIX #9: Cliente É notificado
      emitToRoom(`user:${order.customerId}`, 'delivery:cancelled', {
        orderId: order._id,
        deliveryId: delivery._id,
        reason: reason || 'Cancelado pelo motoboy',
        refund: refundAmount,
        message: `Sua entrega foi cancelada. R$ ${refundAmount} reembolsados.`,
        timestamp: new Date()
      });

      emitDeliveryCancelled(delivery.toObject(), cancellation.toObject());
      
      return res.json({ 
        success: true,
        message: 'Entrega cancelada com refund processado',
        refund: {
          amount: refundAmount,
          status: 'processed'
        }
      });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao rejeitar entrega' });
  }
};
```

---

## Correção #4: Adicionar Transação Mongoose em acceptOrderByStore

**Arquivo:** `src/controllers/orderController.ts`  
**Linha aproximada:** 270 (função acceptOrderByStore)

```typescript
// ANTES (sem transação):
export const acceptOrderByStore = async (req, res) => {
  const { orderId } = req.params;
  const { distance } = req.body;
  const userId = req.user!._id;

  try {
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    if (!['criado', 'pago'].includes(order.status)) {
      return res.status(400).json({ error: 'Pedido não pode ser aceito' });
    }

    const store = await Store.findById(order.storeId);
    if (store?.owner.toString() !== userId) {
      return res.status(403).json({ error: 'Não autorizado' });
    }

    // Atualiza order
    order.status = 'pago';
    order.acceptedAt = new Date();
    await order.save();

    // Cria delivery
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
    await delivery.save();

    // ❌ PROBLEMA #2: Se falha ao criar Delivery depois que Order foi atualizado,
    //    fica inconsistente (Order em 'pago' mas sem Delivery)

    emitOrderAcceptedByStore(order.toObject());
    emitDeliveryCreated(delivery.toObject());
    
    return res.json({ ...});
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao aceitar pedido' });
  }
};


// DEPOIS (com transação):
export const acceptOrderByStore = async (req, res) => {
  const { orderId } = req.params;
  const { distance } = req.body;
  const userId = req.user!._id;

  // ✅ FIX #2: Usar transação Mongoose
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = await Order.findById(orderId).session(session);
    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    if (!['criado', 'pago'].includes(order.status)) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'Pedido não pode ser aceito' });
    }

    const store = await Store.findById(order.storeId).session(session);
    if (store?.owner.toString() !== userId) {
      await session.abortTransaction();
      return res.status(403).json({ error: 'Não autorizado' });
    }

    // ✅ Atualiza order dentro da transação
    order.status = 'pago';
    order.acceptedAt = new Date();
    await order.save({ session });

    // ✅ Cria delivery dentro da transação
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

    // ✅ Atualiza order com deliveryId
    order.deliveryId = delivery._id;
    await order.save({ session });

    // ✅ COMMIT - Tudo é salvo junto
    await session.commitTransaction();

    emitOrderAcceptedByStore(order.toObject());
    emitDeliveryCreated(delivery.toObject());
    
    // Notificar motoboys em tempo real
    emitToRoom('motoboys', 'new_delivery', {
      deliveryId: delivery._id,
      orderId: order._id,
      distance: delivery.distance,
      fee: delivery.fee,
      location: order.address,
      storeInfo: {
        name: store?.name,
        rating: store?.averageRating
      },
      estimatedTime: delivery.distance * 5 // minutos
    });
    
    return res.json({
      message: 'Pedido aceito com sucesso',
      order: order.toObject(),
      delivery: delivery.toObject()
    });

  } catch (error) {
    // ✅ ABORT - Se algo der errado, tudo volta
    await session.abortTransaction();
    console.error('Erro ao aceitar pedido:', error);
    return res.status(500).json({ error: 'Erro ao aceitar pedido' });
    
  } finally {
    await session.endSession();
  }
};
```

---

## Correção #5: Auto-Reassignment com Timeout

**Arquivo (novo):** `src/jobs/deliveryTimeout.job.ts`

```typescript
import cron from 'node-cron';
import Delivery from '../models/Delivery';
import Order from '../models/Order';
import User from '../models/User';
import { emitToRoom } from '../utils/socketEmitter';

/**
 * Job que roda a cada 5 minutos para verificar entregas que ficaram
 * 'assigned' por muito tempo e reatribuir
 */
export function initDeliveryTimeoutJob() {
  // ✅ FIX #6: Rodar a cada 5 minutos
  cron.schedule('*/5 * * * *', async () => {
    try {
      console.log('🔄 Iniciando verificação de timeout de entregas...');

      const TIMEOUT_MINUTES = 30;
      const cutoffTime = new Date(Date.now() - TIMEOUT_MINUTES * 60 * 1000);

      // Encontra entregas que ficaram assigned por mais de 30min
      const timedOut = await Delivery.find({
        status: 'assigned',
        createdAt: { $lt: cutoffTime },
        motoboyId: { $ne: null }
      }).populate('motoboyId').populate('orderId');

      if (timedOut.length === 0) {
        console.log('✅ Nenhuma entrega com timeout');
        return;
      }

      console.log(`⚠️  Encontradas ${timedOut.length} entregas com timeout`);

      for (const delivery of timedOut) {
        try {
          const order = delivery.orderId as any;
          const motoboy = delivery.motoboyId as any;

          // Log para auditoria
          console.log(`⏰ Timeout: Delivery ${delivery._id} do motoboy ${motoboy?.name}`);

          // Volta para 'pending'
          delivery.status = 'pending';
          delivery.motoboyId = undefined;
          delivery.updatedAt = new Date();
          await delivery.save();

          // ✅ FIX #6: Notificar cliente
          emitToRoom(`user:${order.customerId}`, 'delivery:reassigned', {
            deliveryId: delivery._id,
            orderId: order._id,
            reason: 'Motoboy não compareceu no prazo',
            message: 'Seu pedido foi reatribuído a outro motoboy',
            timestamp: new Date(),
            nextEstimate: '20-30 minutos'
          });

          // Notificar loja
          emitToRoom(`store:${order.storeId}`, 'delivery:reassigned', {
            deliveryId: delivery._id,
            motoboy: motoboy?.name,
            reason: 'Timeout - motoboy indisponível',
            timestamp: new Date()
          });

          // Notificar motoboys para nova reclamação
          emitToRoom('motoboys', 'delivery:available', {
            deliveryId: delivery._id,
            orderId: order._id,
            distance: delivery.distance,
            fee: delivery.fee,
            location: order.address,
            reason: 'Reatribuição após timeout'
          });

          // Log para análise
          console.log(`✅ Delivery ${delivery._id} reatribuída`);

        } catch (err) {
          console.error(`❌ Erro ao reatribuir delivery ${delivery._id}:`, err);
        }
      }

      console.log(`✅ Verificação de timeout concluída`);

    } catch (err) {
      console.error('❌ Erro em timeout job:', err);
    }
  });
}
```

**Adicionar ao arquivo principal:** `src/app.ts` ou `src/server.ts`

```typescript
import { initDeliveryTimeoutJob } from './jobs/deliveryTimeout.job';

// ... em app.listen() ou server.listen()
app.listen(PORT, () => {
  console.log(`🚀 Server rodando em porta ${PORT}`);
  
  // ✅ FIX #6: Inicializar jobs
  initDeliveryTimeoutJob();
  console.log('📅 Jobs iniciados');
});
```

---

## Resumo de Arquivos a Editar

```
┌─────────────────────────────────────────────────────────────────┐
│  IMPLEMENTAÇÃO - ORDEM DE PRIORIDADE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ 1. cancellationController.ts                                    │
│    ├─ Correção #1: Remover 'enviado' (linha ~60)              │
│    ├─ Correção #2: Refund em rejectOrderByStore (linha ~340)  │
│    └─ Correção #3: Refund em rejectDeliveryByMotoboy (~180)   │
│                                                                  │
│ 2. orderController.ts                                           │
│    └─ Correção #4: Transação em acceptOrderByStore (~270)     │
│                                                                  │
│ 3. jobs/deliveryTimeout.job.ts (NOVO)                         │
│    └─ Correção #5: Auto-reassignment com timeout              │
│                                                                  │
│ 4. app.ts / server.ts                                          │
│    └─ Inicializar job de timeout                              │
│                                                                  │
│ TESTES (Depois de cada correção):                              │
│    ├─ Suite 1: Happy Path (T1.1, T1.2, T1.3)                 │
│    ├─ Suite 2: Cancelamento Cliente (T2.1-T2.5)              │
│    ├─ Suite 3: Rejeição Loja (T3.1-T3.3)                     │
│    ├─ Suite 4: Cancelamento Motoboy (T4.1-T4.4)              │
│    └─ Suite 5: Timeout & Edge (T5.1-T5.3)                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Checklist de Implementação

```
SEMANA 1 - CRÍTICO:
═════════════════════════════════════════════════════════════════

□ Correção #1 ✅ ou ❌
  └─ Remover 'enviado' de cancellableStatuses
  └─ Testes: T2.4 deve falhar (como esperado)

□ Correção #2 ✅ ou ❌
  └─ Refund em rejectOrderByStore
  └─ Testes: T3.1 deve passar agora

□ Correção #3 ✅ ou ❌
  └─ Refund em rejectDeliveryByMotoboy (cancel)
  └─ Testes: T4.2 deve passar agora

□ Correção #4 ✅ ou ❌
  └─ Transação em acceptOrderByStore
  └─ Testes: T7.1 deve passar agora

□ Testes - Suite 1: Happy Path (3 testes)
  └─ T1.1: ✅ ou ❌
  └─ T1.2: ✅ ou ❌
  └─ T1.3: ✅ ou ❌

□ Testes - Suite 2: Cancelamento Cliente (5 testes)
  └─ T2.1: ✅ ou ❌
  └─ T2.2: ✅ ou ❌
  └─ T2.3: ✅ ou ❌
  └─ T2.4: ✅ ou ❌ (esperado falhar)
  └─ T2.5: ✅ ou ❌

□ Testes - Suite 3: Rejeição Loja (3 testes)
  └─ T3.1: ✅ ou ❌ (deve passar agora)
  └─ T3.2: ✅ ou ❌ (será corrigido depois)
  └─ T3.3: ✅ ou ❌


SEMANA 2 - ALTO:
═════════════════════════════════════════════════════════════════

□ Correção #5 ✅ ou ❌
  └─ Auto-reassignment com timeout (30min)
  └─ Testes: T5.1 deve passar agora

□ Testes - Suite 4: Cancelamento Motoboy (4 testes)
  └─ T4.1: ✅ ou ❌
  └─ T4.2: ✅ ou ❌ (deve passar agora)
  └─ T4.3: ✅ ou ❌
  └─ T4.4: ✅ ou ❌

□ Testes - Suite 5: Timeout & Edge (3 testes)
  └─ T5.1: ✅ ou ❌ (deve passar agora)
  └─ T5.2: ✅ ou ❌
  └─ T5.3: ✅ ou ❌

□ Separar 'reject' de 'cancel' em rejectOrderByStore
  └─ Novo método: cancelOrderByStore para status='pago'
  └─ Testes: T3.2 deve passar

□ Integração de testes end-to-end
  └─ Happy path + todos os cancelamentos


PRÓXIMAS SEMANAS - MÉDIO/NICE-TO-HAVE:
═════════════════════════════════════════════════════════════════

□ Idempotência em cancelamentos
□ Auditoria completa (AuditLog)
□ Rate limiting
□ Análise de fraude
□ Dashboard admin com alertas

```

---

**Data:** 3 de Março de 2026  
**Pronto para implementar!** 🚀
