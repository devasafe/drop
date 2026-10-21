import type { SaasBillingStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import logger from '../../config/logger';
import { AsaasApiError } from '../asaas/client';
import {
  deleteSubscription,
  deleteSubscriptionPayment,
  listSubscriptionPayments,
  updateSubscriptionNextDueDate,
} from '../asaas/subscription';
import { SAAS_OPEN_STATUSES } from '../saasBilling/payments';
import { firstDueDate } from '../saasBilling/dueDate';
import { sellsUntil } from '../saasBilling/policy';
import { notifyStore, STORE_LINKS } from '../storeNotify';
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
 * Apaga as faturas ABERTAS já geradas com vencimento anterior a `nextDueDate` (o PUT do
 * nextDueDate não as move). O PUT vem antes, por quem chama: ao contrário, uma falha nele deixaria
 * a loja sem fatura para pagar. Os ids apagados vão sendo acrescentados a `removed`, para quem
 * chama saber o que já foi feito mesmo se um DELETE falhar no meio.
 */
async function removeOldOpenPayments(subscriptionId: string, nextDueDate: string, removed: string[]): Promise<void> {
  const list = await listSubscriptionPayments(subscriptionId);
  for (const p of list) {
    if (!SAAS_OPEN_STATUSES.includes(p.status)) continue;
    if (String(p.dueDate).slice(0, 10) >= nextDueDate) continue;
    await deleteSubscriptionPayment(p.id);
    removed.push(p.id);
  }
}

const asaasUpdateFailed = () =>
  new AccountActionError(502, 'ASAAS_UPDATE_FAILED', 'Não foi possível atualizar a assinatura no Asaas. Nada foi alterado.');
const asaasPartial = () =>
  new AccountActionError(502, 'ASAAS_PARTIAL', 'O Asaas ficou parcialmente atualizado. Tente de novo para concluir.');

/** O que o estender já mexeu no Asaas, para desfazer se o resto falhar. */
interface AsaasTouch {
  subscriptionId: string;
  previousDueDate: string;
  removed: string[];
  /** a falha veio de uma chamada ao Asaas (e não do banco) */
  fromAsaas: boolean;
}

/**
 * Falha depois do PUT: devolve o vencimento anterior (best-effort, sem engolir o erro original).
 * Nenhuma fatura apagada e a volta deu certo: o Asaas ficou como estava, então o erro é o honesto
 * "nada foi alterado" (falha do Asaas) ou o próprio erro original (falha do banco ou conflito).
 * Senão: ASAAS_PARTIAL, e o log diz o que foi feito.
 */
async function compensateExtend(storeId: string, original: unknown, touched: AsaasTouch | null): Promise<unknown> {
  if (!touched) return original;
  let restored = true;
  try {
    await updateSubscriptionNextDueDate(touched.subscriptionId, touched.previousDueDate);
  } catch (err) {
    restored = false;
    logger.error('[saas] não foi possível devolver o vencimento anterior da assinatura', err as Error, {
      storeId, subscriptionId: touched.subscriptionId, previousDueDate: touched.previousDueDate,
    });
  }
  if (restored && touched.removed.length === 0) return touched.fromAsaas ? asaasUpdateFailed() : original;
  logger.error('[saas] Asaas parcialmente atualizado no estender teste', original as Error, {
    storeId, subscriptionId: touched.subscriptionId, restored, removedPayments: touched.removed,
  });
  return asaasPartial();
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

  let touched = null as AsaasTouch | null;
  let saved;
  try {
    saved = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "StoreSaasBilling" WHERE "storeId" = ${storeId} FOR UPDATE`;
      const billing = await tx.storeSaasBilling.findUnique({ where: { storeId } });
      if (!billing) throw noSaasBilling();
      if (billing.status !== 'trialing') throw notTrialing();

      const trialEndsAt = new Date(Math.max(billing.trialEndsAt.getTime(), now.getTime()) + days * DAY_MS);
      let nextDueDate: string | null = null;
      const removedPayments: string[] = [];
      if (billing.asaasSubscriptionId) {
        const subscriptionId = billing.asaasSubscriptionId;
        nextDueDate = firstDueDate({ trialEndsAt, paidUntil: billing.paidUntil }, now);
        try {
          await updateSubscriptionNextDueDate(subscriptionId, nextDueDate);
        } catch (err) {
          logger.error('[saas] Asaas recusou o novo vencimento do teste estendido', err as Error, { storeId });
          throw asaasUpdateFailed();
        }
        touched = {
          subscriptionId,
          previousDueDate: firstDueDate({ trialEndsAt: billing.trialEndsAt, paidUntil: billing.paidUntil }, now),
          removed: removedPayments,
          fromAsaas: false,
        };
        try {
          await removeOldOpenPayments(subscriptionId, nextDueDate, removedPayments);
        } catch (err) {
          touched.fromAsaas = true;
          logger.error('[saas] Asaas falhou ao apagar a fatura com o vencimento velho', err as Error, { storeId });
          throw err;
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
  } catch (err) {
    // o TS não enxerga a atribuição feita dentro da transação
    throw await compensateExtend(storeId, err, touched as AsaasTouch | null);
  }

  logger.info('[saas] teste da mensalidade estendido', { storeId, days, by: actor.id });
  return { saas: toSaasState(saved) };
}

const alreadyCancelled = () => new AccountActionError(409, 'ALREADY_CANCELLED', 'A mensalidade desta loja já está cancelada.');
const dayMonthSaoPaulo = (d: Date) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(d);

/**
 * Cancela a mensalidade (ruling 7): apaga a assinatura no Asaas (404 = já não existe) e, na mesma
 * transação, grava cancelled + quem/quando, zera a assinatura, marca as faturas abertas como
 * DELETED e registra saas_cancel. A loja vende até o fim do período (sellsUntil); depois, o job
 * pausa pelo admin (runCancelledSaasPauses).
 * Tudo sob `FOR UPDATE` na linha da mensalidade (como o estender): cancelar e estender se enfileiram,
 * e o job não grava assinatura nova no meio (a gravação dele espera o lock e perde para o `cancelled`).
 * Falha do Asaas lança dentro da transação: rollback, nada muda no DROP.
 */
export async function cancelSaas(
  storeId: string,
  actor: AccountActor,
  rawReason: unknown,
  now: Date = new Date(),
): Promise<{ saas: StoreSaasState }> {
  const reason = parseRequiredReason(rawReason);
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
  if (!store) throw storeNotFound();

  const saved = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "StoreSaasBilling" WHERE "storeId" = ${storeId} FOR UPDATE`;
    const billing = await tx.storeSaasBilling.findUnique({ where: { storeId } });
    if (!billing) throw noSaasBilling();
    if (billing.status === 'cancelled') throw alreadyCancelled();

    const subId = billing.asaasSubscriptionId;
    if (subId) {
      try {
        await deleteSubscription(subId);
      } catch (err) {
        if (!(err instanceof AsaasApiError && err.status === 404)) {
          logger.error('[saas] Asaas recusou o cancelamento da assinatura', err as Error, { storeId });
          throw new AccountActionError(502, 'SAAS_CANCEL_FAILED', 'Não foi possível cancelar a assinatura no Asaas. Nada foi alterado.');
        }
      }
    }

    const { count } = await tx.storeSaasBilling.updateMany({
      where: { id: billing.id, status: { not: 'cancelled' } },
      data: { status: 'cancelled', cancelledAt: now, cancelledBy: actor.id, asaasSubscriptionId: null, subscriptionValue: null },
    });
    if (count !== 1) throw alreadyCancelled();
    // Sem assinatura não haverá mais cobrança: a fatura aberta some da tela do lojista já (o webhook PAYMENT_DELETED confirma depois).
    await tx.saasBillingPayment.updateMany({
      where: { billingId: billing.id, status: { in: SAAS_OPEN_STATUSES } },
      data: { status: 'DELETED' },
    });
    const row = await tx.storeSaasBilling.findUniqueOrThrow({ where: { id: billing.id } });
    await recordAccountAction(tx, {
      actor,
      storeId,
      type: 'saas_cancel',
      reason,
      meta: { previousStatus: billing.status, asaasSubscriptionId: subId, sellsUntil: sellsUntil(row).toISOString() },
    });
    return row;
  }, { timeout: EXTEND_TX_TIMEOUT_MS });

  logger.info('[saas] mensalidade cancelada', { storeId, by: actor.id });
  const ends = sellsUntil(saved);
  const coverage = ends.getTime() > now.getTime()
    ? `Ela segue vendendo até ${dayMonthSaoPaulo(ends)}.`
    : 'A loja já está fora do período pago e fica pausada.';
  // Depois do commit e best-effort (notifyStore nunca lança).
  await notifyStore(storeId, {
    title: 'Mensalidade cancelada',
    message: `O DROP cancelou a mensalidade da sua loja. ${coverage} Motivo: ${reason}`,
    link: STORE_LINKS.subscription,
    entityId: storeId,
    tag: 'mensalidade',
  });
  return { saas: toSaasState(saved) };
}
