import { Prisma, Cancellation, MotoboyTransfer } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import logger from '../../config/logger';
import type { CancellationFeeResult } from '../../utils/cancellationFee';
import { isDirectOrder } from '../../utils/settlement';
import { requestDirectRefund, executeDirectRefund } from './refund';
import { createTransferForDelivery, notifyTransferCreated } from './motoboyTransfer';

export type DirectCancellationFlow = 'customer' | 'customer_absent' | 'store' | 'full';

const round2 = (n: number) => Math.round(Number(n) * 100) / 100;

/**
 * Quanto devolver ao cliente num cancelamento do pedido direto.
 *  - customer_absent: total - taxa de entrega (P1; a entrega cheia fica com o motoboy), ignora o fee.
 *  - full: o total do pedido (a culpa não é do cliente).
 *  - customer / store: fee.refundToCustomer (já descontada a taxa, se houver).
 * Arredondado a 2 casas e nunca negativo.
 */
export function directCustomerRefund(
  order: { totalValue?: unknown; deliveryFee?: unknown },
  fee: Pick<CancellationFeeResult, 'refundToCustomer'> | null | undefined,
  flow: DirectCancellationFlow,
): number {
  const total = Number(order?.totalValue) || 0;
  let value: number;
  if (flow === 'customer_absent') value = total - (Number(order?.deliveryFee) || 0);
  else if (flow === 'full') value = total;
  else value = Number(fee?.refundToCustomer) || 0;
  return Math.max(0, round2(value));
}

/**
 * Pede e executa o estorno do pedido direto DEPOIS de o cancelamento estar gravado.
 * Nunca lança: o cancelamento não depende do Asaas. 'processed' só se o estorno terminou 'done'.
 */
export async function settleDirectRefund(params: {
  orderId: string;
  cancellationId: string;
  amount: number;
  requestedBy: string;
}): Promise<'pending' | 'processed'> {
  try {
    const refund = await requestDirectRefund(params);
    const status = await executeDirectRefund(refund.id);
    return status === 'done' ? 'processed' : 'pending';
  } catch (err) {
    logger.error('Falha ao estornar pedido direto no cancelamento — escala pro admin', err as Error, { orderId: params.orderId });
    return 'pending';
  }
}

export interface CancellationCompensation {
  order: { id: string; storeId: string; paymentProvider?: string | null };
  deliveryId: string | null | undefined;
  motoboyId: string | null | undefined;
  /** `calculateCancellationFee(...).motoboyShare` — nunca recalculado aqui. */
  motoboyShare: number;
}

/**
 * Compensação do motoboy num cancelamento do pedido direto: registra a MotoboyTransfer
 * (reason 'cancellation_compensation', valor = motoboyShare) pela mesma criação da 2.1
 * (snapshot da chave Pix, teto por transferência). Só registra; o envio é do job (2.3).
 *
 * Só cria para pedido direto (modo de nascimento, P15), com entrega e motoboy atribuído e
 * motoboyShare > 0 (em centavos). Idempotente: 1 transferência por entrega (unique em
 * deliveryId) — se já existe, não cria outra e devolve null.
 * Deve rodar DENTRO da transação que grava o cancelamento.
 */
export async function createCancellationCompensation(
  tx: Prisma.TransactionClient,
  c: CancellationCompensation,
): Promise<MotoboyTransfer | null> {
  if (!isDirectOrder(c.order) || !c.deliveryId || !c.motoboyId) return null;
  if (Math.round(Number(c.motoboyShare) * 100) <= 0) return null;

  const existing = await tx.motoboyTransfer.findUnique({ where: { deliveryId: String(c.deliveryId) } });
  if (existing) {
    logger.warn('[directCancellation] entrega já tem transferência ao motoboy — compensação não duplicada', {
      orderId: c.order.id, deliveryId: c.deliveryId, transferId: existing.id, reason: existing.reason,
    });
    return null;
  }

  return createTransferForDelivery(
    tx,
    { id: String(c.deliveryId), motoboyId: String(c.motoboyId), fee: 0 },
    { id: String(c.order.id), storeId: String(c.order.storeId) },
    'cancellation_compensation',
    Number(c.motoboyShare),
  );
}

/**
 * Grava o Cancellation e, no pedido direto, a compensação do motoboy NA MESMA transação:
 * se uma falhar, nenhuma das duas fica. Os avisos da transferência saem depois do commit.
 * Para pedido de custódia (ou sem compensação) é só a criação do Cancellation.
 */
export async function recordCancellationWithCompensation(
  data: Prisma.CancellationUncheckedCreateInput,
  compensation?: CancellationCompensation | null,
): Promise<{ cancellation: Cancellation; transfer: MotoboyTransfer | null }> {
  const result = await prisma.$transaction(async (tx) => {
    const cancellation = await tx.cancellation.create({ data });
    const transfer = compensation ? await createCancellationCompensation(tx, compensation) : null;
    return { cancellation, transfer };
  });
  if (result.transfer) {
    logger.info('[directCancellation] compensação do motoboy registrada', {
      orderId: result.transfer.orderId, transferId: result.transfer.id, status: result.transfer.status,
    });
    notifyTransferCreated(result.transfer);
  }
  return result;
}
