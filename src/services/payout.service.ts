import { Payout, Prisma, PayoutRecipientType, OwnerType } from '@prisma/client';
import { prisma } from '../lib/prisma';

export type { PayoutRecipientType };

/**
 * PayoutService sobre PostgreSQL/Prisma — Fase 4, Fatia 5 (financeiro).
 *
 * Payout, Wallet e AppCashbox agora vivem no Postgres; as operações que os mexem
 * juntos rodam numa mesma `prisma.$transaction`. Cada método aceita um
 * `tx?: Prisma.TransactionClient` opcional: quando o chamador já abriu uma
 * transação, tudo participa dela; senão o próprio método abre uma.
 *
 * Buckets de saldo (`pendingBalance`/`availableBalance`) acompanham a máquina de
 * estados do Payout e NÃO entram no ledger `WalletEntry` — o ledger espelha só
 * `balance` (dinheiro creditado de fato).
 */

type Tx = Prisma.TransactionClient;

function num(v: Prisma.Decimal | number): number {
  return typeof v === 'number' ? v : v.toNumber();
}

/** Executa `fn` na transação recebida, ou abre uma nova se não houver. */
function withTx<T>(tx: Tx | undefined, fn: (db: Tx) => Promise<T>): Promise<T> {
  return tx ? fn(tx) : prisma.$transaction(fn);
}

/** Garante a carteira do recebedor e aplica um delta nos buckets de saldo. */
async function bumpWalletBuckets(
  db: Tx,
  owner: string,
  ownerType: OwnerType,
  data: Prisma.WalletUpdateInput,
): Promise<void> {
  await db.wallet.upsert({
    where: { owner_ownerType: { owner, ownerType } },
    create: { owner, ownerType },
    update: {},
  });
  await db.wallet.update({ where: { owner_ownerType: { owner, ownerType } }, data });
}

class PayoutService {
  async createPendingPayout(params: {
    recipientType: PayoutRecipientType;
    recipientId: string;
    orderId: string;
    deliveryId?: string;
    amount: number;
    tx?: Tx;
  }): Promise<Payout> {
    const { recipientType, recipientId, orderId, deliveryId, amount, tx } = params;
    const ownerType: OwnerType = recipientType === 'store' ? 'store' : 'motoboy';

    return withTx(tx, async (db) => {
      const payout = await db.payout.create({
        data: { recipientType, recipientId, orderId, deliveryId, amount, status: 'pending' },
      });
      await bumpWalletBuckets(db, recipientId, ownerType, { pendingBalance: { increment: amount } });
      return payout;
    });
  }

  async releasePayout(payoutId: string, tx?: Tx): Promise<void> {
    await withTx(tx, async (db) => {
      const payout = await db.payout.findUnique({ where: { id: payoutId } });
      if (!payout || payout.status !== 'pending') {
        throw new Error(`Payout ${payoutId} não encontrado ou não está pending`);
      }
      if (payout.blocked) {
        throw new Error(`Payout ${payoutId} está bloqueado: ${payout.blockReason || 'sem motivo'}`);
      }

      await db.payout.update({ where: { id: payoutId }, data: { status: 'released', releasedAt: new Date() } });

      const ownerType: OwnerType = payout.recipientType === 'store' ? 'store' : 'motoboy';
      const amount = num(payout.amount);
      await bumpWalletBuckets(db, String(payout.recipientId), ownerType, {
        pendingBalance: { decrement: amount },
        availableBalance: { increment: amount },
      });
    });
  }

  async releasePayoutsForOrder(orderId: string, tx?: Tx): Promise<void> {
    // Só libera automaticamente se a plataforma estiver configurada pra isso.
    const config = await (tx ?? prisma).platformConfig.findFirst();
    const autoApprove = config?.autoApprovePayouts === true;
    if (!autoApprove) return; // payouts permanecem pending — admin libera via painel

    await withTx(tx, async (db) => {
      const payouts = await db.payout.findMany({
        where: { orderId, status: 'pending', blocked: { not: true } },
      });
      for (const payout of payouts) {
        await db.payout.update({ where: { id: payout.id }, data: { status: 'released', releasedAt: new Date() } });
        const ownerType: OwnerType = payout.recipientType === 'store' ? 'store' : 'motoboy';
        const amount = num(payout.amount);
        await bumpWalletBuckets(db, String(payout.recipientId), ownerType, {
          pendingBalance: { decrement: amount },
          availableBalance: { increment: amount },
        });
      }
    });
  }

  async cancelPayoutsForOrder(
    orderId: string,
    reason: string,
    tx?: Tx,
  ): Promise<{ cancelled: number; errors: Array<{ payoutId: string; status: string }> }> {
    return withTx(tx, async (db) => {
      const payouts = await db.payout.findMany({
        where: { orderId, status: { in: ['pending', 'released', 'requested', 'paid'] } },
      });

      const errors: Array<{ payoutId: string; status: string }> = [];
      let cancelled = 0;

      for (const payout of payouts) {
        if (payout.status === 'requested' || payout.status === 'paid') {
          errors.push({ payoutId: String(payout.id), status: payout.status });
          continue;
        }

        const ownerType: OwnerType = payout.recipientType === 'store' ? 'store' : 'motoboy';
        const amount = num(payout.amount);

        if (payout.status === 'pending') {
          await bumpWalletBuckets(db, String(payout.recipientId), ownerType, { pendingBalance: { decrement: amount } });
        } else if (payout.status === 'released') {
          await bumpWalletBuckets(db, String(payout.recipientId), ownerType, { availableBalance: { decrement: amount } });
        }

        await db.payout.update({
          where: { id: payout.id },
          data: { status: 'cancelled', cancelledAt: new Date(), cancelReason: reason },
        });
        cancelled++;
      }

      return { cancelled, errors };
    });
  }

