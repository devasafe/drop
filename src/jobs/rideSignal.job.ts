import { CronJob } from 'cron';
import { prisma } from '../lib/prisma';
import logger from '../config/logger';
import { emitAdminNotification, emitAdminOrderChanged } from '../utils/socketEmitter';
import { shortOrderId } from '../services/adminOps/common';

/**
 * JOB antifraude: "sinal perdido" durante a corrida, a cada minuto.
 *
 * Corrida aceita ou retirada (assigned/picked) cujo motoboy não manda posição há mais de
 * SIGNAL_LOST_MIN minutos vira alerta para o admin (push + sino), com nome e telefone do
 * pedido e etapa; telefone, cliente e última posição ficam na tela do pedido (permissão de operação). Um alerta por perda: a marca
 * `Delivery.signalLostAt` some quando a posição volta (relayRideLocation, que avisa "voltou").
 *
 * A posição da corrida é o ponto do caminho (DeliveryTrackPoint), gravado tanto pelo app
 * Android quanto pelo site. Pontos com mais de TRACK_RETENTION_DAYS dias são apagados aqui.
 */

export const SIGNAL_LOST_MIN = 3;
export const TRACK_RETENTION_DAYS = 180;
const EVERY_MINUTE = '* * * * *';
const MIN_MS = 60_000;
const DAY_MS = 86_400_000;
let running = false;
let lastPurge = 0;

export async function checkRideSignals(now: Date = new Date()): Promise<string[]> {
  const cutoff = new Date(now.getTime() - SIGNAL_LOST_MIN * MIN_MS);
  const rides = await prisma.delivery.findMany({
    where: { status: { in: ['assigned', 'picked'] }, signalLostAt: null, motoboyId: { not: null }, assignedAt: { lt: cutoff } },
    select: { id: true, orderId: true, motoboyId: true, status: true },
  });

  const alerted: string[] = [];
  for (const ride of rides) {
    const last = await prisma.deliveryTrackPoint.findFirst({
      where: { deliveryId: ride.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (last && last.createdAt >= cutoff) continue;

    // Marca antes de avisar: outro processo (ou a próxima rodada) não repete o alerta.
    const marked = await prisma.delivery.updateMany({ where: { id: ride.id, signalLostAt: null }, data: { signalLostAt: now } });
    if (marked.count === 0) continue;
    alerted.push(ride.id);

    // Aviso mínimo: vai para toda a equipe (sino e push). Telefone do motoboy, cliente e posição
    // ficam na tela do pedido, que confere a permissão de operação.
    const minutes = last ? Math.round((now.getTime() - last.createdAt.getTime()) / MIN_MS) : null;
    const etapa = ride.status === 'picked' ? 'com o produto' : 'indo à loja';
    const body = `Pedido #${shortOrderId(ride.orderId)}: o motoboy parou de mandar a posição`
      + `${minutes !== null ? ` há ${minutes} min` : ''}, ${etapa}. Abra o pedido para ligar para ele.`;
    emitAdminNotification({ title: 'Sinal perdido numa entrega', body, url: `/admin/pedidos/${ride.orderId}`, tag: `sinal-${ride.id}` });
    emitAdminOrderChanged(ride.orderId, 'signal_lost');
    logger.warn('[ride-signal] sinal perdido', { deliveryId: ride.id, motoboyId: ride.motoboyId, minutes });
  }
  return alerted;
}

/** Apaga os pontos de caminho mais velhos que a retenção (uma vez por hora). */
export async function purgeOldTrackPoints(now: Date = new Date()): Promise<number> {
  const r = await prisma.deliveryTrackPoint.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - TRACK_RETENTION_DAYS * DAY_MS) } } });
  return r.count;
}

export function startRideSignalJob(): CronJob {
  logger.info('[ride-signal] job iniciado (executa a cada minuto)');
  const job = new CronJob(EVERY_MINUTE, async () => {
    if (running) return;
    running = true;
    try {
      await checkRideSignals();
      if (Date.now() - lastPurge > 60 * MIN_MS) {
        lastPurge = Date.now();
        await purgeOldTrackPoints();
      }
    } catch (err) {
      logger.error('[ride-signal] erro na execução do job', err as Error);
    } finally {
      running = false;
    }
  });
  job.start();
  return job;
}
