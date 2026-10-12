import { CronJob } from 'cron';
import { prisma } from '../lib/prisma';
import logger from '../config/logger';
import { getPlatformConfig } from '../repositories/platformConfig.repository';
import { toApiOrder, orderInclude } from '../repositories/order.repository';
import { cancelOrderWithFullRefund } from '../controllers/cancellationController';
import { acceptDeadline, storeAcceptTimeoutMin } from '../utils/acceptDeadline';

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
 * Quem entra: pagamento confirmado (`paymentStatus='paid'`), sem aceite
 * (`acceptedAt=null`) e ainda pré-aceite (`status` 'criado' ou 'pago'). No fluxo
 * real o pagamento só muda `paymentStatus` — o pedido pago continua `criado` até a
 * loja aceitar (`acceptOrderByStore` grava `status='pago'` + `acceptedAt` juntos).
 * Filtrar por `status='pago'` (versão antiga) nunca pegava esse pedido. 'pago' sem
 * `acceptedAt` fica no filtro só por segurança (dado legado).
 *
 * Sem overlap com `expirePixOrders.job.ts`: aquele só toca `paymentStatus='pending'`
 * (não pago); este só `paymentStatus='paid'`. Cancelados, rejeitados, entregues e os
 * já aceitos (`aguardando_motoboy`/`enviado`, com `acceptedAt`) ficam fora. A trava
 * `updateMany` de `cancelOrderWithFullRefund` impede reembolso duplo entre rodadas.
 *
 * Prazo: conta de `paidAt` (gravado na confirmação do pagamento), para a loja ter
 * sempre `storeAcceptTimeoutMin` inteiros mesmo com PIX pago perto do fim da validade.
 * Pedidos anteriores à coluna (`paidAt` nulo) usam `createdAt`.
 */

export interface StoreAcceptTimeoutSummary {
  processed: number;
  cancelled: number;
  failed: number;
}

/** Função testável, separada do agendamento — roda uma varredura e retorna um resumo. */
export async function runStoreAcceptTimeout(): Promise<StoreAcceptTimeoutSummary> {
  const config = await getPlatformConfig();
  const timeoutMin = storeAcceptTimeoutMin(config);
  const now = new Date();
  // `paidAt < cutoff` <=> acceptDeadline(pedido) < now: a query e o painel usam o mesmo relógio.
  const cutoff = new Date(now.getTime() - timeoutMin * 60000);

  const stale = await prisma.order.findMany({
    where: {
      paymentStatus: 'paid',
      acceptedAt: null,
      status: { in: ['criado', 'pago'] },
      // Prazo conta do pagamento; pedido antigo sem paidAt (antes da coluna) usa createdAt.
      OR: [
        { paidAt: { lt: cutoff } },
        { paidAt: null, createdAt: { lt: cutoff } },
      ],
    },
    include: orderInclude,
    // Mais antigos primeiro: com mais de 100 vencidos, nenhum fica para trás para sempre.
    orderBy: { createdAt: 'asc' },
    take: 100,
  });

  let cancelled = 0;
  let failed = 0;

  for (const raw of stale) {
    // Defesa: o prazo que o painel mostra (acceptDeadline) é quem manda. Equivalente ao `where`
    // acima, então não muda o comportamento; só impede que os dois relógios se separem.
    if (acceptDeadline(raw, timeoutMin).getTime() >= now.getTime()) continue;
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
