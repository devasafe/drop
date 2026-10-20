import type { Cancellation } from '@prisma/client';

import type { CancelFault } from '../adminOps/types';

// Uma fonte só (P1): a culpa e os estados canceláveis pelo admin vêm dos tipos do admin, os
// mesmos que o detalhe do pedido usa no allowedActions — a regra e o botão nunca divergem.
export type { CancelFault };
export { ADMIN_CANCELLABLE_STATUSES } from '../adminOps/types';

/**
 * Cancelamento feito pelo admin em nome de uma culpa. Sem ele a regra roda como sempre
 * (cliente, loja ou sistema). Com ele, o Cancellation grava cancelledBy 'admin', faultParty e
 * adminId, e a regra não manda os avisos próprios do ator (o admin manda os seus).
 */
export interface AdminCancelActor {
  adminId: string;
  fault: CancelFault;
}

/** Por que a regra recusou — quem chama traduz (o admin traduz para os códigos da D3b-1). */
export type CancelRefusal = 'NOT_CANCELLABLE' | 'CLAIM_LOST' | 'RETURN_IN_PROGRESS' | 'DELIVERY_CHANGED' | 'MOTOBOY_ACCEPTED';

/** Resultado de uma regra: a resposta HTTP de sempre e o que foi gravado. */
export interface CancelRuleResult {
  status: number;
  body: Record<string, unknown>;
  refusal?: CancelRefusal;
  cancellation?: Cancellation;
  refundAmount?: number;
  refundStatus?: 'pending' | 'processed' | 'failed';
}

/** Campos do Cancellation quando quem cancela é o admin (sobrescrevem cancelledBy). */
export function adminCancellationFields(admin?: AdminCancelActor) {
  return admin ? { cancelledBy: 'admin' as const, faultParty: admin.fault, adminId: admin.adminId } : {};
}
