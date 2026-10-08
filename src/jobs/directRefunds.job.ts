import { CronJob } from 'cron';
import { prisma } from '../lib/prisma';
import logger from '../config/logger';
import { executeDirectRefund, notifyDirectRefund } from '../services/asaasLoja/refund';

/**
 * JOB: retentativa e reaper do estorno no modo SaaS direto (a cada minuto).
 *
 *  - `failed` com nextAttemptAt vencido → reexecuta (executeDirectRefund faz o claim atômico e o
 *    backoff P5; a 6ª falha vira `failed_final`).
 *  - `pending` criado há mais de 10 min → órfão (o processo caiu entre gravar e executar):
 *    executa pelo mesmo caminho, com o mesmo claim atômico.
 *  - `requested` há mais de 10 min → processo morreu no meio da chamada: vira `uncertain`
 *    (NUNCA `failed`, para não reenviar às cegas) e alerta o admin.
 *  - `requested` com `acceptedAt` (o Asaas aceitou e o estorno está em andamento) espera o
 *    webhook; só após 24 h sem confirmação vira `uncertain` (ACCEPTED_NOT_CONFIRMED) + alerta.
 *  - `uncertain`, `done` e `failed_final` nunca são tocados aqui.
 */

export const STUCK_REQUESTED_MS = 10 * 60 * 1000;
export const ACCEPTED_REFUND_MAX_MS = 24 * 60 * 60 * 1000;
export const ORPHAN_PENDING_MS = 10 * 60 * 1000;
const BATCH = 50;

export async function runDirectRefunds(now: Date = new Date()): Promise<{ retried: number; finalFailed: number }> {
  // 1) Reaper (condicional: só quem obtém count === 1 alerta).
  const stuckWhere = { status: 'requested', acceptedAt: null, updatedAt: { lt: new Date(now.getTime() - STUCK_REQUESTED_MS) } };
  const acceptedWhere = { status: 'requested', acceptedAt: { lt: new Date(now.getTime() - ACCEPTED_REFUND_MAX_MS) } };
  const stuck = await prisma.directRefund.findMany({
    where: { OR: [stuckWhere, acceptedWhere] },
    select: { id: true, orderId: true, storeId: true, acceptedAt: true },
    take: BATCH,
  });
  for (const r of stuck) {
    const accepted = !!r.acceptedAt;
    const code = accepted ? 'ACCEPTED_NOT_CONFIRMED' : 'STUCK_REQUESTED';
    const { count } = await prisma.directRefund.updateMany({
      where: { id: r.id, ...(accepted ? acceptedWhere : stuckWhere) },
      data: { status: 'uncertain', lastError: code },
    });
    if (count === 1) {
      logger.error('[directRefunds] estorno sem confirmação — NÃO reenviar sem conferir no Asaas', new Error(code), { refundId: r.id, orderId: r.orderId, storeId: r.storeId });
      notifyDirectRefund(r.storeId, 'refund:uncertain', r.orderId, r.id, ['admin']);
    }
  }

  // 2) Retentativas vencidas.
  const due = await prisma.directRefund.findMany({
    where: {
      OR: [
        { status: 'failed', nextAttemptAt: { lte: now } },
        { status: 'pending', createdAt: { lt: new Date(now.getTime() - ORPHAN_PENDING_MS) } },
      ],
    },
    select: { id: true },
    orderBy: { nextAttemptAt: 'asc' },
    take: BATCH,
  });

  let retried = 0;
  let finalFailed = 0;
  for (const r of due) {
    try {
      const before = await prisma.directRefund.findUnique({ where: { id: r.id }, select: { status: true } });
      if (before?.status !== 'failed' && before?.status !== 'pending') continue; // outra execução já pegou
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
