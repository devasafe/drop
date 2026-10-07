import { prisma } from '../lib/prisma';
import logger from '../config/logger';
import walletService from './wallet.prisma.service';

/**
 * Compensa um pedido órfão cuja cobrança (PIX ou cartão) falhou: devolve o
 * estoque decrementado, estorna o saldo de carteira já debitado (se houver) e
 * apaga o pedido inútil. Reutilizado pelo ramo PIX, pelo ramo cartão e pelo
 * modo SaaS direto (asaas_loja).
 */
export async function compensateFailedOrder(orderId: string, items: any[], walletApplied: number, customerId: string) {
  try {
    for (const it of items) {
      if (it?.productId && it?.quantity) {
        await prisma.product.updateMany({ where: { id: String(it.productId) }, data: { quantity: { increment: it.quantity } } });
      }
    }
    if (walletApplied > 0) {
      await walletService.credit({ owner: customerId, ownerType: 'user', amount: walletApplied, reason: 'Estorno de saldo — cobrança falhou', category: 'refund', relatedId: orderId });
    }
    await prisma.order.delete({ where: { id: orderId } });
  } catch (compErr) {
    logger.error('Falha ao compensar pedido após erro de cobrança', compErr as Error, { orderId });
  }
}
