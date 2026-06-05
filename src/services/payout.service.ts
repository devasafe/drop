import { ClientSession, Types } from 'mongoose';
import Payout, { IPayout, PayoutRecipientType } from '../models/Payout';
import Wallet from '../models/Wallet';
import AppCashbox from '../models/AppCashbox';
import PlatformConfig from '../models/PlatformConfig';

class PayoutService {
  async createPendingPayout(params: {
    recipientType: PayoutRecipientType;
    recipientId: string;
    orderId: string;
    deliveryId?: string;
    amount: number;
    session?: ClientSession;
  }): Promise<IPayout> {
    const { recipientType, recipientId, orderId, deliveryId, amount, session } = params;

    const [payout] = await Payout.create(
      [
        {
          recipientType,
          recipientId: new Types.ObjectId(recipientId),
          orderId: new Types.ObjectId(orderId),
          deliveryId: deliveryId ? new Types.ObjectId(deliveryId) : undefined,
          amount,
          status: 'pending',
        },
      ],
      { session }
    );

    // Incrementar pendingBalance na wallet do recipient
    const ownerType = recipientType === 'store' ? 'store' : 'motoboy';
    await Wallet.updateOne(
      { owner: recipientId, ownerType },
      { $inc: { pendingBalance: amount } },
      { session }
    );

    return payout;
  }

  async releasePayout(payoutId: string, session?: ClientSession): Promise<void> {
    const payout = await Payout.findById(payoutId).session(session || null);
    if (!payout || payout.status !== 'pending') {
      throw new Error(`Payout ${payoutId} não encontrado ou não está pending`);
    }
    if (payout.blocked) {
      throw new Error(`Payout ${payoutId} está bloqueado: ${payout.blockReason || 'sem motivo'}`);
    }

    payout.status = 'released';
    payout.releasedAt = new Date();
    await payout.save({ session });

    const ownerType = payout.recipientType === 'store' ? 'store' : 'motoboy';
    await Wallet.updateOne(
      { owner: String(payout.recipientId), ownerType },
      { $inc: { pendingBalance: -payout.amount, availableBalance: payout.amount } },
      { session }
    );
  }

  async releasePayoutsForOrder(orderId: string, session?: ClientSession): Promise<void> {
    // Só libera automaticamente se a plataforma estiver configurada pra isso.
    // Caso contrário, payouts ficam pending até o admin aprovar manualmente.
    const config = await PlatformConfig.findOne().session(session || null);
    const autoApprove = config?.autoApprovePayouts === true;
    if (!autoApprove) {
      return; // payouts permanecem pending — admin vai liberar via painel
    }

    const payouts = await Payout.find({
      orderId: new Types.ObjectId(orderId),
      status: 'pending',
      blocked: { $ne: true }, // pula os bloqueados
    }).session(session || null);

    for (const payout of payouts) {
      payout.status = 'released';
      payout.releasedAt = new Date();
      await payout.save({ session });

      const ownerType = payout.recipientType === 'store' ? 'store' : 'motoboy';
      await Wallet.updateOne(
        { owner: String(payout.recipientId), ownerType },
        { $inc: { pendingBalance: -payout.amount, availableBalance: payout.amount } },
        { session }
      );
    }
  }

  async cancelPayoutsForOrder(
    orderId: string,
    reason: string,
    session?: ClientSession
  ): Promise<{ cancelled: number; errors: Array<{ payoutId: string; status: string }> }> {
    const payouts = await Payout.find({
      orderId: new Types.ObjectId(orderId),
      status: { $in: ['pending', 'released', 'requested', 'paid'] },
    }).session(session || null);

    const errors: Array<{ payoutId: string; status: string }> = [];
    let cancelled = 0;

    for (const payout of payouts) {
      if (payout.status === 'requested' || payout.status === 'paid') {
        errors.push({ payoutId: String(payout._id), status: payout.status });
        continue;
      }

      const ownerType = payout.recipientType === 'store' ? 'store' : 'motoboy';

      if (payout.status === 'pending') {
        await Wallet.updateOne(
          { owner: String(payout.recipientId), ownerType },
          { $inc: { pendingBalance: -payout.amount } },
          { session }
        );
      } else if (payout.status === 'released') {
        await Wallet.updateOne(
          { owner: String(payout.recipientId), ownerType },
          { $inc: { availableBalance: -payout.amount } },
          { session }
        );
      }

      payout.status = 'cancelled';
      payout.cancelledAt = new Date();
      payout.cancelReason = reason;
      await payout.save({ session });
      cancelled++;
    }

    return { cancelled, errors };
  }

