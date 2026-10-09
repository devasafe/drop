import asaasClient from './client';

/**
 * Assinatura recorrente na CONTA-MÃE da DROP (mensalidade SaaS do modo direto).
 * Nunca usa a chave da loja: quem cobra a mensalidade é a plataforma.
 */

export interface AsaasSubscriptionPayment {
  id: string;
  status: string;
  dueDate: string; // YYYY-MM-DD
  value: number;
  invoiceUrl?: string | null;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
}

/** Cria a assinatura mensal. `billingType: 'UNDEFINED'`: a loja escolhe Pix/boleto/cartão na fatura. */
export async function createSubscription(params: {
  customer: string;
  value: number;
  nextDueDate: string; // YYYY-MM-DD
  description: string;
  externalReference: string;
}): Promise<{ id: string }> {
  const sub = await asaasClient.post<{ id: string }>('/subscriptions', {
    customer: params.customer,
    billingType: 'UNDEFINED',
    cycle: 'MONTHLY',
    value: Number(params.value.toFixed(2)),
    nextDueDate: params.nextDueDate,
    description: params.description,
    externalReference: params.externalReference,
  });
  return { id: sub.id };
}

/**
 * Atualiza o valor da assinatura (valor especial do CEO). A API v3 atual documenta
 * `PUT /v3/subscriptions/{id}` (mesmo verbo do update de webhook em asaasLoja/webhook.ts).
 * `updatePendingPayments: true` aplica o novo valor também às faturas já geradas e não pagas.
 */
export async function updateSubscriptionValue(id: string, value: number): Promise<void> {
  await asaasClient.put(`/subscriptions/${encodeURIComponent(id)}`, {
    value: Number(value.toFixed(2)),
    updatePendingPayments: true,
  });
}

/** Remove a assinatura (e as faturas pendentes dela) no Asaas. */
export async function deleteSubscription(id: string): Promise<void> {
  await asaasClient.delete(`/subscriptions/${encodeURIComponent(id)}`);
}

/** Todas as faturas da assinatura (paginando de 100 em 100). */
export async function listSubscriptionPayments(id: string): Promise<AsaasSubscriptionPayment[]> {
  const out: AsaasSubscriptionPayment[] = [];
  const limit = 100;
  for (let offset = 0; offset < 10000; offset += limit) {
    const page = await asaasClient.get<{ data?: any[]; hasMore?: boolean }>(
      `/subscriptions/${encodeURIComponent(id)}/payments?offset=${offset}&limit=${limit}`,
    );
    for (const p of page?.data || []) {
      out.push({
        id: p.id,
        status: p.status,
        dueDate: p.dueDate,
        value: Number(p.value),
        invoiceUrl: p.invoiceUrl ?? null,
        paymentDate: p.paymentDate ?? null,
        clientPaymentDate: p.clientPaymentDate ?? null,
      });
    }
    if (!page?.hasMore) break;
  }
  return out;
}
