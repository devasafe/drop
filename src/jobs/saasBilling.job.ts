import { CronJob } from 'cron';
import { prisma } from '../lib/prisma';
import logger from '../config/logger';
import { getSaasConfig } from '../utils/settlement';
import { saoPauloToday } from '../services/asaasLoja/charge';
import { effectiveFee, shouldPause } from '../services/saasBilling/policy';
import { ensureBillingCustomer } from '../services/saasBilling/customer';
import { applySaasPayment } from '../services/saasBilling/payments';
import { cancelSaasSubscriptions } from '../services/saasBilling/modeSwitch';
import { createSubscription, deleteSubscription, listSubscriptionPayments, updateSubscriptionValue } from '../services/asaas/subscription';

/**
 * JOB: mensalidade SaaS do modo direto (a cada 1 h). Fora do modo direto só reapaga no Asaas
 * as assinaturas que sobraram da troca de modo (cancelSaasSubscriptions).
 * Cada passo é idempotente e isolado por loja (erro de uma não para as outras):
 *  a) backfill: loja sem StoreSaasBilling ganha linha `trialing` (fim do teste = now + saasTrialDays);
 *  b) assinatura: dono com documento aprovado e fee > 0 → customer dedicado + assinatura na
 *     conta-mãe, 1º vencimento = max(fim do teste, now) em America/Sao_Paulo. Gravação condicional
 *     (`asaasSubscriptionId: null`); se outro processo gravou antes, a assinatura recém-criada é
 *     apagada no Asaas (DELETE) para não cobrar a loja em dobro;
 *  b2) valor: fee efetivo ≠ subscriptionValue → atualiza a assinatura (ou apaga, se fee ≤ 0);
 *  c) reconciliação: faturas da assinatura → applySaasPayment (mesma função do webhook);
 *  d) pausa: bloqueada pela política (shouldPause; fee 0 nunca) → `paused`; paused que deixou de estar bloqueada → volta
 *     (`active` se já pagou alguma vez, senão `trialing`).
 */

const HOUR_CRON = '0 * * * *';
const DAY_MS = 24 * 60 * 60 * 1000;
let running = false;

const docApproved = (verification: any) => verification?.document?.status === 'approved';
const sameCents = (a: number, b: number) => Math.round(a * 100) === Math.round(b * 100);

