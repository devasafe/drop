import { CronJob } from 'cron';
import { prisma } from '../lib/prisma';
import logger from '../config/logger';
import { getSaasConfig } from '../utils/settlement';
import { sendTransfer } from '../services/asaasLoja/motoboyTransfer';
import { emitAdminNotification } from '../utils/socketEmitter';

/**
 * JOB: envio e retentativa do Pix da loja ao motoboy no modo SaaS direto (a cada minuto).
 *
 *  - Desligado (`directTransfersEnabled=false`, padrão até o sandbox) → não faz nada.
 *  - `requested` há mais de 10 min → processo morreu no meio da chamada ou o webhook não veio:
 *    vira `uncertain` (NUNCA `failed`, para não reenviar às cegas) e alerta o admin.
 *  - `pending` e `failed` com nextAttemptAt vencido → sendTransfer (claim atômico, teto
 *    diário P10, backoff P5; a 6ª falha vira `failed_final`).
 *  - `uncertain`, `done` e `failed_final` nunca são tocados aqui (R6/R7: só o admin).
 */

export const STUCK_REQUESTED_MS = 10 * 60 * 1000;
const BATCH = 50;

export async function runMotoboyTransfers(now: Date = new Date()): Promise<{ sent: number; failed: number }> {
  if (!(await getSaasConfig()).directTransfersEnabled) return { sent: 0, failed: 0 };

  // 1) Reaper (condicional: só quem obtém count === 1 alerta).
  const stuckBefore = new Date(now.getTime() - STUCK_REQUESTED_MS);
  const stuck = await prisma.motoboyTransfer.findMany({
    where: { status: 'requested', updatedAt: { lt: stuckBefore } },
    select: { id: true, orderId: true, storeId: true },
    take: BATCH,
  });
  for (const t of stuck) {
    const { count } = await prisma.motoboyTransfer.updateMany({
      where: { id: t.id, status: 'requested', updatedAt: { lt: stuckBefore } },
      data: { status: 'uncertain', lastError: 'STUCK_REQUESTED' },
    });
    if (count === 1) {
      logger.error('[motoboyTransfers] transferência presa em requested — NÃO reenviar sem conferir no Asaas', new Error('STUCK_REQUESTED'), { transferId: t.id, storeId: t.storeId });
      emitAdminNotification({
        title: 'Pix ao motoboy sem confirmação',
        body: `Pedido ${String(t.orderId).slice(-6)}: sem retorno do Asaas há mais de 10 min; conferir antes de reenviar.`,
        url: '/admin/transfers',
        tag: `motoboy-transfer-${t.id}`,
      });
    }
  }

  // 2) Envios e retentativas vencidas.
  const due = await prisma.motoboyTransfer.findMany({
    where: { status: { in: ['pending', 'failed'] }, nextAttemptAt: { lte: now } },
    select: { id: true },
    orderBy: { nextAttemptAt: 'asc' },
    take: BATCH,
  });

  let sent = 0;
  let failed = 0;
  for (const t of due) {
    try {
      const result = await sendTransfer(t.id, now);
      if (result === 'requested') sent++;
      else if (result === 'failed' || result === 'failed_final') failed++;
    } catch (err) {
      logger.error('[motoboyTransfers] erro ao enviar transferência', err as Error, { transferId: t.id });
    }
  }

  if (stuck.length > 0 || due.length > 0) {
    logger.info(`[motoboyTransfers] varredura: ${sent} enviada(s), ${failed} falha(s), ${stuck.length} presa(s)`);
  }
  return { sent, failed };
}

export function startMotoboyTransfersJob(): CronJob {
  logger.info('[motoboyTransfers] job iniciado (executa a cada 1 min)');
  const job = new CronJob('* * * * *', async () => {
    try {
      await runMotoboyTransfers();
    } catch (err) {
      logger.error('[motoboyTransfers] erro na execução do job', err as Error);
    }
  });
  job.start();
  return job;
}

export function stopMotoboyTransfersJob(job: CronJob) {
  if (job) {
    job.stop();
    logger.info('[motoboyTransfers] job parado');
  }
}

export default startMotoboyTransfersJob;
