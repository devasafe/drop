import { prisma } from '../../lib/prisma';
import walletService from '../wallet.prisma.service';
import { emitWalletUpdated } from '../../utils/socketEmitter';
import logger from '../../config/logger';

/**
 * Credita o saldo da carteira quando uma recarga (WalletTopup) é confirmada pelo
 * Asaas (webhook PAYMENT_RECEIVED/CONFIRMED). Idempotente: só credita uma vez
 * (status 'paid' trava reprocesso). Retorna true se creditou agora.
 */
export async function creditWalletTopupByPayment(asaasPaymentId: string): Promise<boolean> {
  if (!asaasPaymentId) return false;
  const topup = await prisma.walletTopup.findUnique({ where: { asaasPaymentId } });
  if (!topup) return false; // não é uma recarga (provavelmente um pedido)
  if (topup.status === 'paid') return false; // já creditado

  // Trava atômica: só o request que mover pending→paid credita.
  const claim = await prisma.walletTopup.updateMany({
    where: { id: topup.id, status: 'pending' },
    data: { status: 'paid' },
  });
  if (claim.count === 0) return false;

  const amount = Number(topup.amount);
  await walletService.credit({
    owner: topup.userId,
    ownerType: 'user',
    amount,
    reason: 'Recarga de saldo',
    category: 'deposit',
    paymentMethod: topup.method as any,
    reference: `TOPUP_${topup.id}`,
  });

  try {
    const wallet = await walletService.getOrCreate(topup.userId, 'user');
    emitWalletUpdated(topup.userId, 'cliente', {
      balance: Number(wallet.balance),
      totalIncome: Number(wallet.totalIncome),
      totalSpent: Number(wallet.totalSpent),
      updatedAt: new Date(),
    });
  } catch (e: any) {
    logger.warn('[walletTopup] falha ao emitir wallet:updated: ' + e?.message);
  }
  return true;
}
