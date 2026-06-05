import { CronJob } from 'cron';
import Delivery from '../models/Delivery';
import Order from '../models/Order';
import notifier from '../services/notifier';
import { emitDeliveryRejected, emitToRoom } from '../utils/socketEmitter';

/**
 * 🕐 JOB: Reassignação Automática de Entregas Não Aceitas
 * 
 * Executa a cada 5 minutos
 * Se uma delivery está 'pending' há mais de 30 minutos, volta para reatribuição
 * 
 * Problema que resolve:
 * - Motoboy aceita delivery, mas não vai buscar/cancela
 * - Cliente fica esperando indefinidamente
 * 
 * Solução:
 * - Após 30min, motoboy é desatribuído
 * - Delivery volta para 'pending' para outro motoboy
 * - Cliente recebe notificação de reatribuição
 */

// Intervalo de timeout em minutos (30 min)
const DELIVERY_TIMEOUT_MINUTES = 30;

export function startDeliveryTimeoutJob() {
  console.log('🕐 [DELIVERY TIMEOUT JOB] Iniciada (executa a cada 5 min)');

  const job = new CronJob('*/5 * * * *', async () => {
    try {
      const now = new Date();
      const timeoutThreshold = new Date(now.getTime() - DELIVERY_TIMEOUT_MINUTES * 60000);

      // Buscar entregas atribuídas há mais de 30 minutos
      const timedOutDeliveries = await Delivery.find({
        status: 'assigned',
        motoboyId: { $exists: true },
        updatedAt: { $lt: timeoutThreshold }
      }).populate('orderId');

      if (timedOutDeliveries.length === 0) {
        return;
      }

      console.log(`🕐 [DELIVERY TIMEOUT] Encontradas ${timedOutDeliveries.length} entregas expiradas`);

      for (const delivery of timedOutDeliveries) {
        try {
          const order = delivery.orderId as any;
          const motoboyId = delivery.motoboyId;

          console.log(`🔄 [DELIVERY TIMEOUT] Reatribuindo delivery ${delivery._id} (motoboy: ${motoboyId})`);

          // Volta delivery para 'pending'
          delivery.status = 'pending';
          delivery.motoboyId = undefined;
          delivery.pin = undefined; // Gerar novo PIN na próxima atribuição
          delivery.pinRetirada = undefined;
          delivery.updatedAt = new Date();
          await delivery.save();

          // Atualiza status do pedido para "aguardando_motoboy"
          if (order) {
            order.status = 'aguardando_motoboy';
            await order.save();
          }

          // 📬 Notificar CLIENTE que motoboy não compareceu
          if (order && order.customerId) {
            emitToRoom(`user:${order.customerId}`, 'delivery:reassigned_timeout', {
              orderId: order._id.toString(),
              deliveryId: delivery._id.toString(),
              reason: 'Motoboy não compareceu no tempo estimado',
              message: '⏰ Seu motoboy não compareceu. Procurando outro entregador...',
              timestamp: new Date().toISOString()
            });
            console.log(`📬 [DELIVERY TIMEOUT] Cliente ${order.customerId} notificado`);
          }

          // 📬 Notificar LOJA sobre reatribuição
          if (order && order.storeId) {
            emitToRoom(`store:${order.storeId}`, 'delivery:reassigned_timeout', {
              orderId: order._id.toString(),
              deliveryId: delivery._id.toString(),
              reason: 'Motoboy não compareceu',
              message: '⏰ Motoboy não compareceu. Aguardando novo entregador.',
              timestamp: new Date().toISOString()
            });
            console.log(`📬 [DELIVERY TIMEOUT] Loja ${order.storeId} notificada`);
          }

          // 🔔 Notificar MOTOBOY que foi desatribuído (para logs)
          if (motoboyId) {
            emitToRoom(`user:${motoboyId}`, 'delivery:you_were_reassigned', {
              deliveryId: delivery._id.toString(),
              reason: 'Não comparecimento dentro do prazo',
              message: 'Você foi desatribuído desta entrega por não comparecer no prazo'
            });
            console.log(`🔔 [DELIVERY TIMEOUT] Motoboy ${motoboyId} notificado de desatribuição`);
          }

          // 📱 Notificar motoboys que nova delivery está disponível
          try {
            notifier.notifyMotoboys({
              type: 'new_delivery',
              delivery: {
                id: delivery._id.toString(),
                orderId: order._id.toString(),
                fee: delivery.fee,
                distance: delivery.distance
              }
            });
            console.log(`📱 [DELIVERY TIMEOUT] Motoboys notificados de nova entrega disponível`);
          } catch (e) {
            console.warn(`⚠️ [DELIVERY TIMEOUT] Erro ao notificar motoboys:`, e);
          }

        } catch (error) {
          console.error(`❌ [DELIVERY TIMEOUT] Erro ao processar delivery ${delivery._id}:`, error);
        }
      }

    } catch (error) {
      console.error('❌ [DELIVERY TIMEOUT JOB] Erro:', error);
    }
  });

  job.start();
  return job;
}

export function stopDeliveryTimeoutJob(job: CronJob) {
  if (job) {
    job.stop();
    console.log('🛑 [DELIVERY TIMEOUT JOB] Parada');
  }
}
