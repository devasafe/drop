import { prisma } from '../lib/prisma';
import env from '../config/env';
import logger from '../config/logger';
import payoutService, { resolvablePayoutWhere } from './payout.service';
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

export type ResolvePayoutInput =
  | { outcome: 'released'; asaasTransferId?: string; note: string }
  | { outcome: 'not_sent'; note: string };

/**
 * D3b-3 · resolver repasse incerto (spec 4.1). O admin conferiu no Asaas:
 *  - released: conclui (baixa + movimento) como o fluxo feliz;
 *  - not_sent: volta a pending (pode ser liberado de novo).
 * A primeira gravação condicional (releasing + elegível) trava a linha: uma resolução
 * concorrente espera e encontra o repasse fora de releasing → 409 PAYOUT_NOT_RESOLVABLE.
 */
export async function resolveUncertainPayout(
  payoutId: string,
  actor: AdminMoneyActor,
  input: ResolvePayoutInput,
): Promise<{ id: string; status: 'released' | 'pending' }> {
  return prisma.$transaction(async (tx) => {
    const before = await tx.payout.findUnique({ where: { id: payoutId } });
    if (!before) throw new MoneyActionError(404, 'PAYOUT_NOT_FOUND', 'Payout não encontrado');

    const notResolvable = async () => {
      const now = await tx.payout.findUnique({ where: { id: payoutId }, select: { status: true, uncertainAt: true } });
      return new MoneyActionError(
        409,
        'PAYOUT_NOT_RESOLVABLE',
        'Repasse não está incerto nem travado em liberação (ou já foi resolvido)',
        { currentStatus: now?.status ?? before.status, uncertainAt: now?.uncertainAt ? now.uncertainAt.toISOString() : null },
      );
    };

    const resolution = { resolvedBy: actor.id, resolvedAt: new Date(), resolutionNote: input.note };
    const beforeJson = {
      status: before.status,
      uncertainAt: before.uncertainAt ? before.uncertainAt.toISOString() : null,
      gatewayTransferId: before.gatewayTransferId,
    };

    if (input.outcome === 'not_sent') {
      const { count } = await tx.payout.updateMany({
        where: { id: payoutId, ...resolvablePayoutWhere() },
        data: { status: 'pending', uncertainAt: null, gatewayTransferId: null, ...resolution },
      });
      if (count !== 1) throw await notResolvable();
      await recordAdminMoneyAction(tx, {
        actor,
        type: 'payout_resolve_uncertain',
        targetType: 'payout',
        targetId: payoutId,
        amount: before.amount,
        reason: input.note,
        before: beforeJson,
        after: { status: 'pending', outcome: 'not_sent' },
      });
      logger.info('[repasse] repasse incerto resolvido', { payoutId, outcome: 'not_sent', adminId: actor.id });
      return { id: payoutId, status: 'pending' as const };
    }

    const { count } = await tx.payout.updateMany({
      where: { id: payoutId, ...resolvablePayoutWhere() },
      data: resolution,
    });
    if (count !== 1) throw await notResolvable();
    const transferId = input.asaasTransferId || before.gatewayTransferId || `manual_resolve_${payoutId}`;
    await payoutService.settleClaimedRelease(tx, payoutId, { gatewayProvider: 'asaas', gatewayTransferId: transferId });
    await recordAdminMoneyAction(tx, {
      actor,
      type: 'payout_resolve_uncertain',
      targetType: 'payout',
      targetId: payoutId,
      amount: before.amount,
      reason: input.note,
      before: beforeJson,
      after: { status: 'released', outcome: 'released', gatewayTransferId: transferId },
    });
    logger.info('[repasse] repasse incerto resolvido', { payoutId, outcome: 'released', adminId: actor.id });
    return { id: payoutId, status: 'released' as const };
  });
}