  async markPayoutsRequested(
    payoutIds: string[],
    withdrawalRequestId: string,
    session?: ClientSession
  ): Promise<void> {
    for (const id of payoutIds) {
      const payout = await Payout.findById(id).session(session || null);
      if (!payout || payout.status !== 'released') {
        throw new Error(`Payout ${id} não está released`);
      }

      payout.status = 'requested';
      payout.requestedAt = new Date();
      payout.withdrawalRequestId = new Types.ObjectId(withdrawalRequestId);
      await payout.save({ session });

      const ownerType = payout.recipientType === 'store' ? 'store' : 'motoboy';
      await Wallet.updateOne(
        { owner: String(payout.recipientId), ownerType },
        { $inc: { availableBalance: -payout.amount } },
        { session }
      );
    }
  }

  async markPayoutsPaid(
    payoutIds: string[],
    gatewayTransferId: string,
    session?: ClientSession,
    options?: { skipCashboxDebit?: boolean }
  ): Promise<number> {
    let totalPaid = 0;

    for (const id of payoutIds) {
      const payout = await Payout.findById(id).session(session || null);
      if (!payout || (payout.status !== 'requested' && payout.status !== 'released')) {
        throw new Error(`Payout ${id} não está em status pagável (released ou requested)`);
      }

      // Se ainda estava released (admin paga sem saque formal), debita availableBalance
      if (payout.status === 'released') {
        const ownerType = payout.recipientType === 'store' ? 'store' : 'motoboy';
        await Wallet.updateOne(
          { owner: String(payout.recipientId), ownerType },
          { $inc: { availableBalance: -payout.amount } },
          { session }
        );
      }

      payout.status = 'paid';
      payout.paidAt = new Date();
      payout.gatewayTransferId = gatewayTransferId;
      await payout.save({ session });
      totalPaid += payout.amount;
    }

    // Transferência interna (loja → user wallet do dono) não debita AppCashbox:
    // o dinheiro continua na plataforma, só mudou de bucket
    if (options?.skipCashboxDebit) {
      return totalPaid;
    }

    // Debitar do AppCashbox — dinheiro saiu da plataforma
    const appCashbox = await AppCashbox.findOne().session(session || null);
    if (appCashbox) {
      appCashbox.balance -= totalPaid;
      appCashbox.totalExpenses += totalPaid;
      appCashbox.history.push({
        type: 'expense',
        source: 'payout_paid',
        amount: totalPaid,
        reason: `Payout de ${payoutIds.length} obrigacao(oes) — gateway transfer: ${gatewayTransferId}`,
        date: new Date(),
      });
      await appCashbox.save({ session });
    }

    return totalPaid;
  }

  async listAvailablePayouts(
    recipientType: PayoutRecipientType,
    recipientId: string
  ): Promise<IPayout[]> {
    return Payout.find({
      recipientType,
      recipientId: new Types.ObjectId(recipientId),
      status: 'released',
    }).sort({ createdAt: 1 });
  }

  async selectPayoutsForAmount(
    recipientType: PayoutRecipientType,
    recipientId: string,
    amount: number
  ): Promise<{ payouts: IPayout[]; total: number } | { error: 'AMOUNT_NOT_EXACT'; available: number }> {
    const available = await this.listAvailablePayouts(recipientType, recipientId);
    const selected: IPayout[] = [];
    let sum = 0;

    for (const p of available) {
      if (sum >= amount) break;
      selected.push(p);
      sum += p.amount;
    }

    // Soma dos payouts inteiros precisa bater exato com o amount
    if (Math.abs(sum - amount) > 0.01) {
      return { error: 'AMOUNT_NOT_EXACT', available: sum };
    }

    return { payouts: selected, total: sum };
  }

  async getPendingObligations(): Promise<number> {
    const result = await Payout.aggregate([
      { $match: { status: { $in: ['pending', 'released', 'requested'] } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return result[0]?.total || 0;
  }

  async listPayouts(filters: {
    status?: string;
    recipientType?: string;
    recipientId?: string;
    orderId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ payouts: IPayout[]; total: number }> {
    const query: any = {};
    if (filters.status) query.status = filters.status;
    if (filters.recipientType) query.recipientType = filters.recipientType;
    if (filters.recipientId) query.recipientId = new Types.ObjectId(filters.recipientId);
    if (filters.orderId) query.orderId = new Types.ObjectId(filters.orderId);

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const [payouts, total] = await Promise.all([
      Payout.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Payout.countDocuments(query),
    ]);

    return { payouts, total };
  }
}

export const payoutService = new PayoutService();
export default payoutService;
