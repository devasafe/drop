import { CronJob } from 'cron';
import { prisma } from '../lib/prisma';
import logger from '../config/logger';
import { executeDirectRefund, notifyDirectRefund } from '../services/asaasLoja/refund';

/**
 * JOB: retentativa e reaper do estorno no modo SaaS direto (a cada minuto).
 *
 *  - `failed` com nextAttemptAt vencido → reexecuta (executeDirectRefund faz o claim atômico e o
 *    backoff P5; a 6ª falha vira `failed_final`).
 *  - `requested` há mais de 10 min → processo morreu no meio da chamada: vira `uncertain`
 *    (NUNCA `failed`, para não reenviar às cegas) e alerta o admin.
 *  - `uncertain`, `done` e `failed_final` nunca são tocados aqui.
 */

export const STUCK_REQUESTED_MS = 10 * 60 * 1000;
const BATCH = 50;

export async function runDirectRefunds(now: Date = new Date()): Promise<{ retried: number; finalFailed: number }> {
  // 1) Reaper (condicional: só quem obtém count === 1 alerta).
  const stuck = await prisma.directRefund.findMany({
    where: { status: 'requested', updatedAt: { lt: new Date(now.getTime() - STUCK_REQUESTED_MS) } },
    select: { id: true, orderId: true, storeId: true },
    take: BATCH,
  });
  for (const r of stuck) {
    const { count } = await prisma.directRefund.updateMany({
      where: { id: r.id, status: 'requested', updatedAt: { lt: new Date(now.getTime() - STUCK_REQUESTED_MS) } },
      data: { status: 'uncertain', lastError: 'STUCK_REQUESTED' },
    });
    if (count === 1) {
      logger.error('[directRefunds] estorno preso em requested — NÃO reenviar sem conferir no Asaas', new Error('STUCK_REQUESTED'), { refundId: r.id, orderId: r.orderId, storeId: r.storeId });
      notifyDirectRefund(r.storeId, 'refund:uncertain', r.orderId, r.id, ['admin']);
    }
  }

  // 2) Retentativas vencidas.
  const due = await prisma.directRefund.findMany({
    where: { status: 'failed', nextAttemptAt: { lte: now } },
    select: { id: true },
    orderBy: { nextAttemptAt: 'asc' },
    take: BATCH,
  });

  let retried = 0;
  let finalFailed = 0;
  for (const r of due) {
    try {
      const before = await prisma.directRefund.findUnique({ where: { id: r.id }, select: { status: true } });
      if (before?.status !== 'failed') continue; // outra execução já pegou
      const result = await executeDirectRefund(r.id);
      retried++;
      if (result === 'failed_final') finalFailed++;
    } catch (err) {
      logger.error('[directRefunds] erro ao reexecutar estorno', err as Error, { refundId: r.id });
    }
  }

  if (stuck.length > 0 || due.length > 0) {
    logger.info(`[directRefunds] varredura: ${retried} reexecutado(s), ${finalFailed} final(is), ${stuck.length} preso(s)`);
  }
  return { retried, finalFailed };
}

export function startDirectRefundsJob(): CronJob {
  logger.info('[directRefunds] job iniciado (executa a cada 1 min)');
  const job = new CronJob('* * * * *', async () => {
    try {
      await runDirectRefunds();
    } catch (err) {
      logger.error('[directRefunds] erro na execução do job', err as Error);
    }
  });
  job.start();
  return job;
}

export function stopDirectRefundsJob(job: CronJob) {
  if (job) {
    job.stop();
    logger.info('[directRefunds] job parado');
  }
}

export default startDirectRefundsJob;
