import { Prisma, DirectRefund } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import asaasClient, { AsaasApiError } from '../asaas/client';
import { AppError } from '../../utils/AppError';
import logger from '../../config/logger';
import { emitToRoom, emitAdminNotification } from '../../utils/socketEmitter';
import { storeKey, translate, StorePaymentsNotReadyError } from './charge';

/**
 * Estorno de pedido no modo SaaS "direto": POST /payments/{id}/refund com a chave da
 * conta Asaas DA LOJA. Sem custódia, sem carteira.
 *
 * Fail closed: resposta incerta (timeout, rede, 5xx) vira 'uncertain' e NUNCA é reenviada
 * às cegas (o Asaas pode ter estornado). Só o admin resolve (ou o webhook PAYMENT_REFUNDED).
 * A chave da loja nunca vai para log, erro ou socket.
 */

export type DirectRefundStatus = 'pending' | 'requested' | 'done' | 'failed' | 'failed_final' | 'uncertain';

/** P5: espera depois da 1ª..5ª falha (5 min, 15 min, 1 h, 3 h, 6 h). A 6ª falha é final. */
const MIN_MS = 60 * 1000;
export const DIRECT_REFUND_BACKOFF_MS = [5 * MIN_MS, 15 * MIN_MS, 60 * MIN_MS, 180 * MIN_MS, 360 * MIN_MS];
export const DIRECT_REFUND_RETRY_MS = DIRECT_REFUND_BACKOFF_MS[0];

const cents = (v: unknown) => Math.round(Number(v) * 100);

/**
 * Status do Asaas que indicam estorno AINDA EM ANDAMENTO (pagamento ou item de `refunds[]`).
 * CONFIRMAR NO SANDBOX o formato exato da resposta de POST /payments/{id}/refund.
 */
const REFUND_IN_PROGRESS_STATUSES = new Set([
  'REFUND_IN_PROGRESS', 'REFUND_REQUESTED', 'PENDING',
  'AWAITING_AUTHORIZATION', 'AWAITING_CRITICAL_ACTION_AUTHORIZATION', 'AWAITING_CUSTOMER_EXTERNAL_AUTHORIZATION',
]);

/**
 * R20: a resposta 200 só conclui o estorno se não indicar andamento. Status explícito de
 * andamento → fica `requested` com `acceptedAt` e o webhook PAYMENT_REFUNDED conclui.
 * Resposta sem status (ou REFUNDED/DONE) → `done` como antes (a confirmar no sandbox).
 */
export function refundResponseInProgress(response: any): boolean {
  const up = (v: unknown) => (typeof v === 'string' ? v.trim().toUpperCase() : '');
  const refunds: any[] = Array.isArray(response?.refunds) ? response.refunds : [];
  const last = refunds.length ? refunds[refunds.length - 1] : null;
  const refundStatus = up(last?.status);
  if (refundStatus) return REFUND_IN_PROGRESS_STATUSES.has(refundStatus);
  return REFUND_IN_PROGRESS_STATUSES.has(up(response?.status));
}

