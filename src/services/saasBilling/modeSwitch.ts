import { prisma } from '../../lib/prisma';
import logger from '../../config/logger';
import { AsaasApiError } from '../asaas/client';
import { deleteSubscription } from '../asaas/subscription';

/**
 * Efeitos da troca do modo de liquidação na mensalidade SaaS (PUT /admin/switches).
 * A troca já foi gravada quando estas rodam: falha aqui NÃO desfaz a troca.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SaasBillingWarning {
  storeId: string;
  error: string;
}

/**
 * Modo custódia: a mensalidade não existe → apaga no Asaas TODAS as assinaturas ainda
 * registradas e limpa `asaasSubscriptionId` (condicional ao mesmo id: se o job recriou/trocou
 * no meio, não apaga o novo registro). 404 do Asaas = já não existe → limpa também.
 * Falha de uma loja não para as outras: vira aviso (o CEO vê) e o job tenta de novo a cada ciclo.
 */
export async function cancelSaasSubscriptions(): Promise<SaasBillingWarning[]> {
  const rows = await prisma.storeSaasBilling.findMany({
    where: { asaasSubscriptionId: { not: null } },
    select: { id: true, storeId: true, asaasSubscriptionId: true },
  });
  const warnings: SaasBillingWarning[] = [];
  for (const row of rows) {
    const subId = row.asaasSubscriptionId!;
    try {
      try {
        await deleteSubscription(subId);
      } catch (err) {
        if (!(err instanceof AsaasApiError && err.status === 404)) throw err;
      }
      await prisma.storeSaasBilling.updateMany({
        where: { id: row.id, asaasSubscriptionId: subId },
        data: { asaasSubscriptionId: null, subscriptionValue: null },
      });
      logger.info('[saas-billing] assinatura cancelada (modo custódia)', { storeId: row.storeId });
    } catch (err) {
      logger.error('[saas-billing] falha ao cancelar assinatura no modo custódia', err as Error, { storeId: row.storeId });
      warnings.push({ storeId: row.storeId, error: (err as Error)?.message || 'Erro desconhecido' });
    }
  }
  return warnings;
}

/**
 * Volta ao modo direto: reabre a contagem para ninguém ser pausado pelo tempo em que a
 * mensalidade não existia. trialEndsAt = max(atual, now + saasTrialDays); quem não está
 * `cancelled` volta a `trialing` sem overdueSince/pausedAt. paidUntil fica (período pago vale).
 */
export async function reopenSaasTrials(now: Date, trialDays: number): Promise<void> {
  const trialEndsAt = new Date(now.getTime() + Math.max(0, trialDays) * DAY_MS);
  await prisma.$transaction([
    prisma.storeSaasBilling.updateMany({ where: { trialEndsAt: { lt: trialEndsAt } }, data: { trialEndsAt } }),
    prisma.storeSaasBilling.updateMany({
      where: { status: { not: 'cancelled' } },
      data: { status: 'trialing', overdueSince: null, pausedAt: null },
    }),
  ]);
}
