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

  order.paymentStatus = 'paid';
  order.asaasChargeStatus = asaasStatus === 'CONFIRMED' ? 'confirmed' : 'received';
  await order.save();

  // Espelho da custódia: Payout pending da loja (released na entrega).
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

  // Agora sim a loja é notificada do pedido (pago).
  try {
    emitOrderCreated(order);
  } catch {
    /* socket best-effort */
  }
  logger.info('Pedido confirmado como pago via Asaas', { orderId: order._id, asaasPaymentId });
}

export default { confirmOrderPaidByPayment };
