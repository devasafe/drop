import { prisma } from '../../lib/prisma';
import logger from '../../config/logger';
import { toApiOrder, orderInclude } from '../../repositories/order.repository';
import { emitOrderCreated } from '../../utils/socketEmitter';

/**
 * Confirmação de pagamento no modo SaaS "direto" (cobrança na conta Asaas da loja).
 *
 * Diferente da custódia (`finalizeOrderAsPaid`): o dinheiro já está na conta da loja,
 * então NÃO há Payout nem movimento de carteira. Só o pedido muda de estado e a loja/
 * o cliente são avisados.
 *
 * Trava: `updateMany` condicional (loja + provedor + ainda não pago + não cancelado).
 * Só quem obtém count === 1 notifica — webhook e polling concorrentes avisam uma vez.
 */

const PAID_RAW = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];

export async function confirmDirectOrderPaid(storeId: string, paymentId: string, rawStatus?: string | null): Promise<boolean> {
  if (!storeId || !paymentId) return false;
  const raw = String(rawStatus || '').toUpperCase();
  if (raw && !PAID_RAW.includes(raw)) return false;
  const asaasChargeStatus = raw === 'CONFIRMED' ? 'confirmed' : 'received';

  const { count } = await prisma.order.updateMany({
    where: {
      asaasPaymentId: paymentId,
      storeId,
      paymentProvider: 'asaas_loja',
      status: { notIn: ['cancelado', 'rejeitado'] },
      OR: [{ paymentStatus: null }, { paymentStatus: { not: 'paid' } }],
    },
    data: { paymentStatus: 'paid', asaasChargeStatus },
  });

  if (count !== 1) {
    if (count === 0) await explainNoMatch(storeId, paymentId);
    return false;
  }

  const order = await prisma.order.findFirst({
    where: { asaasPaymentId: paymentId, storeId, paymentProvider: 'asaas_loja' },
    include: orderInclude,
  });
  logger.info('[asaasLoja] pedido confirmado como pago (modo direto)', { orderId: order?.id, storeId, paymentId });
  if (order) {
    try {
      emitOrderCreated(toApiOrder(order));
    } catch {
      /* socket best-effort: o estado já está persistido */
    }
  }
  return true;
}

/** Por que nada foi atualizado: só para log (já pago é normal; outra loja é suspeito). */
async function explainNoMatch(storeId: string, paymentId: string): Promise<void> {
  const other = await prisma.order.findFirst({
    where: { asaasPaymentId: paymentId },
    select: { id: true, storeId: true, paymentProvider: true, paymentStatus: true, status: true },
  });
  if (!other) {
    logger.warn('[asaasLoja] pagamento sem pedido correspondente', { storeId, paymentId });
  } else if (other.storeId !== storeId || other.paymentProvider !== 'asaas_loja') {
    logger.warn('[asaasLoja] pagamento de pedido de OUTRA loja/provedor — ignorado', {
      storeId, paymentId, orderId: other.id, orderStoreId: other.storeId, provider: other.paymentProvider,
    });
  } else if (other.status === 'cancelado' || other.status === 'rejeitado') {
    logger.warn('[asaasLoja] pagamento recebido para pedido já cancelado — ignorado', { storeId, paymentId, orderId: other.id });
  }
  // Já pago: idempotente, sem log.
}

/**
 * PAYMENT_REFUNDED na conta da loja: reflete o estorno no pedido (mesmos campos que
 * `markOrderRefunded` da custódia), sem efeito de carteira. Só pedidos da própria loja.
 */
export async function markDirectOrderRefunded(storeId: string, paymentId: string): Promise<boolean> {
  if (!storeId || !paymentId) return false;
  const { count } = await prisma.order.updateMany({
    where: {
      asaasPaymentId: paymentId,
      storeId,
      paymentProvider: 'asaas_loja',
      OR: [{ asaasChargeStatus: null }, { asaasChargeStatus: { not: 'refunded' } }],
    },
    data: { asaasChargeStatus: 'refunded', paymentStatus: 'refunded' },
  });
  if (count === 0) {
    const other = await prisma.order.findFirst({ where: { asaasPaymentId: paymentId }, select: { storeId: true, paymentProvider: true } });
    if (other && (other.storeId !== storeId || other.paymentProvider !== 'asaas_loja')) {
      logger.warn('[asaasLoja] estorno de pedido de OUTRA loja/provedor — ignorado', { storeId, paymentId });
    }
    return false;
  }
  logger.info('[asaasLoja] pedido marcado como estornado (modo direto)', { storeId, paymentId });
  return true;
}
