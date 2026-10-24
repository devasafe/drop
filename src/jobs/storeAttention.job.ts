import { CronJob } from 'cron';
import { prisma } from '../lib/prisma';
import logger from '../config/logger';
import { ATTENTION_WINDOW_DAYS, computeStoreAttention } from '../services/adminAccounts/storeAttention';

/**
 * JOB: "precisa de atenção" da lista de lojas do admin (D3b-4b, spec 8), a cada 10 min e uma vez ao subir.
 * Recalcula:
 *  - as lojas com pedido nos últimos 30 dias (a taxa de cancelamento muda com os pedidos);
 *  - as marcadas (para desmarcar quando o motivo some, inclusive quando os pedidos envelhecem);
 *  - as nunca calculadas (attentionCheckedAt nulo): loja nova, o preenchimento da migration e a troca
 *    do modo de liquidação.
 * Uma loja que falha vai para o log e o ciclo segue; o valor antigo fica até a próxima rodada (spec 9).
 */

const EVERY_10_MIN = '*/10 * * * *';
const DAY_MS = 86_400_000;
let running = false;

export async function storesToRecheck(now: Date = new Date()): Promise<string[]> {
  const since = new Date(now.getTime() - ATTENTION_WINDOW_DAYS * DAY_MS);
  const rows = await prisma.store.findMany({
    where: {
      OR: [
        { needsAttention: true },
        { attentionCheckedAt: null },
        { orders: { some: { createdAt: { gte: since } } } },
      ],
    },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  return rows.map((r) => r.id);
}

export async function runStoreAttentionCycle(now: Date = new Date()): Promise<{ checked: number; failed: number }> {
  const ids = await storesToRecheck(now);
  let failed = 0;
  for (const storeId of ids) {
    try {
      await computeStoreAttention(storeId, undefined, now);
    } catch (err) {
      failed += 1;
      logger.error('[store-attention] falha ao recalcular a loja', err as Error, { storeId });
    }
  }
  return { checked: ids.length - failed, failed };
}

export function startStoreAttentionJob(): CronJob {
  logger.info('[store-attention] job iniciado (executa a cada 10 min)');
  const tick = async () => {
    if (running) return; // ciclo anterior ainda rodando neste processo
    running = true;
    try {
      const { checked, failed } = await runStoreAttentionCycle();
      if (failed > 0) logger.warn('[store-attention] ciclo com falhas', { checked, failed });
    } catch (err) {
      logger.error('[store-attention] erro na execução do job', err as Error);
    } finally {
      running = false;
    }
  };
  const job = new CronJob(EVERY_10_MIN, tick);
  job.start();
  // Primeira rodada ao subir: recalcula com a regra exata as lojas que a migration deixou sem cálculo.
  void tick();
  return job;
}

export default startStoreAttentionJob;
