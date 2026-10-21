import type { SaasBillingStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import logger from '../../config/logger';
import {
  deleteSubscriptionPayment,
  listSubscriptionPayments,
  updateSubscriptionNextDueDate,
} from '../asaas/subscription';
import { SAAS_OPEN_STATUSES } from '../saasBilling/payments';
import { firstDueDate } from '../saasBilling/dueDate';
import { recordAccountAction, AccountActor } from './actions';
import { AccountActionError, parseRequiredReason, storeNotFound } from './errors';
import type { StoreSaasState } from './types';

/**
 * D3b-2b · ações do admin sobre a mensalidade da loja (spec 9): estender o teste (2.1), cancelar
 * (2.2) e a pausa do job no fim do período cancelado (2.3). O Asaas vem SEMPRE antes do DROP:
 * se ele falha, 502 e nada muda aqui. A linha de AdminAccountAction vai na mesma transação.
 */

const DAY_MS = 86_400_000;
/** A transação do estender segura o lock da linha enquanto fala com o Asaas (até 3 chamadas de 20 s). */
const EXTEND_TX_TIMEOUT_MS = 60_000;

export const EXTEND_TRIAL_DAYS = [7, 14, 30] as const;
export type ExtendTrialDays = (typeof EXTEND_TRIAL_DAYS)[number];

export function toSaasState(b: {
  status: SaasBillingStatus;
  trialEndsAt: Date;
  paidUntil: Date | null;
  cancelledAt: Date | null;
}): StoreSaasState {
  return {
    status: b.status,
    trialEndsAt: b.trialEndsAt.toISOString(),
    paidUntil: b.paidUntil ? b.paidUntil.toISOString() : null,
    cancelledAt: b.cancelledAt ? b.cancelledAt.toISOString() : null,
  };
}

/** 7, 14 ou 30, como número (JSON). Qualquer outra coisa: 400 INVALID_DAYS. */
export function parseExtendDays(raw: unknown): ExtendTrialDays {
  if (typeof raw !== 'number' || !(EXTEND_TRIAL_DAYS as readonly number[]).includes(raw)) {
    throw new AccountActionError(400, 'INVALID_DAYS', 'Escolha 7, 14 ou 30 dias.');
  }
  return raw as ExtendTrialDays;
}

const noSaasBilling = () => new AccountActionError(409, 'NO_SAAS_BILLING', 'Esta loja não tem mensalidade.');
const notTrialing = () => new AccountActionError(409, 'NOT_TRIALING', 'Só dá para estender o teste de uma loja que ainda está em teste.');

/**
 * Leva o 1º vencimento da assinatura para `nextDueDate`: o PUT muda a próxima fatura a ser gerada;
 * as faturas ABERTAS já geradas com vencimento anterior são apagadas (o Asaas não as move).
 * PUT antes do DELETE: ao contrário, uma falha no PUT deixaria a loja sem fatura para pagar.
 * Devolve os ids apagados.
 */
async function moveFirstDueDate(subscriptionId: string, nextDueDate: string): Promise<string[]> {
  await updateSubscriptionNextDueDate(subscriptionId, nextDueDate);
  const list = await listSubscriptionPayments(subscriptionId);
  const removed: string[] = [];
  for (const p of list) {
    if (!SAAS_OPEN_STATUSES.includes(p.status)) continue;
    if (String(p.dueDate).slice(0, 10) >= nextDueDate) continue;
    await deleteSubscriptionPayment(p.id);
    removed.push(p.id);
  }
  return removed;
}

/**
 * Estende o teste em `days` dias a partir de max(fim atual, agora). Só em `trialing`.
 * Tudo sob `FOR UPDATE` na linha da mensalidade: dois admins ao mesmo tempo viram duas extensões
 * em sequência, e o vencimento mandado ao Asaas é sempre o do fim que fica gravado.
 */
export async function extendTrial(
  storeId: string,
  actor: AccountActor,
  rawDays: unknown,
  rawReason: unknown,
  now: Date = new Date(),
): Promise<{ saas: StoreSaasState }> {
  const reason = parseRequiredReason(rawReason);
  const days = parseExtendDays(rawDays);
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
  if (!store) throw storeNotFound();

  const saved = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "StoreSaasBilling" WHERE "storeId" = ${storeId} FOR UPDATE`;
    const billing = await tx.storeSaasBilling.findUnique({ where: { storeId } });
    if (!billing) throw noSaasBilling();
    if (billing.status !== 'trialing') throw notTrialing();

    const trialEndsAt = new Date(Math.max(billing.trialEndsAt.getTime(), now.getTime()) + days * DAY_MS);
    let nextDueDate: string | null = null;
    let removedPayments: string[] = [];
    if (billing.asaasSubscriptionId) {
      nextDueDate = firstDueDate({ trialEndsAt, paidUntil: billing.paidUntil }, now);
      try {
        removedPayments = await moveFirstDueDate(billing.asaasSubscriptionId, nextDueDate);
      } catch (err) {
        logger.error('[saas] Asaas recusou o novo vencimento do teste estendido', err as Error, { storeId });
        throw new AccountActionError(502, 'ASAAS_UPDATE_FAILED', 'Não foi possível atualizar a assinatura no Asaas. Nada foi alterado.');
      }
      if (removedPayments.length > 0) {
        await tx.saasBillingPayment.updateMany({
          where: { billingId: billing.id, asaasPaymentId: { in: removedPayments } },
          data: { status: 'DELETED' },
        });
      }
    }

    const { count } = await tx.storeSaasBilling.updateMany({
      where: { id: billing.id, status: 'trialing' },
      data: { trialEndsAt },
    });
    if (count !== 1) throw notTrialing();
    await recordAccountAction(tx, {
      actor,
      storeId,
      type: 'trial_extend',
      reason,
      meta: { days, from: billing.trialEndsAt.toISOString(), to: trialEndsAt.toISOString(), nextDueDate, removedPayments },
    });
    return { ...billing, trialEndsAt };
  }, { timeout: EXTEND_TX_TIMEOUT_MS });

  logger.info('[saas] teste da mensalidade estendido', { storeId, days, by: actor.id });
  return { saas: toSaasState(saved) };
}