/** Cria (ou devolve) o estorno do pedido direto. Idempotente por pedido. */
export async function requestDirectRefund(params: {
  orderId: string;
  cancellationId: string | null;
  amount: number;
  requestedBy: string;
}): Promise<DirectRefund> {
  const { orderId, cancellationId, amount, requestedBy } = params;

  const existing = await prisma.directRefund.findUnique({ where: { orderId } });
  if (existing) {
    if (cents(existing.amount) !== cents(amount)) {
      logger.warn('[asaasLoja] estorno direto já existe com valor diferente do pedido — mantida a linha existente', {
        orderId, existingAmount: Number(existing.amount), requestedAmount: Number(amount),
      });
    }
    return existing;
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, storeId: true, totalValue: true, paymentProvider: true, paymentStatus: true, asaasPaymentId: true },
  });
  if (!order) throw new AppError('Pedido não encontrado', 404, true, 'ORDER_NOT_FOUND');
  if (order.paymentProvider !== 'asaas_loja' || !order.asaasPaymentId) {
    throw new AppError('Pedido não é do modo direto', 400, true, 'REFUND_NOT_DIRECT');
  }
  if (order.paymentStatus !== 'paid') {
    throw new AppError('Pedido não está pago', 400, true, 'REFUND_NOT_PAID');
  }
  if (!Number.isFinite(amount) || cents(amount) <= 0) {
    throw new AppError('Valor do estorno inválido', 400, true, 'REFUND_INVALID_AMOUNT');
  }
  if (cents(amount) > cents(order.totalValue)) {
    throw new AppError('Valor do estorno maior que o total do pedido', 400, true, 'REFUND_AMOUNT_EXCEEDS_TOTAL');
  }

  try {
    return await prisma.directRefund.create({
      data: {
        orderId, cancellationId, storeId: order.storeId, asaasPaymentId: order.asaasPaymentId,
        amount: new Prisma.Decimal(cents(amount)).div(100), requestedBy,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.directRefund.findUnique({ where: { orderId } });
      if (winner) return winner;
    }
    throw err;
  }
}

/** Estorno concluído (api, webhook ou admin). Idempotente: só a primeira chamada devolve true. */
export async function markDirectRefundDone(
  orderId: string,
  source: 'api' | 'webhook' | 'admin',
  opts: { actorId?: string; note?: string } = {},
): Promise<boolean> {
  const resolvedBy = opts.actorId ? `${source}:${opts.actorId}` : source;
  const done = await prisma.$transaction(async (tx) => {
    const { count } = await tx.directRefund.updateMany({
      where: { orderId, status: { not: 'done' } },
      data: {
        status: 'done', doneAt: new Date(), resolvedBy, lastError: null,
        ...(opts.note ? { resolutionNote: opts.note } : {}),
      },
    });
    if (count !== 1) return null;
    const row = await tx.directRefund.findUnique({ where: { orderId }, select: { cancellationId: true } });
    if (row?.cancellationId) {
      await tx.cancellation.updateMany({ where: { id: row.cancellationId }, data: { refundStatus: 'processed' } });
    }
    await tx.order.updateMany({ where: { id: orderId }, data: { paymentStatus: 'refunded', asaasChargeStatus: 'refunded' } });
    return true;
  });
  return done === true;
}

type RefundAlert = 'refund:failed' | 'refund:uncertain' | 'refund:failed_final';

const ADMIN_ALERT: Record<RefundAlert, { title: string; body: string }> = {
  'refund:failed': { title: 'Estorno recusado pelo Asaas', body: 'nova tentativa automática agendada.' },
  'refund:failed_final': { title: 'Estorno esgotou as tentativas', body: 'reabrir ou resolver em Estornos.' },
  'refund:uncertain': { title: 'Estorno com resultado incerto', body: 'conferir no Asaas antes de qualquer reenvio.' },
};

/**
 * Alerta do estorno. O admin recebe `admin:notification` + push (o painel escuta esse evento);
 * o evento `refund:*` segue para as salas pedidas (compatibilidade). Quem chama só notifica se
 * o `updateMany` da transição deu count === 1 (M9).
 */
function notify(storeId: string, event: RefundAlert, orderId: string, refundId: string, rooms: Array<'store' | 'admin'>) {
  const payload = { refundId, orderId, storeId };
  for (const r of rooms) emitToRoom(r === 'store' ? `store:${storeId}` : 'admin', event, payload);
  if (rooms.includes('admin')) {
    const a = ADMIN_ALERT[event];
    try {
      emitAdminNotification({
        title: a.title,
        body: `Pedido ${String(orderId).slice(-6)}: ${a.body}`,
        url: '/admin/estornos',
        tag: `${event}:${refundId}`,
      });
    } catch (err) {
      logger.warn('[asaasLoja] falha ao alertar o admin sobre o estorno', { refundId, orderId, error: (err as Error)?.message });
    }
  }
}

/** Alerta de estorno para quem já fez a transição condicional (ex.: reaper do job). */
export function notifyDirectRefund(storeId: string, event: RefundAlert, orderId: string, refundId: string, rooms: Array<'store' | 'admin'>) {
  notify(storeId, event, orderId, refundId, rooms);
}

async function currentStatus(refundId: string): Promise<DirectRefundStatus> {
  const row = await prisma.directRefund.findUnique({ where: { id: refundId }, select: { status: true } });
  return (row?.status ?? 'uncertain') as DirectRefundStatus;
}

/** Claim atômico + chamada ao Asaas com a chave da loja. */
export async function executeDirectRefund(refundId: string): Promise<DirectRefundStatus> {
  const current = await prisma.directRefund.findUnique({ where: { id: refundId } });
  if (!current) throw new AppError('Estorno não encontrado', 404, true, 'REFUND_NOT_FOUND');

  const { count } = await prisma.directRefund.updateMany({
    where: { id: refundId, status: { in: ['pending', 'failed'] } },
    data: { status: 'requested', attempts: { increment: 1 }, acceptedAt: null },
  });
  if (count !== 1) {
    const now = await prisma.directRefund.findUnique({ where: { id: refundId }, select: { status: true } });
    return (now?.status ?? current.status) as DirectRefundStatus; // outro processo pegou ou já terminou
  }

  const claimed = await prisma.directRefund.findUnique({ where: { id: refundId }, select: { attempts: true } });
  const attempts = claimed?.attempts ?? current.attempts + 1;
  const { orderId, storeId, asaasPaymentId } = current;
  const amount = Number(current.amount);

  let response: any;
  try {
    const apiKey = await storeKey(storeId); // conta ausente/invalid → StorePaymentsNotReadyError (falha definida, nada enviado)
    try {
      response = await asaasClient.postAs(apiKey, `/payments/${encodeURIComponent(asaasPaymentId)}/refund`, {
        value: amount,
        description: `Estorno do pedido ${orderId}`,
      });
    } catch (err) {
      throw await translate(storeId, err);
    }
  } catch (err) {
    const definite = err instanceof StorePaymentsNotReadyError
      || (err instanceof AsaasApiError && err.status >= 400 && err.status < 500);
    if (definite) {
      const message = err instanceof AsaasApiError
        ? (err.errors?.[0]?.description || err.message)
        : (err as Error).message;
      const backoff = DIRECT_REFUND_BACKOFF_MS[attempts - 1];
      if (backoff === undefined) {
        // 6ª falha: sem nova retentativa, o admin resolve.
        const { count } = await prisma.directRefund.updateMany({
          where: { id: refundId, status: 'requested' },
          data: { status: 'failed_final', lastError: String(message).slice(0, 500) },
        });
        if (count !== 1) return currentStatus(refundId); // outro caminho (webhook/admin) já mudou a linha
        logger.warn('[asaasLoja] estorno direto esgotou as tentativas', { refundId, orderId, storeId, attempts });
        notify(storeId, 'refund:failed_final', orderId, refundId, ['admin']);
        return 'failed_final';
      }
      const { count } = await prisma.directRefund.updateMany({
        where: { id: refundId, status: 'requested' },
        data: { status: 'failed', lastError: String(message).slice(0, 500), nextAttemptAt: new Date(Date.now() + backoff) },
      });
      if (count !== 1) return currentStatus(refundId);
      logger.warn('[asaasLoja] estorno direto recusado', { refundId, orderId, storeId, status: (err as any)?.status });
      notify(storeId, 'refund:failed', orderId, refundId, ['store', 'admin']);
      return 'failed';
    }
    const { count } = await prisma.directRefund.updateMany({
      where: { id: refundId, status: 'requested' },
      data: { status: 'uncertain', lastError: 'UNCERTAIN' },
    });
    if (count !== 1) return currentStatus(refundId);
    logger.error('[asaasLoja] estorno direto com resposta incerta — NÃO reenviar sem conferir no Asaas', err as Error, { refundId, orderId, storeId });
    notify(storeId, 'refund:uncertain', orderId, refundId, ['admin']);
    return 'uncertain';
  }

  if (refundResponseInProgress(response)) {
    // Aceito, mas ainda em andamento no Asaas (a trava de autorização pode nem ter sido
    // chamada): não dá como estornado. O webhook PAYMENT_REFUNDED conclui; o reaper só
    // marca incerto depois de ACCEPTED_REFUND_MAX_MS.
    await prisma.directRefund.updateMany({ where: { id: refundId, status: 'requested' }, data: { acceptedAt: new Date() } });
    logger.info('[asaasLoja] estorno direto aceito e em andamento no Asaas', { refundId, orderId, storeId, status: response?.status ?? null });
    return 'requested';
  }

  try {
    await markDirectRefundDone(orderId, 'api');
  } catch (err) {
    // O Asaas já estornou, mas o banco não registrou: trava em 'uncertain' para o admin conferir.
    // 'moved' = esta chamada marcou incerto; 'lost' = outro caminho já mudou a linha;
    // 'error' = nem o incerto foi gravado (o admin precisa saber: o dinheiro já saiu).
    const outcome = await prisma.directRefund.updateMany({ where: { id: refundId, status: 'requested' }, data: { status: 'uncertain', lastError: 'UNCERTAIN' } })
      .then((r) => (r.count === 1 ? 'moved' : 'lost'))
      .catch(() => 'error');
    logger.error('[asaasLoja] estorno feito no Asaas mas falhou ao registrar', err as Error, { refundId, orderId, storeId });
    if (outcome === 'lost') return currentStatus(refundId).catch(() => 'uncertain' as DirectRefundStatus);
    notify(storeId, 'refund:uncertain', orderId, refundId, ['admin']);
    return 'uncertain';
  }
  return 'done';
}
