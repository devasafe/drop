import { CronJob } from 'cron';
import { prisma } from '../lib/prisma';
import logger from '../config/logger';
import { getPlatformConfig } from '../repositories/platformConfig.repository';
import { toApiOrder, orderInclude } from '../repositories/order.repository';
import { cancelOrderWithFullRefund } from '../controllers/cancellationController';

/**
 * 🕐 JOB: Timeout de aceite da loja (spec §6.1)
 *
 * Executa a cada 5 minutos.
 * Um pedido JÁ PAGO que a loja não aceita (`acceptedAt=null`) dentro de
 * `storeAcceptTimeoutMin` minutos é auto-cancelado: reembolso 100% ao cliente
 * (sem taxa — a culpa é da loja) + devolução de estoque, reaproveitando a MESMA
 * rotina atômica de `cancelOrderWithFullRefund` usada pelo fluxo manual
 * (Task 7: trava updateMany+count, guard PAYOUT_ALREADY_SETTLED, refund
 * Asaas/legado, cancelamento da entrega em estado terminal).
 *
 * Mira SÓ pedidos `status='pago'` — pedidos `criado` (ainda não pagos) são do
 * `expirePixOrders.job.ts`; misturar os dois filtros duplicaria a ação sobre o
 * mesmo pedido (ex.: um pedido `criado` expirado por PIX não deveria também cair
 * aqui achando que é "loja sem aceite").
 */

const DEFAULT_STORE_ACCEPT_TIMEOUT_MIN = 10;

export interface StoreAcceptTimeoutSummary {
  processed: number;
  cancelled: number;
  failed: number;
}

/** Função testável, separada do agendamento — roda uma varredura e retorna um resumo. */
export async function runStoreAcceptTimeout(): Promise<StoreAcceptTimeoutSummary> {
  const config = await getPlatformConfig();
  const timeoutMin = config?.storeAcceptTimeoutMin ?? DEFAULT_STORE_ACCEPT_TIMEOUT_MIN;
  const cutoff = new Date(Date.now() - timeoutMin * 60000);

  const stale = await prisma.order.findMany({
    where: {
      status: 'pago',
      acceptedAt: null,
      createdAt: { lt: cutoff },
    },
    include: orderInclude,
    take: 100,
  });

  let cancelled = 0;
  let failed = 0;

  for (const raw of stale) {
    try {
      const order = toApiOrder(raw);
      const result = await cancelOrderWithFullRefund(order, {
        reason: 'Loja não aceitou o pedido no prazo',
        reasonCode: 'store_rejected',
        cancelledBy: 'store',
      });

      if (result.ok) {
        cancelled++;
        logger.info('[storeAcceptTimeout] pedido auto-cancelado por timeout de aceite da loja', {
          orderId: order.id,
          refundAmount: result.refundAmount,
          refundStatus: result.refundStatus,
        });
      } else {
        failed++;
        logger.warn('[storeAcceptTimeout] não foi possível cancelar pedido expirado', {
          orderId: order.id,
          error: result.error,
        });
      }
    } catch (err) {
      failed++;
      logger.error('[storeAcceptTimeout] erro ao processar pedido', err as Error, { orderId: raw.id });
    }
  }

  if (stale.length > 0) {
    logger.info(`[storeAcceptTimeout] varredura: ${cancelled} cancelado(s), ${failed} falha(s) de ${stale.length} pedido(s)`);
  }

  return { processed: stale.length, cancelled, failed };
}

/** Agenda `runStoreAcceptTimeout` a cada 5 minutos (mesmo padrão de `deliveryTimeout.job.ts`). */
export function startStoreAcceptTimeoutJob(): CronJob {
  logger.info('[storeAcceptTimeout] job iniciado (executa a cada 5 min)');

  const job = new CronJob('*/5 * * * *', async () => {
    try {
      await runStoreAcceptTimeout();
    } catch (err) {
      logger.error('[storeAcceptTimeout] erro na execução do job', err as Error);
    }
  });

  job.start();
  return job;
}

export function stopStoreAcceptTimeoutJob(job: CronJob) {
  if (job) {
    job.stop();
    logger.info('[storeAcceptTimeout] job parado');
  }
}

export default startStoreAcceptTimeoutJob;
