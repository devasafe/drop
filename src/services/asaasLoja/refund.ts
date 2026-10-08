import { Prisma, DirectRefund } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import asaasClient, { AsaasApiError } from '../asaas/client';
import { AppError } from '../../utils/AppError';
import logger from '../../config/logger';
import { emitToRoom } from '../../utils/socketEmitter';
import { storeKey, translate, StorePaymentsNotReadyError } from './charge';

/**
 * Estorno de pedido no modo SaaS "direto": POST /payments/{id}/refund com a chave da
 * conta Asaas DA LOJA. Sem custódia, sem carteira.
 *
 * Fail closed: resposta incerta (timeout, rede, 5xx) vira 'uncertain' e NUNCA é reenviada
 * às cegas (o Asaas pode ter estornado). Só o admin resolve (ou o webhook PAYMENT_REFUNDED).
 * A chave da loja nunca vai para log, erro ou socket.
 */

export type DirectRefundStatus = 'pending' | 'requested' | 'done' | 'failed' | 'failed_final' | 'uncertain';

export const DIRECT_REFUND_RETRY_MS = 5 * 60 * 1000;

const cents = (v: unknown) => Math.round(Number(v) * 100);

/** Cria (ou devolve) o estorno do pedido direto. Idempotente por pedido. */
export async function requestDirectRefund(params: {
  orderId: string;
  cancellationId: string | null;
  amount: number;
  requestedBy: string;
}): Promise<DirectRefund> {
  const { orderId, cancellationId, amount, requestedBy } = params;

  const existing = await prisma.directRefund.findUnique({ where: { orderId } });
  if (existing) return existing;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, storeId: true, totalValue: true, paymentProvider: true, paymentStatus: true, asaasPaymentId: true },
  });
  if (!order) throw new AppError('Pedido não encontrado', 404, true, 'ORDER_NOT_FOUND');
  if (order.paymentProvider !== 'asaas_loja' || !order.asaasPaymentId) {
    throw new AppError('Pedido não é do modo direto', 400, true, 'REFUND_NOT_DIRECT');
  }
  if (order.paymentStatus !== 'paid') {
    throw new AppError('Pedido não está pago', 400, true, 'REFUND_NOT_PAID');
  }
  if (!Number.isFinite(amount) || cents(amount) <= 0) {
    throw new AppError('Valor do estorno inválido', 400, true, 'REFUND_INVALID_AMOUNT');
  }
  if (cents(amount) > cents(order.totalValue)) {
    throw new AppError('Valor do estorno maior que o total do pedido', 400, true, 'REFUND_AMOUNT_EXCEEDS_TOTAL');
  }

  try {
    return await prisma.directRefund.create({
      data: {
        orderId, cancellationId, storeId: order.storeId, asaasPaymentId: order.asaasPaymentId,
        amount: new Prisma.Decimal(cents(amount)).div(100), requestedBy,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.directRefund.findUnique({ where: { orderId } });
      if (winner) return winner;
    }
    throw err;
  }
}

/** Estorno concluído (api, webhook ou admin). Idempotente: só a primeira chamada devolve true. */
export async function markDirectRefundDone(
  orderId: string,
  source: 'api' | 'webhook' | 'admin',
  note?: string,
): Promise<boolean> {
  const done = await prisma.$transaction(async (tx) => {
    const { count } = await tx.directRefund.updateMany({
      where: { orderId, status: { not: 'done' } },
      data: { status: 'done', doneAt: new Date(), resolvedBy: note ? `${source}:${note}` : source, lastError: null },
    });
    if (count !== 1) return null;
    const row = await tx.directRefund.findUnique({ where: { orderId }, select: { cancellationId: true } });
    if (row?.cancellationId) {
      await tx.cancellation.updateMany({ where: { id: row.cancellationId }, data: { refundStatus: 'processed' } });
    }
    await tx.order.updateMany({ where: { id: orderId }, data: { paymentStatus: 'refunded', asaasChargeStatus: 'refunded' } });
    return true;
  });
  return done === true;
}

function notify(storeId: string, event: 'refund:failed' | 'refund:uncertain', orderId: string, refundId: string, rooms: Array<'store' | 'admin'>) {
  const payload = { refundId, orderId, storeId };
  for (const r of rooms) emitToRoom(r === 'store' ? `store:${storeId}` : 'admin', event, payload);
}

/** Claim atômico + chamada ao Asaas com a chave da loja. */
export async function executeDirectRefund(refundId: string): Promise<DirectRefundStatus> {
  const current = await prisma.directRefund.findUnique({ where: { id: refundId } });
  if (!current) throw new AppError('Estorno não encontrado', 404, true, 'REFUND_NOT_FOUND');

  const { count } = await prisma.directRefund.updateMany({
    where: { id: refundId, status: { in: ['pending', 'failed'] } },
    data: { status: 'requested', attempts: { increment: 1 } },
  });
  if (count !== 1) {
    const now = await prisma.directRefund.findUnique({ where: { id: refundId }, select: { status: true } });
    return (now?.status ?? current.status) as DirectRefundStatus; // outro processo pegou ou já terminou
  }

  const { orderId, storeId, asaasPaymentId } = current;
  const amount = Number(current.amount);

  try {
    const apiKey = await storeKey(storeId); // conta ausente/invalid → StorePaymentsNotReadyError (falha definida, nada enviado)
    try {
      await asaasClient.postAs(apiKey, `/payments/${encodeURIComponent(asaasPaymentId)}/refund`, {
        value: amount,
        description: `Estorno do pedido ${orderId}`,
      });
    } catch (err) {
      throw await translate(storeId, err);
    }
  } catch (err) {
    const definite = err instanceof StorePaymentsNotReadyError
      || (err instanceof AsaasApiError && err.status >= 400 && err.status < 500);
    if (definite) {
      const message = err instanceof AsaasApiError
        ? (err.errors?.[0]?.description || err.message)
        : (err as Error).message;
      await prisma.directRefund.updateMany({
        where: { id: refundId, status: 'requested' },
        data: { status: 'failed', lastError: String(message).slice(0, 500), nextAttemptAt: new Date(Date.now() + DIRECT_REFUND_RETRY_MS) },
      });
      logger.warn('[asaasLoja] estorno direto recusado', { refundId, orderId, storeId, status: (err as any)?.status });
      notify(storeId, 'refund:failed', orderId, refundId, ['store', 'admin']);
      return 'failed';
    }
    await prisma.directRefund.updateMany({
      where: { id: refundId, status: 'requested' },
      data: { status: 'uncertain', lastError: 'UNCERTAIN' },
    });
    logger.error('[asaasLoja] estorno direto com resposta incerta — NÃO reenviar sem conferir no Asaas', err as Error, { refundId, orderId, storeId });
    notify(storeId, 'refund:uncertain', orderId, refundId, ['admin']);
    return 'uncertain';
  }

  try {
    await markDirectRefundDone(orderId, 'api');
  } catch (err) {
    // O Asaas já estornou, mas o banco não registrou: trava em 'uncertain' para o admin conferir.
    await prisma.directRefund.updateMany({ where: { id: refundId, status: 'requested' }, data: { status: 'uncertain', lastError: 'UNCERTAIN' } }).catch(() => undefined);
    logger.error('[asaasLoja] estorno feito no Asaas mas falhou ao registrar', err as Error, { refundId, orderId, storeId });
    notify(storeId, 'refund:uncertain', orderId, refundId, ['admin']);
    return 'uncertain';
  }
  return 'done';
}
