import { CronJob } from 'cron';
import { OrderStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import notifier from '../services/notifier';
import { emitAdminOrderChanged, emitToRoom } from '../utils/socketEmitter';
import logger from '../config/logger';

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

// Pedido fechado: a corrida não volta ao pool (mesma regra do reassign).
const CLOSED_ORDER_STATUSES = ['entregue', 'cancelado', 'rejeitado'];
// Só estes viram 'aguardando_motoboy'; um 'criado' com entrega legada só devolve a entrega.
const LIVE_ORDER_STATUSES: OrderStatus[] = ['pago', 'aguardando_motoboy', 'enviado'];

/** Uma varredura (separada do agendamento para ser testável, como runPoolTimeout). */
export async function runDeliveryTimeout(): Promise<void> {
  try {
    const now = new Date();
    const timeoutThreshold = new Date(now.getTime() - DELIVERY_TIMEOUT_MINUTES * 60000);

    // Buscar entregas atribuídas há mais de 30 minutos. `orderId` é um id do
    // Postgres — sem `.populate`; o pedido é carregado logo abaixo no loop.
    const timedOutDeliveries = await prisma.delivery.findMany({
      where: {
        status: 'assigned',
        motoboyId: { not: null },
        updatedAt: { lt: timeoutThreshold },
      },
    });

    if (timedOutDeliveries.length === 0) {
      return;
    }

    logger.debug(`🕐 [DELIVERY TIMEOUT] Encontradas ${timedOutDeliveries.length} entregas expiradas`);

    for (const delivery of timedOutDeliveries) {
      try {
        const order: any = await prisma.order.findUnique({ where: { id: String(delivery.orderId) } });
        const motoboyId = delivery.motoboyId;
        if (!order || !motoboyId) continue;

        // Mesma ordem de travas do claim e do cancelamento: pedido (FOR UPDATE) → entrega. Só devolve
        // ao pool a corrida que continua parada: retirada, cancelamento ou pedido encerrado entre a
        // leitura e a escrita vencem o job.
        const won = await prisma.$transaction(async (tx) => {
          const rows = await tx.$queryRaw<{ status: string }[]>`SELECT status::text AS status FROM "Order" WHERE id = ${order.id} FOR UPDATE`;
          if (!rows.length || CLOSED_ORDER_STATUSES.includes(rows[0].status)) return false;
          const { count } = await tx.delivery.updateMany({
            where: { id: delivery.id, status: 'assigned', motoboyId, updatedAt: { lt: timeoutThreshold } },
            data: {
              status: 'pending', motoboyId: null, assignedAt: null, createdAt: new Date(),
              pin: null, pinRetirada: null, pinDevolucao: null, pinFailedAttempts: 0, pinLockedUntil: null,
            },
          });
          if (count !== 1) return false;
          await tx.order.updateMany({
            where: { id: order.id, status: { in: LIVE_ORDER_STATUSES } },
            data: { status: 'aguardando_motoboy' },
          });
          return true;
        });
        if (!won) continue;

        logger.debug(`🔄 [DELIVERY TIMEOUT] Reatribuída delivery ${delivery.id} (motoboy: ${motoboyId})`);

        // D3b-1: a corrida voltou ao pool; a Operação ao vivo relê a lista.
        emitAdminOrderChanged(String(order.id), 'aguardando_motoboy');

        // 📬 Notificar CLIENTE que motoboy não compareceu
        if (order && order.customerId) {
          emitToRoom(`user:${order.customerId}`, 'delivery:reassigned_timeout', {
            orderId: order.id,
            deliveryId: delivery.id,
            reason: 'Motoboy não compareceu no tempo estimado',
            message: '⏰ Seu motoboy não compareceu. Procurando outro entregador...',
            timestamp: new Date().toISOString()
          });
          logger.debug(`📬 [DELIVERY TIMEOUT] Cliente ${order.customerId} notificado`);
        }

        // 📬 Notificar LOJA sobre reatribuição
        if (order && order.storeId) {
          emitToRoom(`store:${order.storeId}`, 'delivery:reassigned_timeout', {
            orderId: order.id,
            deliveryId: delivery.id,
            reason: 'Motoboy não compareceu',
            message: '⏰ Motoboy não compareceu. Aguardando novo entregador.',
            timestamp: new Date().toISOString()
          });
          logger.debug(`📬 [DELIVERY TIMEOUT] Loja ${order.storeId} notificada`);
        }

        // 🔔 Notificar MOTOBOY que foi desatribuído (para logs)
        if (motoboyId) {
          emitToRoom(`user:${motoboyId}`, 'delivery:you_were_reassigned', {
            deliveryId: delivery.id,
            reason: 'Não comparecimento dentro do prazo',
            message: 'Você foi desatribuído desta entrega por não comparecer no prazo'
          });
          logger.debug(`🔔 [DELIVERY TIMEOUT] Motoboy ${motoboyId} notificado de desatribuição`);
        }

        // 📱 Notificar motoboys que nova delivery está disponível
        try {
          notifier.notifyMotoboys({
            type: 'new_delivery',
            delivery: {
              id: delivery.id,
              orderId: order.id,
              fee: delivery.fee,
              distance: delivery.distance
            }
          });
          logger.debug(`📱 [DELIVERY TIMEOUT] Motoboys notificados de nova entrega disponível`);
        } catch (e) {
          logger.warn('[DELIVERY TIMEOUT] Erro ao notificar motoboys', { deliveryId: delivery.id, error: String(e) });
        }

      } catch (error) {
        logger.error('[DELIVERY TIMEOUT] Erro ao processar delivery', error as Error, { deliveryId: delivery.id });
      }
    }

  } catch (error) {
    logger.error('[DELIVERY TIMEOUT JOB] Erro', error as Error);
  }
}

export function startDeliveryTimeoutJob() {
  logger.debug('🕐 [DELIVERY TIMEOUT JOB] Iniciada (executa a cada 5 min)');

  const job = new CronJob('*/5 * * * *', runDeliveryTimeout);

  job.start();
  return job;
}

export function stopDeliveryTimeoutJob(job: CronJob) {
  if (job) {
    job.stop();
    logger.debug('🛑 [DELIVERY TIMEOUT JOB] Parada');
  }
}
