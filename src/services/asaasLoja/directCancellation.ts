import { Prisma, Cancellation, MotoboyTransfer } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import logger from '../../config/logger';
import type { CancellationFeeResult } from '../../utils/cancellationFee';
import { isDirectOrder } from '../../utils/settlement';
import { requestDirectRefund, executeDirectRefund } from './refund';
import { emitAdminNotification } from '../../utils/socketEmitter';
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

/** Alerta (dinheiro inconsistente): a entrega já tem transferência e a compensação não foi criada. */
function alertSkippedCompensation(c: CancellationCompensation, existing: MotoboyTransfer): void {
  try {
    const valor = Number(c.motoboyShare).toFixed(2).replace('.', ',');
    emitAdminNotification({
      title: 'Compensação do motoboy não registrada',
      body: `Pedido ${String(c.order.id).slice(-6)}: a entrega já tem transferência (${existing.reason}, ${existing.status}); `
        + `compensação de R$ ${valor} do cancelamento não foi criada — conferir.`,
      url: '/admin/transfers',
      tag: `motoboy-transfer-${existing.id}`,
    });
  } catch (err) {
    logger.error('[directCancellation] falha ao alertar o admin', err as Error, { orderId: c.order.id });
  }
}

/**
 * Compensação do motoboy num cancelamento do pedido direto: registra a MotoboyTransfer
 * (reason 'cancellation_compensation', valor = motoboyShare) pela mesma criação da 2.1
 * (snapshot da chave Pix, teto por transferência). Só registra; o envio é do job (2.3).
 *
 * Só cria para pedido direto (modo de nascimento, P15), com entrega e motoboy atribuído e
 * motoboyShare > 0 (em centavos). Idempotente: 1 transferência por entrega (unique em
 * deliveryId) — se já existe, não cria outra, alerta o admin e devolve null.
 * Deve rodar DENTRO da transação que grava o cancelamento. `afterCommit` recebe os avisos
 * para depois do commit; sem ele, o aviso sai na hora.
 */
export async function createCancellationCompensation(
  tx: Prisma.TransactionClient,
  c: CancellationCompensation,
  afterCommit?: Array<() => void>,
): Promise<MotoboyTransfer | null> {
  if (!isDirectOrder(c.order) || !c.deliveryId || !c.motoboyId) return null;
  if (Math.round(Number(c.motoboyShare) * 100) <= 0) return null;

  const existing = await tx.motoboyTransfer.findUnique({ where: { deliveryId: String(c.deliveryId) } });
  if (existing) {
    logger.warn('[directCancellation] entrega já tem transferência ao motoboy — compensação não duplicada', {
      orderId: c.order.id, deliveryId: c.deliveryId, transferId: existing.id, reason: existing.reason,
    });
    const notice = () => alertSkippedCompensation(c, existing);
    if (afterCommit) afterCommit.push(notice);
    else notice();
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

/** Outro request já levou o pedido para fora dos estados canceláveis (a trava não pegou). */
export class CancellationClaimLostError extends Error {
  constructor(orderId: string) {
    super(`Pedido ${orderId} já foi cancelado ou está em processamento`);
    this.name = 'CancellationClaimLostError';
  }
}

/** Trava do pedido feita DENTRO da transação do registro (pedido direto). */
export interface CancellationClaim {
  orderId: string;
  from: string[];
  to: 'cancelado' | 'rejeitado';
  /** Itens a devolver ao estoque (uma única vez, junto com a trava). */
  restock?: Array<{ productId?: unknown; quantity?: unknown }>;
}

type CompensationSource =
  | CancellationCompensation
  // eslint-disable-next-line no-unused-vars -- nome do parâmetro de tipo, não variável
  | ((tx: Prisma.TransactionClient) => Promise<CancellationCompensation | null>)
  | null
  | undefined;

/**
 * Grava o Cancellation e, no pedido direto, a compensação do motoboy NA MESMA transação:
 * se uma falhar, nenhuma das duas fica. Com `claim`, a trava condicional do pedido
 * (status → cancelado/rejeitado), a devolução de estoque e o vínculo `cancellationId` também
 * entram na transação: uma falha desfaz tudo e o pedido continua cancelável (o estorno nunca
 * fica perdido atrás de um 409). Trava perdida → CancellationClaimLostError.
 * `compensation` pode ser uma função do `tx` (lida depois da trava).
 * Os avisos (transferência criada / compensação pulada) saem depois do commit.
 */
export async function recordCancellationWithCompensation(
  data: Prisma.CancellationUncheckedCreateInput,
  compensation?: CompensationSource,
  claim?: CancellationClaim,
): Promise<{ cancellation: Cancellation; transfer: MotoboyTransfer | null }> {
  const afterCommit: Array<() => void> = [];
  const result = await prisma.$transaction(async (tx) => {
    if (claim) {
      const { count } = await tx.order.updateMany({
        where: { id: claim.orderId, status: { in: claim.from as any } },
        data: { status: claim.to, cancelledAt: new Date() },
      });
      if (count !== 1) throw new CancellationClaimLostError(claim.orderId);
      for (const it of claim.restock ?? []) {
        if (it?.productId && it?.quantity) {
          await tx.product.updateMany({ where: { id: String(it.productId) }, data: { quantity: { increment: Number(it.quantity) } } });
        }
      }
    }
    const cancellation = await tx.cancellation.create({ data });
    if (claim) await tx.order.update({ where: { id: claim.orderId }, data: { cancellationId: cancellation.id } });
    const comp = typeof compensation === 'function' ? await compensation(tx) : compensation;
    const transfer = comp ? await createCancellationCompensation(tx, comp, afterCommit) : null;
    return { cancellation, transfer };
  });
  if (result.transfer) {
    logger.info('[directCancellation] compensação do motoboy registrada', {
      orderId: result.transfer.orderId, transferId: result.transfer.id, status: result.transfer.status,
    });
    notifyTransferCreated(result.transfer);
  }
  for (const notice of afterCommit) notice();
  return result;
}
