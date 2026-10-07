import env from '../../config/env';
import logger from '../../config/logger';
import { prisma } from '../../lib/prisma';
import { orderInclude } from '../../repositories/order.repository';
import { cancelCharge } from './payment';
import { AsaasLojaProvider } from '../paymentProvider/asaasLojaProvider';
import { getStorePaymentStatus } from '../asaasLoja/charge';
import { confirmDirectOrderPaid } from '../asaasLoja/orderPaymentDirect';

const PAID_RAW = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];

/**
 * Modo direto (paymentProvider 'asaas_loja'): exclui a cobrança com a chave DA LOJA.
 * Se não excluir, pode ser corrida com o pagamento: consulta o status pela chave da loja e,
 * se já pago, confirma o pedido (sem custódia). Em qualquer caso devolve false (não expira).
 */
async function cancelDirectCharge(order: { id: string; storeId: string; asaasPaymentId: string | null }): Promise<boolean> {
  if (!order.asaasPaymentId) {
    // Sem id não há como garantir que a cobrança não será paga: não expira (reconciliação manual).
    logger.warn('[expirePixOrders] pedido do modo direto sem asaasPaymentId — não expirado', { orderId: order.id });
    return false;
  }
  const deleted = await new AsaasLojaProvider().cancelCharge(order.asaasPaymentId).catch(() => false);
  if (deleted) return true;
  try {
    const raw = await getStorePaymentStatus(order.storeId, order.asaasPaymentId);
    if (raw && PAID_RAW.includes(String(raw).toUpperCase())) {
      await confirmDirectOrderPaid(order.storeId, order.asaasPaymentId, raw);
    }
  } catch (err) {
    logger.warn('[expirePixOrders] não foi possível consultar a cobrança do modo direto', {
      orderId: order.id, errName: (err as Error)?.name,
    });
  }
  return false;
}

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
export async function expireStalePixOrders(opts: { onlyDirect?: boolean } = {}): Promise<number> {
  const minutes = env.PIX_EXPIRATION_MINUTES || 30;
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);

  const stale = await prisma.order.findMany({
    where: {
      asaasChargeStatus: 'pending',
      paymentStatus: 'pending',
      status: 'criado',
      createdAt: { lt: cutoff },
      ...(opts.onlyDirect ? { paymentProvider: 'asaas_loja' as const } : {}),
    },
    include: orderInclude,
    // Mais antigos primeiro: com mais de 100 vencidos, nenhum fica para trás para sempre.
    orderBy: { createdAt: 'asc' },
    take: 100,
  });

  let expired = 0;
  for (const order of stale) {
    // Garante que a cobrança não pode mais ser paga antes de devolver o estoque.
    // Cada provedor exclui na conta onde a cobrança nasceu (conta-mãe x conta da loja).
    if (order.paymentProvider === 'asaas_loja') {
      if (!(await cancelDirectCharge(order))) continue;
    } else if (order.asaasPaymentId) {
      const deleted = await cancelCharge(order.asaasPaymentId).catch(() => false);
      if (!deleted) continue; // já paga ou erro — deixa o webhook resolver
    }

    // Trava condicional (princípio 2): entre o findMany e aqui o pedido pode ter sido
    // cancelado pelo cliente/loja (que já devolveu o estoque) ou pago. Só quem ainda o
    // encontra 'criado' + 'pending' cancela e devolve o estoque — uma única vez.
    const claim = await prisma.order.updateMany({
      where: { id: order.id, status: 'criado', paymentStatus: 'pending' },
      data: { status: 'cancelado', cancelledAt: new Date(), asaasChargeStatus: 'none', paymentStatus: 'failed' },
    });
    if (claim.count !== 1) {
      logger.info('[expirePixOrders] pedido mudou durante a varredura — não expirado', { orderId: order.id });
      continue;
    }

    for (const it of order.items || []) {
      if (it.productId && it.quantity) {
        await prisma.product.updateMany({ where: { id: String(it.productId) }, data: { quantity: { increment: it.quantity } } });
      }
    }
    expired++;
    logger.info('Pedido PIX expirado e cancelado (estoque devolvido)', { orderId: order.id });
  }

  if (expired > 0) logger.info(`Expiração PIX: ${expired} pedido(s) cancelado(s)`);
  return expired;
}

export default { expireStalePixOrders };
