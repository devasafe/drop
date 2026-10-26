import { ReturnReason, ReturnRequest } from '@prisma/client';
import { prisma } from '../lib/prisma';
import logger from '../config/logger';
import { round2 } from './cancellation/shared';
import { requestDirectRefund, executeDirectRefund } from './asaasLoja/refund';

/**
 * Reembolso de pedido entregue (caso B, decidido em 25/10/2026).
 * Valor: defeito ou produto errado = tudo (com a entrega: a culpa é da loja); arrependimento até
 * N dias da entrega (Regras e taxas, padrão 7) = tudo (art. 49 do CDC); depois = só os produtos
 * (a entrega já foi feita). O estorno só sai quando a loja digita o PIN de devolução.
 */

/** Padrão quando a configuração não tem o valor (PlatformConfig.returnFullRefundDays). */
export const RETURN_FULL_REFUND_DAYS = 7;
export const RETURN_PIN_MAX_ATTEMPTS = 5;
export const RETURN_PIN_LOCK_MINUTES = 15;

export const RETURN_REASONS: ReturnReason[] = ['defeito', 'errado', 'arrependimento'];

export const RETURN_REASON_LABEL: Record<ReturnReason, string> = {
  defeito: 'veio com defeito',
  errado: 'veio diferente do pedido',
  arrependimento: 'se arrependeu',
};

/** Motivos fixos da recusa: o cliente vê só a frase, nunca texto livre da loja. */
export const RETURN_REJECT_REASONS: Record<string, string> = {
  usado: 'Produto com marca de uso',
  fora_prazo: 'Fora do prazo',
  sem_defeito: 'Sem defeito na análise',
  outro: 'Outro motivo: o suporte do DROP vai avaliar',
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Valor do estorno pelo motivo e pela data da entrega. `fullRefundDays` vem de Regras e taxas. */
export function returnRefund(
  order: { totalValue?: unknown; deliveryFee?: unknown },
  deliveredAt: Date | null | undefined,
  reason: ReturnReason,
  now: Date = new Date(),
  fullRefundDays: number = RETURN_FULL_REFUND_DAYS,
): { amount: number; includesDeliveryFee: boolean } {
  const total = Number(order?.totalValue) || 0;
  const withinWindow = !deliveredAt || now.getTime() - new Date(deliveredAt).getTime() <= fullRefundDays * DAY_MS;
  if (reason !== 'arrependimento' || withinWindow) return { amount: round2(total), includesDeliveryFee: true };
  return { amount: Math.max(0, round2(total - (Number(order?.deliveryFee) || 0))), includesDeliveryFee: false };
}

/**
 * Forma de API. O PIN de devolução só vai para o cliente que leva na loja, enquanto o produto está
 * voltando. Com motoboy, quem mostra o código à loja é o motoboy (GET /deliveries/:id).
 */
export function serializeReturnRequest(rr: ReturnRequest, viewer: 'customer' | 'store'): Record<string, unknown> {
  const { pin, pinFailedAttempts, pinLockedUntil, ...rest } = rr;
  return {
    ...rest,
    _id: rr.id,
    amount: Number(rr.amount),
    rejectReasonText: rr.rejectReasonCode ? RETURN_REJECT_REASONS[rr.rejectReasonCode] ?? null : null,
    ...(viewer === 'customer' && rr.status === 'devolvendo' && rr.mode !== 'motoboy' ? { pin } : {}),
  };
}

/**
 * Estorno do reembolso pela chave da loja. Nunca lança: a devolução já foi confirmada; uma falha
 * fica 'pending' e o estorno direto segue o caminho de sempre (retentativa e admin).
 */
export async function settleReturnRefund(rr: ReturnRequest, requestedBy: string): Promise<'processed' | 'pending'> {
  try {
    const refund = await requestDirectRefund({ orderId: rr.orderId, cancellationId: null, amount: Number(rr.amount), requestedBy });
    const status = await executeDirectRefund(refund.id);
    return status === 'done' ? 'processed' : 'pending';
  } catch (err) {
    logger.error('Falha ao estornar o reembolso do pedido entregue — escala pro admin', err as Error, { orderId: rr.orderId, returnRequestId: rr.id });
    return 'pending';
  }
}

/** Registra um PIN errado; ao atingir o limite, trava a confirmação por alguns minutos. */
export async function registerReturnPinFailure(id: string): Promise<void> {
  const rr = await prisma.returnRequest.update({ where: { id }, data: { pinFailedAttempts: { increment: 1 } }, select: { pinFailedAttempts: true } });
  if (rr.pinFailedAttempts >= RETURN_PIN_MAX_ATTEMPTS) {
    await prisma.returnRequest.update({
      where: { id },
      data: { pinFailedAttempts: 0, pinLockedUntil: new Date(Date.now() + RETURN_PIN_LOCK_MINUTES * 60000) },
    });
  }
}
