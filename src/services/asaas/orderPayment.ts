import Order from '../../models/Order';
import payoutService from '../payout.service';
import logger from '../../config/logger';
import { emitOrderCreated } from '../../utils/socketEmitter';

/**
 * Confirma o pagamento de um pedido a partir do webhook do Asaas.
 *
 * Custódia: o dinheiro já está retido na conta-mãe Asaas. Aqui só atualizamos o
 * ESPELHO contábil: pedido vira 'paid' e nasce o Payout pending da loja (a parte
 * do motoboy nasce na entrega). A loja só é notificada agora (pós-pagamento).
 *
 * Idempotente: se o pedido já está pago, não refaz nada.
 */
export async function confirmOrderPaidByPayment(
  asaasPaymentId: string,
  asaasStatus: string
): Promise<void> {
  const order = await Order.findOne({ asaasPaymentId });
  if (!order) {
    logger.warn('Webhook de pagamento sem pedido correspondente', { asaasPaymentId });
    return;
  }
  if (order.paymentStatus === 'paid') return; // idempotente
  // Não ressuscita pedido já cancelado/rejeitado (ex: expirou e a cobrança foi excluída).
  // Obs: se a cobrança foi excluída na expiração, o Asaas nem envia confirmação — este
  // guard é a rede de segurança contra corrida.
  if (order.status === 'cancelado' || order.status === 'rejeitado') {
    logger.warn('Pagamento recebido para pedido já cancelado — ignorado', { orderId: order._id, asaasPaymentId });
    return;
  }

  order.asaasChargeStatus = asaasStatus === 'CONFIRMED' ? 'confirmed' : 'received';
  await finalizeOrderAsPaid(order);
  logger.info('Pedido confirmado como pago via Asaas', { orderId: order._id, asaasPaymentId });
}

/**
 * Núcleo da confirmação: marca pago, cria Payout pending da loja (espelho da
 * custódia, released na entrega) e notifica a loja. Reutilizado pelo webhook e
 * pelo caso "pago 100% com saldo da carteira" (sem PIX).
 */
async function finalizeOrderAsPaid(order: any): Promise<void> {
  order.paymentStatus = 'paid';
  await order.save();

  const storeAmount = order.walletDistribution?.storeAmount || 0;
  if (storeAmount > 0) {
    try {
      await payoutService.createPendingPayout({
        recipientType: 'store',
        recipientId: String(order.storeId),
        orderId: String(order._id),
        amount: storeAmount,
      });
    } catch (err) {
      logger.error('Falha ao criar Payout da loja na confirmação de pagamento', err as Error, { orderId: order._id });
    }
  }

  try {
    emitOrderCreated(order);
  } catch {
    /* socket best-effort */
  }
}

/**
 * Pedido pago 100% com saldo da carteira (sem cobrança PIX). Confirma na hora.
 */
export async function finalizeWalletPaidOrder(orderId: string): Promise<void> {
  const order = await Order.findById(orderId);
  if (!order || order.paymentStatus === 'paid') return;
  if (order.status === 'cancelado' || order.status === 'rejeitado') return;
  order.asaasChargeStatus = 'none';
  await finalizeOrderAsPaid(order);
  logger.info('Pedido pago integralmente com saldo da carteira', { orderId });
}

/**
 * Marca o pedido como estornado a partir do webhook PAYMENT_REFUNDED.
 * Idempotente. O estorno em si pode ter sido iniciado por nós (cancelamento) ou
 * pelo painel do Asaas — aqui só refletimos o estado final.
 */
export async function markOrderRefunded(asaasPaymentId: string): Promise<void> {
  const order = await Order.findOne({ asaasPaymentId });
  if (!order) return;
  if (order.asaasChargeStatus === 'refunded') return; // idempotente
  order.asaasChargeStatus = 'refunded';
  order.paymentStatus = 'refunded';
  await order.save();
  logger.info('Pedido marcado como estornado via Asaas', { orderId: order._id, asaasPaymentId });
}

export default { confirmOrderPaidByPayment, markOrderRefunded, finalizeWalletPaidOrder };
