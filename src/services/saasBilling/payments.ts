import { prisma } from '../../lib/prisma';
import logger from '../../config/logger';
import { nextPaidUntil } from './policy';
import type { AsaasSubscriptionPayment } from '../asaas/subscription';

/** Status do Asaas que contam como fatura paga. */
export const SAAS_PAID_STATUSES = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];
/** Status do Asaas de fatura ainda a pagar (a "próxima cobrança" da loja). */
export const SAAS_OPEN_STATUSES = ['PENDING', 'OVERDUE'];
export const isSaasPaid = (s?: string | null) => !!s && SAAS_PAID_STATUSES.includes(s);

/** 'YYYY-MM-DD' (ou ISO) do Asaas → Date em UTC 00:00. */
function asaasDate(d?: string | null): Date | null {
  if (!d) return null;
  const out = new Date(`${String(d).slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(out.getTime()) ? null : out;
}

/**
 * Aplica uma fatura da mensalidade (usado pela reconciliação do job e pelo webhook do B3).
 * Tudo em uma transação:
 *  - upsert do SaasBillingPayment (por asaasPaymentId);
 *  - transição para PAGO (antes não pago) → paidUntil = nextPaidUntil(paidUntil, dueDate),
 *    status active, limpa overdueSince/pausedAt. Reaplicar a mesma fatura paga não avança de
 *    novo (e, mesmo em corrida, nextPaidUntil é max(atual, dueDate + 1 mês): o resultado é o mesmo).
 *    Loja `cancelled` só tem o período estendido; o status não volta sozinho.
 *  - OVERDUE → past_due (se não estiver paused/cancelled) e overdueSince = dueDate se vazio.
 *  - DELETED (o webhook manda `status: 'DELETED'` no PAYMENT_DELETED) → só o status da fatura.
 *  - REFUNDED → status da fatura + warn. NÃO recua paidUntil: o período já liberado fica, e o
 *    estorno de mensalidade é decisão manual da plataforma (o admin vê a fatura estornada).
 */
export async function applySaasPayment(billingId: string, payment: AsaasSubscriptionPayment): Promise<void> {
  const dueDate = asaasDate(payment?.dueDate);
  if (!payment?.id || !dueDate) throw new Error('Fatura SaaS sem id ou vencimento');
  const paidAt = asaasDate(payment.clientPaymentDate) || asaasDate(payment.paymentDate);

  await prisma.$transaction(async (tx) => {
    const prev = await tx.saasBillingPayment.findUnique({
      where: { asaasPaymentId: payment.id },
      select: { status: true, billingId: true },
    });
    if (prev && prev.billingId !== billingId) throw new Error('Fatura SaaS pertence a outra cobrança');

    const data = {
      value: Number(payment.value) || 0,
      dueDate,
      status: payment.status,
      invoiceUrl: payment.invoiceUrl ?? null,
      ...(isSaasPaid(payment.status) ? { paidAt: paidAt ?? new Date() } : {}),
    };
    await tx.saasBillingPayment.upsert({
      where: { asaasPaymentId: payment.id },
      create: { billingId, asaasPaymentId: payment.id, ...data },
      update: data,
    });

    if (payment.status === 'REFUNDED' && prev?.status !== 'REFUNDED') {
      logger.warn('[saas-billing] fatura da mensalidade estornada — paidUntil mantido (revisar manualmente)', {
        billingId, asaasPaymentId: payment.id, previousStatus: prev?.status ?? null,
      });
      return;
    }

    if (isSaasPaid(payment.status) && !isSaasPaid(prev?.status)) {
      const billing = await tx.storeSaasBilling.findUnique({ where: { id: billingId }, select: { paidUntil: true, status: true } });
      if (!billing) throw new Error('Cobrança SaaS não encontrada');
      await tx.storeSaasBilling.update({
        where: { id: billingId },
        data: {
          paidUntil: nextPaidUntil(billing.paidUntil, dueDate),
          ...(billing.status === 'cancelled' ? {} : { status: 'active' as const }),
          overdueSince: null,
          pausedAt: null,
        },
      });
      return;
    }

    if (payment.status === 'OVERDUE' && !isSaasPaid(prev?.status)) {
      await tx.storeSaasBilling.updateMany({
        where: { id: billingId, status: { notIn: ['paused', 'cancelled'] } },
        data: { status: 'past_due' },
      });
      await tx.storeSaasBilling.updateMany({
        where: { id: billingId, overdueSince: null },
        data: { overdueSince: dueDate },
      });
    }
  });
}
