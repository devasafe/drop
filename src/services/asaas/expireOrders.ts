import env from '../../config/env';
import logger from '../../config/logger';
import Order from '../../models/Order';
import Product from '../../models/Product';
import { cancelCharge } from './payment';

/**
 * Expira pedidos PIX não pagos (Fase 2/A): cliente gerou o PIX mas não pagou.
 *
 * Sem isso, o pedido fica 'pending' segurando estoque pra sempre. Aqui, passado
 * PIX_EXPIRATION_MINUTES, tentamos EXCLUIR a cobrança no Asaas:
 *   - excluída (não estava paga) → cancela o pedido + devolve o estoque;
 *   - não excluída (já recebida — corrida com o pagamento) → NÃO mexe; o webhook confirma.
 *
 * Isso elimina a corrida "restaurei estoque e depois pagou": só cancelamos quando
 * garantimos que a cobrança não pode mais ser paga.
 */
export async function expireStalePixOrders(): Promise<number> {
  const minutes = env.PIX_EXPIRATION_MINUTES || 30;
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);

  const stale = await Order.find({
    asaasChargeStatus: 'pending',
    paymentStatus: 'pending',
    status: 'criado',
    createdAt: { $lt: cutoff },
  }).limit(100);

  let expired = 0;
  for (const order of stale) {
    // Garante que a cobrança não pode mais ser paga antes de devolver o estoque.
    if (order.asaasPaymentId) {
      const deleted = await cancelCharge(order.asaasPaymentId).catch(() => false);
      if (!deleted) continue; // já paga ou erro — deixa o webhook resolver
    }

    for (const it of order.products || []) {
      if ((it as any).productId && (it as any).quantity) {
        await Product.findByIdAndUpdate((it as any).productId, { $inc: { quantity: (it as any).quantity } });
      }
    }

    order.status = 'cancelado';
    order.cancelledAt = new Date();
    order.asaasChargeStatus = 'none';
    order.paymentStatus = 'failed';
    await order.save();
    expired++;
    logger.info('Pedido PIX expirado e cancelado (estoque devolvido)', { orderId: order._id });
  }

  if (expired > 0) logger.info(`Expiração PIX: ${expired} pedido(s) cancelado(s)`);
  return expired;
}

export default { expireStalePixOrders };
