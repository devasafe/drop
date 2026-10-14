import { prisma } from '../lib/prisma';
import logger from '../config/logger';

/**
 * Compensação que o motoboy recebeu pelo cancelamento desta corrida (spec D2 5.1, item 4).
 * Só lê o que o cancelamento já gravou, nunca recalcula:
 *  - custódia: Payouts do motoboy com este deliveryId e status diferente de 'cancelled'
 *    (numa corrida cancelada, o único repasse ao motoboy é a compensação);
 *  - direto: a MotoboyTransfer da corrida com reason 'cancellation_compensation'.
 * Soma em centavos. `null` = não houve compensação.
 */
export async function motoboyCancellationCompensation(
  deliveryId: string,
  motoboyId: string | null | undefined,
): Promise<number | null> {
  if (!deliveryId || !motoboyId) return null;
  const [payouts, transfer] = await Promise.all([
    prisma.payout.findMany({
      where: { recipientType: 'motoboy', recipientId: String(motoboyId), deliveryId: String(deliveryId), status: { not: 'cancelled' } },
      select: { amount: true },
    }),
    prisma.motoboyTransfer.findUnique({
      where: { deliveryId: String(deliveryId) },
      select: { reason: true, amount: true, motoboyId: true },
    }),
  ]);
  let cents = payouts.reduce((s, p) => s + Math.round(Number(p.amount) * 100), 0);
  if (transfer && transfer.reason === 'cancellation_compensation' && transfer.motoboyId === String(motoboyId)) {
    cents += Math.round(Number(transfer.amount) * 100);
  }
  return cents > 0 ? cents / 100 : null;
}

/** Para o evento de socket: o cancelamento já foi gravado, então uma falha aqui vira null (e log). */
export async function motoboyCancellationCompensationSafe(
  deliveryId: string,
  motoboyId: string | null | undefined,
): Promise<number | null> {
  try {
    return await motoboyCancellationCompensation(deliveryId, motoboyId);
  } catch (err) {
    logger.error('[motoboyCompensation] falha ao ler a compensação para o aviso de cancelamento', err as Error, { deliveryId });
    return null;
  }
}
