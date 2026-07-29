import { CronJob } from 'cron';
import { prisma } from '../lib/prisma';
import logger from '../config/logger';
import { getPlatformConfig } from '../repositories/platformConfig.repository';
import { toApiOrder, orderInclude } from '../repositories/order.repository';
import { emitToRoom } from '../utils/socketEmitter';

/**
 * 🕐 JOB: Timeout do pool de entregas (spec §6.1)
 *
 * Executa a cada 5 minutos.
 * Quando NINGUÉM pega uma entrega do pool (`Delivery.status='pending'` e
 * `motoboyId=null`) dentro de `poolTimeoutMin` minutos, este job NÃO cancela o
 * pedido sozinho — ele apenas MARCA `Order.awaitingCustomerPoolDecision=true` e
 * emite `order:pool_timeout` pro cliente, que decide via
 * `POST /orders/:id/pool-timeout` entre "seguir tentando" (continua no pool) ou
 * "cancelar" (refund 100%, reaproveitando `cancelOrderWithFullRefund`).
 *
 * Campo de tempo: usamos `Delivery.createdAt`, não `updatedAt`. O registro de
 * `Delivery` é criado UMA vez quando o pedido entra no pool (ver
 * `orderController.acceptOrder` — `prisma.delivery.create({ status: 'pending' }
 * )` no momento em que a loja aceita), então `createdAt` é exatamente "há quanto
 * tempo está no pool sem motoboy". `updatedAt` seria frágil: qualquer toque
 * incidental no registro (ex.: alguém regravando `storeAddress`/coordenadas antes
 * de um motoboy assumir) resetaria o relógio sem que a entrega tenha de fato
 * "voltado" ao pool.
 *
 * Idempotência: pedidos que já têm `awaitingCustomerPoolDecision=true` são
 * PULADOS (nem re-gravam, nem re-emitem) — a decisão já está com o cliente, e
 * essa função varre a cada 5min, então evitar o re-emit evita "spammar" o
 * cliente com o mesmo evento repetidas vezes enquanto ele não decide.
 */

const DEFAULT_POOL_TIMEOUT_MIN = 15;

export interface PoolTimeoutSummary {
  processed: number;
  flagged: number;
}

/** Função testável, separada do agendamento — roda uma varredura e retorna um resumo. */
export async function runPoolTimeout(): Promise<PoolTimeoutSummary> {
  const config = await getPlatformConfig();
  const timeoutMin = config?.poolTimeoutMin ?? DEFAULT_POOL_TIMEOUT_MIN;
  const cutoff = new Date(Date.now() - timeoutMin * 60000);

  const staleDeliveries = await prisma.delivery.findMany({
    where: {
      status: 'pending',
      motoboyId: null,
      createdAt: { lt: cutoff },
    },
    take: 100,
  });

  let flagged = 0;

  for (const delivery of staleDeliveries) {
    try {
      const raw = await prisma.order.findUnique({ where: { id: delivery.orderId }, include: orderInclude });
      if (!raw) continue;
      const order = toApiOrder(raw);

      // Já aguardando decisão do cliente — não re-emite (idempotente, sem spam).
      if (order.awaitingCustomerPoolDecision) continue;

      await prisma.order.update({
        where: { id: order.id },
        data: { awaitingCustomerPoolDecision: true },
      });

      emitToRoom(`user:${order.customerId}`, 'order:pool_timeout', {
        orderId: order.id,
        deliveryId: delivery.id,
        message: 'Nenhum entregador aceitou sua entrega ainda. Deseja continuar tentando ou cancelar?',
      });

      flagged++;
      logger.info('[poolTimeout] pedido marcado aguardando decisão do cliente (pool sem motoboy)', {
        orderId: order.id,
        deliveryId: delivery.id,
      });
    } catch (err) {
      logger.error('[poolTimeout] erro ao processar entrega', err as Error, { deliveryId: delivery.id, orderId: delivery.orderId });
    }
  }

  if (staleDeliveries.length > 0) {
    logger.info(`[poolTimeout] varredura: ${flagged} pedido(s) marcado(s) de ${staleDeliveries.length} entrega(s) sem motoboy`);
  }

  return { processed: staleDeliveries.length, flagged };
}

/** Agenda `runPoolTimeout` a cada 5 minutos (mesmo padrão de `storeAcceptTimeout.job.ts`). */
export function startPoolTimeoutJob(): CronJob {
  logger.info('[poolTimeout] job iniciado (executa a cada 5 min)');

  const job = new CronJob('*/5 * * * *', async () => {
    try {
      await runPoolTimeout();
    } catch (err) {
      logger.error('[poolTimeout] erro na execução do job', err as Error);
    }
  });

  job.start();
  return job;
}

export function stopPoolTimeoutJob(job: CronJob) {
  if (job) {
    job.stop();
    logger.info('[poolTimeout] job parado');
  }
}

export default startPoolTimeoutJob;