export async function runSaasBillingCycle(now: Date = new Date()): Promise<void> {
  const cfg = await getSaasConfig();
  if (cfg.settlementMode !== 'direto') {
    // Custódia: a mensalidade não existe. Repete com segurança o cancelamento das assinaturas
    // que a troca de modo não conseguiu apagar no Asaas (sem assinatura → nada a fazer).
    await cancelSaasSubscriptions();
    return;
  }

  // a) Backfill (storeId é unique: skipDuplicates evita duplicar em corrida).
  const missing = await prisma.store.findMany({ where: { saasBilling: null }, select: { id: true } });
  if (missing.length > 0) {
    const trialEndsAt = new Date(now.getTime() + cfg.saasTrialDays * DAY_MS);
    await prisma.storeSaasBilling.createMany({
      data: missing.map((s) => ({ storeId: s.id, status: 'trialing' as const, trialEndsAt })),
      skipDuplicates: true,
    });
  }

  // b) Assinatura.
  const toSubscribe = await prisma.storeSaasBilling.findMany({
    where: { asaasSubscriptionId: null, status: { not: 'cancelled' } },
    include: { store: { select: { name: true, owner: { select: { verification: true } } } } },
  });
  for (const billing of toSubscribe) {
    try {
      const fee = effectiveFee(billing, cfg);
      if (!(fee > 0) || !docApproved(billing.store?.owner?.verification)) continue;
      const customer = await ensureBillingCustomer(billing);
      const firstDue = billing.trialEndsAt.getTime() > now.getTime() ? billing.trialEndsAt : now;
      const sub = await createSubscription({
        customer,
        value: fee,
        nextDueDate: saoPauloToday(firstDue),
        description: `Mensalidade DROP — ${billing.store?.name || ''}`.trim(),
        externalReference: `saas-sub:${billing.id}`,
      });
      const { count } = await prisma.storeSaasBilling.updateMany({
        where: { id: billing.id, asaasSubscriptionId: null },
        data: { asaasSubscriptionId: sub.id, subscriptionValue: fee },
      });
      if (count !== 1) {
        logger.warn('[saas-billing] assinatura criada em corrida — desfazendo a duplicada no Asaas', { storeId: billing.storeId, subscriptionId: sub.id });
        await deleteSubscription(sub.id);
      }
    } catch (err) {
      logger.error('[saas-billing] falha ao criar assinatura', err as Error, { storeId: billing.storeId });
    }
  }

  // b2) Valor: o fee efetivo mudou (padrão novo, ou linha antiga sem subscriptionValue =
  // desconhecido) → fee > 0 atualiza a assinatura; fee ≤ 0 apaga (o Asaas não cobra zero).
  // Gravação condicional ao mesmo id de assinatura. Erro: loga e tenta no próximo ciclo.
  const withSub = await prisma.storeSaasBilling.findMany({
    where: { asaasSubscriptionId: { not: null } },
    select: { id: true, storeId: true, asaasSubscriptionId: true, customFee: true, subscriptionValue: true },
  });
  for (const billing of withSub) {
    try {
      const fee = effectiveFee(billing, cfg);
      const current = billing.subscriptionValue == null ? null : Number(billing.subscriptionValue);
      if (current !== null && sameCents(current, fee)) continue;
      const subId = billing.asaasSubscriptionId!;
      if (fee > 0) {
        await updateSubscriptionValue(subId, fee);
        await prisma.storeSaasBilling.updateMany({ where: { id: billing.id, asaasSubscriptionId: subId }, data: { subscriptionValue: fee } });
        logger.info('[saas-billing] valor da assinatura sincronizado', { storeId: billing.storeId, from: current, to: fee });
      } else {
        await deleteSubscription(subId);
        await prisma.storeSaasBilling.updateMany({
          where: { id: billing.id, asaasSubscriptionId: subId },
          data: { asaasSubscriptionId: null, subscriptionValue: null },
        });
        logger.info('[saas-billing] assinatura apagada (mensalidade 0)', { storeId: billing.storeId });
      }
    } catch (err) {
      logger.error('[saas-billing] falha ao sincronizar o valor da assinatura', err as Error, { storeId: billing.storeId });
    }
  }

  // c) Reconciliação.
  const subscribed = await prisma.storeSaasBilling.findMany({
    where: { asaasSubscriptionId: { not: null } },
    select: { id: true, storeId: true, asaasSubscriptionId: true },
  });
  for (const billing of subscribed) {
    try {
      const list = await listSubscriptionPayments(billing.asaasSubscriptionId!);
      for (const p of list) await applySaasPayment(billing.id, p);
    } catch (err) {
      logger.error('[saas-billing] falha na reconciliação', err as Error, { storeId: billing.storeId });
    }
  }

  // d) Pausa / despausa.
  const rows = await prisma.storeSaasBilling.findMany({
    where: { status: { not: 'cancelled' } },
    select: { id: true, storeId: true, status: true, trialEndsAt: true, paidUntil: true, customFee: true },
  });
  for (const billing of rows) {
    try {
      const blocked = shouldPause(billing, now, cfg);
      if (blocked && billing.status !== 'paused') {
        const { count } = await prisma.storeSaasBilling.updateMany({
          where: { id: billing.id, status: { notIn: ['paused', 'cancelled'] } },
          data: { status: 'paused', pausedAt: now },
        });
        if (count === 1) logger.warn('[saas-billing] loja pausada', { storeId: billing.storeId });
      } else if (!blocked && billing.status === 'paused') {
        const { count } = await prisma.storeSaasBilling.updateMany({
          where: { id: billing.id, status: 'paused' },
          data: { status: billing.paidUntil ? 'active' : 'trialing', pausedAt: null },
        });
        if (count === 1) logger.info('[saas-billing] loja despausada', { storeId: billing.storeId });
      }
    } catch (err) {
      logger.error('[saas-billing] falha ao avaliar pausa', err as Error, { storeId: billing.storeId });
    }
  }
}

export function startSaasBillingJob(): CronJob {
  logger.info('[saas-billing] job iniciado (executa a cada 1 h)');
  const job = new CronJob(HOUR_CRON, async () => {
    if (running) return; // ciclo anterior ainda rodando neste processo
    running = true;
    try {
      await runSaasBillingCycle();
    } catch (err) {
      logger.error('[saas-billing] erro na execução do job', err as Error);
    } finally {
      running = false;
    }
  });
  job.start();
  return job;
}

export default startSaasBillingJob;
