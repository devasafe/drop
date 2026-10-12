/**
 * Prazo do aceite da loja — FONTE ÚNICA do relógio usado pelo job de auto-cancelamento
 * (jobs/storeAcceptTimeout.job.ts) e pelo painel (GET /stores/dashboard).
 *
 * Conta de `paidAt` (a loja tem sempre o tempo inteiro, mesmo com PIX pago perto do fim da
 * validade); pedido anterior à coluna (`paidAt` nulo) conta de `createdAt`.
 * O timeout vem de `PlatformConfig.storeAcceptTimeoutMin` (default 10) — nunca "5 min" fixo.
 */
export const DEFAULT_STORE_ACCEPT_TIMEOUT_MIN = 10;

export function storeAcceptTimeoutMin(config?: { storeAcceptTimeoutMin?: number | null } | null): number {
  return config?.storeAcceptTimeoutMin ?? DEFAULT_STORE_ACCEPT_TIMEOUT_MIN;
}

export function acceptDeadline(order: { paidAt?: Date | null; createdAt: Date }, timeoutMin: number): Date {
  const base = order.paidAt ?? order.createdAt;
  return new Date(new Date(base).getTime() + timeoutMin * 60000);
}

/** Mesmo critério do `where` do job: pago, sem aceite e ainda pré-aceite. */
export function isAwaitingStoreAccept(order: { paymentStatus?: string | null; acceptedAt?: Date | null; status?: string | null }): boolean {
  return order.paymentStatus === 'paid' && !order.acceptedAt && (order.status === 'criado' || order.status === 'pago');
}
