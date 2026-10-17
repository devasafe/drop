import { prisma } from '../lib/prisma';
import env from '../config/env';
import logger from '../config/logger';
import payoutService from './payout.service';
import { sendPayoutTransfer, flagPayoutReleaseUncertain } from './asaas/release';
import {
  AdminMoneyActor,
  MoneyActionError,
  recordAdminMoneyAction,
} from './adminMoneyAction.service';
import { Prisma } from '@prisma/client';

/**
 * D3b-3 · liberar repasse pelo admin (spec 4.1), modo Asaas e legado.
 * Reivindica (pending → releasing) antes de qualquer coisa; a baixa e a linha payout_release
 * vão juntas numa transação. Erros saem como MoneyActionError com o code exato da spec.
 */

type Tx = Prisma.TransactionClient;

export interface PayoutReleaseResult {
  id: string;
  status: 'released';
  gatewayTransferId: string | null;
}

/** 404 PAYOUT_NOT_FOUND ou 409 PAYOUT_NOT_PENDING {currentStatus, blocked}, lendo o estado atual. */
export async function payoutNotPendingError(payoutId: string, db: Tx = prisma): Promise<MoneyActionError> {
  const current = await db.payout.findUnique({ where: { id: payoutId }, select: { status: true, blocked: true, blockReason: true } });
  if (!current) return new MoneyActionError(404, 'PAYOUT_NOT_FOUND', 'Payout não encontrado');
  const message = current.status === 'pending' && current.blocked
    ? `Repasse bloqueado: ${current.blockReason || 'sem motivo'}`
    : `Repasse não está pendente (status atual: ${current.status})`;
  return new MoneyActionError(409, 'PAYOUT_NOT_PENDING', message, { currentStatus: current.status, blocked: current.blocked });
}

const uncertainError = () =>
  new MoneyActionError(
    502,
    'PAYOUT_TRANSFER_UNCERTAIN',
    'Resposta incerta do Asaas: o repasse pode ter saído. Confira no painel do Asaas e use "Resolver" antes de qualquer ação.',
    { currentStatus: 'releasing' },
  );

export async function releasePayoutAsAdmin(
  payoutId: string,
  actor: AdminMoneyActor,
  useAsaas: boolean = env.PAYMENT_GATEWAY === 'asaas',
): Promise<PayoutReleaseResult> {
  // Modo legado (carteira virtual): reivindicação + baixa + linha numa transação só.
  if (!useAsaas) {
    return prisma.$transaction(async (tx) => {
      if (!(await payoutService.claimPayoutForRelease(payoutId, tx))) throw await payoutNotPendingError(payoutId, tx);
      const settled = await payoutService.settleClaimedRelease(tx, payoutId);
      await recordAdminMoneyAction(tx, {
        actor,
        type: 'payout_release',
        targetType: 'payout',
        targetId: payoutId,
        amount: settled.amount,
        before: { status: 'pending' },
        after: { status: 'released', gatewayTransferId: null, mode: 'legacy' },
      });
      return { id: payoutId, status: 'released' as const, gatewayTransferId: null };
    });
  }

  // 1. Reivindica antes do Asaas.
  if (!(await payoutService.claimPayoutForRelease(payoutId))) throw await payoutNotPendingError(payoutId);
  const payout = await prisma.payout.findUniqueOrThrow({ where: { id: payoutId } });

  // 2. Transferência.
  const outcome = await sendPayoutTransfer(payout);

  // 4. Recusa definitiva: nada saiu, volta a pending, sem linha.
  if (outcome.kind === 'refused') {
    let currentStatus = 'pending';
    try {
      if (!(await payoutService.unclaimRelease(payoutId))) currentStatus = 'releasing';
    } catch (err) {
      currentStatus = 'releasing';
      logger.error('[repasse] recusa do Asaas, mas a devolução a pending falhou', err as Error, { payoutId });
    }
    throw new MoneyActionError(502, 'PAYOUT_TRANSFER_REFUSED', `Transferência no Asaas não concluída: ${outcome.message}`, { currentStatus });
  }

  // 5. Incerto: fica releasing + uncertainAt, com a linha.
  if (outcome.kind === 'uncertain') {
    await flagPayoutReleaseUncertain(payout, outcome.message, null, actor);
    throw uncertainError();
  }

  // 3. Sucesso: baixa + movimento + linha numa transação.
  try {
    return await prisma.$transaction(async (tx) => {
      const settled = await payoutService.settleClaimedRelease(tx, payoutId, { gatewayProvider: 'asaas', gatewayTransferId: outcome.transferId });
      await recordAdminMoneyAction(tx, {
        actor,
        type: 'payout_release',
        targetType: 'payout',
        targetId: payoutId,
        amount: settled.amount,
        before: { status: 'pending' },
        after: { status: 'released', gatewayTransferId: outcome.transferId },
      });
      return { id: payoutId, status: 'released' as const, gatewayTransferId: outcome.transferId };
    });
  } catch (err: any) {
    // O Asaas aceitou, mas a baixa local falhou: o dinheiro saiu. Nunca volta a pending.
    await flagPayoutReleaseUncertain(
      payout,
      `transferência ${outcome.transferId} aceita, baixa local falhou: ${err?.message || err}`,
      outcome.transferId,
      actor,
    );
    throw uncertainError();
  }
}
