import { CronJob } from 'cron';
import { prisma } from '../lib/prisma';
import logger from '../config/logger';
import { getPlatformConfig } from '../repositories/platformConfig.repository';
import { emitAdminNotification } from '../utils/socketEmitter';
import { notifyStore, STORE_LINKS } from '../services/storeNotify';

/** Padrão quando a configuração não tem o valor (PlatformConfig.returnStoreResponseHours). */
export const DEFAULT_RETURN_STORE_RESPONSE_HOURS = 48;

/**
 * Reembolso de pedido entregue (caso B): pedido aguardando a loja além do prazo de Regras e taxas
 * vai para o admin, uma vez só (`escalatedAt`), e a loja recebe um lembrete. Não decide nada:
 * aprovar ou recusar continua com a loja (ou com o suporte, pelo pedido).
 */
export async function runReturnRequestEscalation(): Promise<{ escalated: number }> {
  const hours = (await getPlatformConfig())?.returnStoreResponseHours ?? DEFAULT_RETURN_STORE_RESPONSE_HOURS;
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const stale = await prisma.returnRequest.findMany({
    where: { status: 'aguardando_loja', escalatedAt: null, createdAt: { lt: cutoff } },
    take: 100,
  });

  let escalated = 0;
  for (const rr of stale) {
    try {
      // Marca primeiro, com trava: duas varreduras simultâneas não avisam duas vezes.
      const { count } = await prisma.returnRequest.updateMany({ where: { id: rr.id, escalatedAt: null }, data: { escalatedAt: new Date() } });
      if (count !== 1) continue;
      const code = rr.orderId.slice(-6).toUpperCase();
      emitAdminNotification({
        title: 'Reembolso sem resposta da loja',
        body: `O pedido #${code} espera a loja há mais de ${hours} h.`,
        url: `/admin/pedidos/${rr.orderId}`,
        tag: 'reembolso',
      });
      void notifyStore(rr.storeId, {
        title: 'Responda o pedido de reembolso',
        message: `O cliente espera a sua resposta sobre o pedido #${code}. O suporte do DROP já foi avisado.`,
        link: STORE_LINKS.order(rr.orderId),
        entityId: rr.orderId,
        tag: 'reembolso',
        dedupe: true,
      });
      escalated++;
    } catch (err) {
      logger.error('[returnRequestEscalation] erro ao escalar', err as Error, { returnRequestId: rr.id });
    }
  }
  if (escalated) logger.info(`[returnRequestEscalation] ${escalated} pedido(s) de reembolso escalado(s) para o admin`);
  return { escalated };
}

/** Varre a cada 30 min. */
export function startReturnRequestEscalationJob(): CronJob {
  logger.info('[returnRequestEscalation] job iniciado (executa a cada 30 min)');
  const job = new CronJob('*/30 * * * *', async () => {
    try {
      await runReturnRequestEscalation();
    } catch (err) {
      logger.error('[returnRequestEscalation] erro na execução do job', err as Error);
    }
  });
  job.start();
  return job;
}