  async markPayoutsRequested(payoutIds: string[], withdrawalRequestId: string, tx?: Tx): Promise<void> {
    await withTx(tx, async (db) => {
      for (const id of payoutIds) {
        const payout = await db.payout.findUnique({ where: { id } });
        if (!payout || payout.status !== 'released') {
          throw new Error(`Payout ${id} não está released`);
        }
        await db.payout.update({
          where: { id },
          data: { status: 'requested', requestedAt: new Date(), withdrawalRequestId },
        });
        const ownerType: OwnerType = payout.recipientType === 'store' ? 'store' : 'motoboy';
        await bumpWalletBuckets(db, String(payout.recipientId), ownerType, { availableBalance: { decrement: num(payout.amount) } });
      }
    });
  }

  /**
   * Reverte payouts de 'requested' de volta pra 'released' (ex: a transferência do
   * saque falhou). Devolve o valor pro availableBalance, deixando-o sacável de novo.
   */
  async revertPayoutsToReleased(payoutIds: string[], tx?: Tx): Promise<void> {
    await withTx(tx, async (db) => {
      for (const id of payoutIds) {
        const payout = await db.payout.findUnique({ where: { id } });
        if (!payout || payout.status !== 'requested') continue;
        await db.payout.update({
          where: { id },
          data: { status: 'released', requestedAt: null, withdrawalRequestId: null },
        });
        const ownerType: OwnerType = payout.recipientType === 'store' ? 'store' : 'motoboy';
        await bumpWalletBuckets(db, String(payout.recipientId), ownerType, { availableBalance: { increment: num(payout.amount) } });
      }
    });
  }

  async markPayoutsPaid(
    payoutIds: string[],
    gatewayTransferId: string,
    tx?: Tx,
    options?: { skipCashboxDebit?: boolean },
  ): Promise<number> {
    return withTx(tx, async (db) => {
      let totalPaid = 0;

      for (const id of payoutIds) {
        const payout = await db.payout.findUnique({ where: { id } });
        if (!payout || (payout.status !== 'requested' && payout.status !== 'released')) {
          throw new Error(`Payout ${id} não está em status pagável (released ou requested)`);
        }

        // Se ainda estava released (admin paga sem saque formal), debita availableBalance
        if (payout.status === 'released') {
          const ownerType: OwnerType = payout.recipientType === 'store' ? 'store' : 'motoboy';
          await bumpWalletBuckets(db, String(payout.recipientId), ownerType, { availableBalance: { decrement: num(payout.amount) } });
        }

        await db.payout.update({ where: { id }, data: { status: 'paid', paidAt: new Date(), gatewayTransferId } });
        totalPaid += num(payout.amount);
      }

      // Transferência interna (loja → user wallet do dono) não debita AppCashbox.
      if (options?.skipCashboxDebit) return totalPaid;

      // Debitar do AppCashbox — dinheiro saiu da plataforma.
      const appCashbox = await db.appCashbox.findFirst();
      if (appCashbox) {
        await db.appCashbox.update({
          where: { id: appCashbox.id },
          data: { balance: { decrement: totalPaid }, totalExpenses: { increment: totalPaid } },
        });
        await db.appCashboxEntry.create({
          data: {
            appCashboxId: appCashbox.id,
            type: 'expense',
            source: 'payout_paid',
            amount: totalPaid,
            reason: `Payout de ${payoutIds.length} obrigacao(oes) — gateway transfer: ${gatewayTransferId}`,
          },
        });
      }

      return totalPaid;
    });
  }

  async listAvailablePayouts(recipientType: PayoutRecipientType, recipientId: string): Promise<Payout[]> {
    return prisma.payout.findMany({
      where: { recipientType, recipientId, status: 'released' },
      orderBy: { createdAt: 'asc' },
    });
  }

  async selectPayoutsForAmount(
    recipientType: PayoutRecipientType,
    recipientId: string,
    amount: number,
  ): Promise<{ payouts: Payout[]; total: number } | { error: 'AMOUNT_NOT_EXACT'; available: number }> {
    const available = await this.listAvailablePayouts(recipientType, recipientId);
    const selected: Payout[] = [];
    let sum = 0;

    for (const p of available) {
      if (sum >= amount) break;
      selected.push(p);
      sum += num(p.amount);
    }

    // Soma dos payouts inteiros precisa bater exato com o amount
    if (Math.abs(sum - amount) > 0.01) {
      return { error: 'AMOUNT_NOT_EXACT', available: sum };
    }

    return { payouts: selected, total: sum };
  }

  async getPendingObligations(): Promise<number> {
    const result = await prisma.payout.aggregate({
      where: { status: { in: ['pending', 'released', 'requested'] } },
      _sum: { amount: true },
    });
    return result._sum.amount ? num(result._sum.amount) : 0;
  }

  async listPayouts(filters: {
    status?: string;
    recipientType?: string;
    recipientId?: string;
    orderId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ payouts: Payout[]; total: number }> {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.recipientType) where.recipientType = filters.recipientType;
    if (filters.recipientId) where.recipientId = filters.recipientId;
    if (filters.orderId) where.orderId = filters.orderId;

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const [payouts, total] = await Promise.all([
      prisma.payout.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.payout.count({ where }),
    ]);

    // `_id` e amount numérico: o painel/app ainda leem `_id` e esperam number.
    const mapped = payouts.map((p) => ({ ...p, _id: p.id, amount: Number(p.amount) })) as any[];
    return { payouts: mapped, total };
  }
}

export const payoutService = new PayoutService();
export default payoutService;
