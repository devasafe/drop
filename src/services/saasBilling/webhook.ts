import { prisma } from '../../lib/prisma';
import logger from '../../config/logger';
import { applySaasPayment } from './payments';

/**
 * Faturas da mensalidade SaaS no webhook da CONTA-MÃE (POST /webhooks/asaas).
 * Chamado ANTES dos handlers de pedido/recarga: se a cobrança é da assinatura, aplica aqui
 * e o evento não segue para eles (uma fatura de mensalidade nunca vira pedido pago).
 *
 * Como reconhecer a fatura:
 *  - `payment.subscription` = StoreSaasBilling.asaasSubscriptionId (preferido: é o vínculo
 *    que o Asaas garante nas cobranças geradas pela assinatura);
 *  - `payment.externalReference` = `saas-sub:<billingId>` (a assinatura é criada com esse
 *    externalReference e o Asaas o repete nas cobranças dela).
 * Nada disso → devolve false e o fluxo atual (pedido/recarga) segue intacto.
 */

const SAAS_EVENTS = new Set([
  'PAYMENT_CREATED',
  'PAYMENT_RECEIVED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_OVERDUE',
  'PAYMENT_DELETED',
  'PAYMENT_REFUNDED',
]);
const REF_PREFIX = 'saas-sub:';

/** true = o evento era da mensalidade (tratado aqui); false = segue para pedido/recarga. */
export async function handleSaasBillingEvent(event: string, payment: any): Promise<boolean> {
  if (!SAAS_EVENTS.has(event) || !payment?.id) return false;

  const subscriptionId = payment.subscription ? String(payment.subscription) : null;
  const ref = typeof payment.externalReference === 'string' ? payment.externalReference : '';
  const refBillingId = ref.startsWith(REF_PREFIX) ? ref.slice(REF_PREFIX.length) : null;
  if (!subscriptionId && !refBillingId) return false;

  let billing = subscriptionId
    ? await prisma.storeSaasBilling.findUnique({ where: { asaasSubscriptionId: subscriptionId }, select: { id: true, asaasSubscriptionId: true } })
    : null;
  if (!billing && refBillingId) {
    billing = await prisma.storeSaasBilling.findUnique({ where: { id: refBillingId }, select: { id: true, asaasSubscriptionId: true } });
  }

  if (!billing) {
    // Assinatura de outra coisa (não é nossa mensalidade) → fluxo normal. Mas uma referência
    // `saas-sub:` explícita nunca pode cair no fluxo de pedido: registra e encerra.
    if (!refBillingId) return false;
    logger.warn('[saas-billing] webhook de mensalidade sem cobrança correspondente (ignorado)', {
      asaasPaymentId: payment.id, event,
    });
    return true;
  }

  if (subscriptionId && billing.asaasSubscriptionId && billing.asaasSubscriptionId !== subscriptionId) {
    // Achado pelo externalReference, mas de outra assinatura (ex.: a duplicada desfeita pelo job).
    // O dinheiro entrou na conta-mãe, então a fatura conta para a loja; fica o aviso para conferência.
    logger.warn('[saas-billing] fatura de assinatura diferente da registrada na loja', {
      billingId: billing.id, asaasPaymentId: payment.id,
    });
  }

  await applySaasPayment(billing.id, {
    id: String(payment.id),
    // No PAYMENT_DELETED o Asaas manda o status anterior (ex.: PENDING) + `deleted: true`.
    status: event === 'PAYMENT_DELETED' ? 'DELETED' : String(payment.status || ''),
    dueDate: payment.dueDate,
    value: Number(payment.value),
    invoiceUrl: payment.invoiceUrl ?? null,
    paymentDate: payment.paymentDate ?? null,
    clientPaymentDate: payment.clientPaymentDate ?? null,
  });
  return true;
}
