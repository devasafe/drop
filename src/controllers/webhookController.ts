import crypto from 'crypto';
import { Request, Response } from 'express';
import env from '../config/env';
import logger from '../config/logger';
import { prisma } from '../lib/prisma';
import { confirmOrderPaidByPayment, markOrderRefunded } from '../services/asaas/orderPayment';
import { creditWalletTopupByPayment } from '../services/asaas/walletTopup';
import { verifyStoreWebhookToken } from '../services/asaasLoja/webhook';
import { markDirectRefundDone } from '../services/asaasLoja/refund';
import { emitAdminNotification } from '../utils/socketEmitter';
import { reconcileTransferFromWebhook } from '../services/asaasLoja/motoboyTransfer';
import { confirmDirectOrderPaid, markDirectOrderRefunded } from '../services/asaasLoja/orderPaymentDirect';
import { handleSaasBillingEvent } from '../services/saasBilling/webhook';

/**
 * Webhook do Asaas — POST /webhooks/asaas
 *
 * Princípios (Fase 0):
 *  1. Validar a origem pelo token (`asaas-access-token`) configurado no painel.
 *  2. Idempotência: persistir o evento com índice unique; duplicado → 200 sem reprocessar.
 *  3. ACK rápido (200): o Asaas pausa a fila e re-tenta se demorar/der erro.
 *
 * O PROCESSAMENTO de negócio (confirmar pagamento, liberar split, estorno,
 * chargeback) é plugado em `dispatchAsaasEvent` nas fases seguintes. Por ora só
 * registra o evento de forma confiável.
 */

// Comparação em tempo constante (não vaza, por tempo de resposta, quantos caracteres
// do token conferem). Comprimentos diferentes → false sem comparar.
export function webhookTokenMatches(received: string | undefined, expected: string): boolean {
  const a = Buffer.from(String(received ?? ''), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Deriva uma chave de idempotência estável mesmo que o corpo não traga `id`.
function deriveEventId(body: any): string | null {
  if (body?.id) return String(body.id);
  const event = body?.event;
  const paymentId = body?.payment?.id;
  const status = body?.payment?.status;
  if (event && paymentId) return `${event}:${paymentId}:${status ?? ''}`;
  const transferId = body?.transfer?.id;
  if (event && transferId) return `${event}:${transferId}:${body?.transfer?.status ?? ''}`;
  return null;
}

export const handleAsaasWebhook = async (req: Request, res: Response) => {
  try {
    // 1. Validação de origem — FAIL CLOSED. Sem token configurado não há como provar
    //    que a chamada veio do Asaas: recusa tudo (antes aceitava qualquer requisição e
    //    permitia marcar pedido como pago sem pagamento). 503 → o Asaas re-tenta depois.
    const expected = env.ASAAS_WEBHOOK_TOKEN;
    if (!expected) {
      logger.error('Webhook Asaas recusado: ASAAS_WEBHOOK_TOKEN não configurado');
      return res.status(503).json({ error: 'webhook not configured' });
    }
    if (!webhookTokenMatches(req.header('asaas-access-token'), expected)) {
      logger.warn('Webhook Asaas rejeitado: token inválido');
      return res.status(401).json({ error: 'invalid webhook token' });
    }

    return await processAsaasEvent(req.body || {}, { provider: 'asaas' }, res);
  } catch (err) {
    logger.error('Erro ao processar webhook Asaas', err as Error);
    // 500 faz o Asaas re-tentar — o evento já está persistido (idempotente).
    return res.status(500).json({ error: 'erro ao processar webhook' });
  }
};

type EventSource =
  | { provider: 'asaas' }
  | { provider: 'asaas_loja'; storeId: string };

/**
 * Núcleo comum dos webhooks do Asaas (custódia e por loja), DEPOIS da autenticação:
 *  1. valida o payload mínimo;
 *  2. idempotência por insert em `WebhookEvent` (eventId @unique) — duplicado → 200;
 *  3. roteia para o processamento da origem e responde 200.
 *
 * Chave de idempotência: na custódia é o `event.id` cru (comportamento original). Por
 * loja é `loja:<storeId>:<event.id>` — `WebhookEvent.eventId` é unique GLOBAL e os ids
 * vêm de contas Asaas diferentes, então o prefixo impede que o evento de uma loja seja
 * tomado como "duplicado" de outra (e o id derivado `EVENTO:pay:status` não colide).
 */
async function processAsaasEvent(body: any, source: EventSource, res: Response) {
  const rawId = deriveEventId(body);
  if (!rawId || !body.event) {
    return res.status(400).json({ error: 'payload de webhook inválido' });
  }
  const eventId = source.provider === 'asaas_loja' ? `loja:${source.storeId}:${rawId}` : rawId;

  try {
    await prisma.webhookEvent.create({
      data: { provider: source.provider, eventId, event: body.event, payload: body, processed: false },
    });
  } catch (err: any) {
    // P2002 = violação de unique (eventId) → já recebido. ACK sem reprocessar.
    if (err?.code !== 'P2002') throw err;
    // Por loja, um evento gravado cuja execução FALHOU (processed=false) é reprocessado na
    // re-tentativa do Asaas — seguro porque a confirmação/estorno são updateMany
    // condicionais. A custódia mantém o comportamento original (duplicado = ACK).
    const prev = source.provider === 'asaas_loja'
      ? await prisma.webhookEvent.findUnique({ where: { eventId }, select: { processed: true, processError: true } })
      : null;
    if (!prev || prev.processed || !prev.processError) {
      return res.status(200).json({ received: true, duplicate: true });
    }
  }

  if (source.provider === 'asaas_loja') await dispatchStoreAsaasEvent(eventId, source.storeId, body);
  else await dispatchAsaasEvent(eventId, body);

  return res.status(200).json({ received: true });
}

/**
 * Webhook da conta Asaas DA LOJA — POST /webhooks/asaas/loja/:storeId (modo SaaS direto).
 * Autentica pelo token próprio da loja (só o SHA-256 fica no banco). Qualquer falha de
 * autenticação — loja inexistente, sem conta, sem hash, header ausente, token errado —
 * devolve a MESMA resposta 401, para não revelar quais lojas existem.
 */
export const handleStoreAsaasWebhook = async (req: Request, res: Response) => {
  try {
    const storeId = String(req.params.storeId || '');
    const ok = await verifyStoreWebhookToken(storeId, req.header('asaas-access-token'), 'payment');
    if (!ok) {
      logger.warn('Webhook Asaas da loja rejeitado: token inválido');
      return res.status(401).json({ error: 'invalid webhook token' });
    }
    return await processAsaasEvent(req.body || {}, { provider: 'asaas_loja', storeId }, res);
  } catch (err) {
    logger.error('Erro ao processar webhook Asaas da loja', err as Error);
    return res.status(500).json({ error: 'erro ao processar webhook' });
  }
};

/**
 * Eventos da conta da loja. Nada aqui toca carteira/Payout (sem custódia).
 *  - PAYMENT_RECEIVED / PAYMENT_CONFIRMED → pedido pago (só se for DESTA loja);
 *  - PAYMENT_REFUNDED → pedido estornado (só se for desta loja);
 *  - PAYMENT_PARTIALLY_REFUNDED → conclui o DirectRefund só se o valor estornado bater;
 *  - TRANSFER_DONE / TRANSFER_FAILED / TRANSFER_CANCELLED → Pix da loja ao motoboy (MotoboyTransfer);
 *  - PAYMENT_REFUND_IN_PROGRESS e demais → registrados e ignorados.
 */
/** O Asaas confirmou o estorno: fecha o DirectRefund (se for desta loja e ainda em aberto). */
async function reconcileDirectRefundFromWebhook(storeId: string, paymentId: string): Promise<void> {
  const refund = await prisma.directRefund.findFirst({
    where: { storeId, asaasPaymentId: paymentId, status: { in: ['uncertain', 'failed', 'requested', 'pending'] } },
    select: { orderId: true },
  });
  if (refund) await markDirectRefundDone(refund.orderId, 'webhook');
  else await alertFinalRefundConfirmed(storeId, paymentId, 'PAYMENT_REFUNDED');
}

/**
 * M-a: estorno confirmado pelo Asaas para um DirectRefund em `failed_final` (o admin assumiu).
 * Não conclui sozinho — o admin confere e resolve —, mas avisa (antes era silencioso).
 */
async function alertFinalRefundConfirmed(storeId: string, paymentId: string, event: string): Promise<void> {
  const row = await prisma.directRefund.findFirst({
    where: { storeId, asaasPaymentId: paymentId, status: 'failed_final' },
    select: { id: true, orderId: true },
  });
  if (!row) return;
  logger.warn('[asaasLoja] estorno confirmado pelo Asaas com DirectRefund em failed_final (não concluído)', { storeId, paymentId, refundId: row.id, event });
  emitAdminNotification({
    title: 'Estorno confirmado no Asaas (falha final)',
    body: `Pedido ${String(row.orderId).slice(-6)}: o Asaas confirmou um estorno (${event}) de uma linha em falha final; conferir e resolver.`,
    url: '/admin/estornos',
    tag: `refund:final-confirmed:${row.id}`,
  });
}

/**
 * Estorno parcial confere com o DirectRefund? CONFIRMAR NO SANDBOX o formato do
 * PAYMENT_PARTIALLY_REFUNDED. Regras (fail closed):
 *  - com `payment.refunds[]`: só itens com status DONE e valor > 0 contam; se a linha já tem o
 *    id do estorno vinculado pela trava (asaasRefundId), o item precisa ter o MESMO id;
 *  - sem `refunds[]`: usa `payment.refundedValue` (> 0), só se a linha não tem id vinculado;
 *  - nunca `payment.value` (é o valor original da cobrança).
 */
function partialRefundMatches(payment: any, expectedCents: number, boundRefundId: string | null): boolean {
  const cents = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
  };
  if (Array.isArray(payment?.refunds)) {
    return payment.refunds.some((r: any) =>
      String(r?.status ?? '').toUpperCase() === 'DONE'
      && cents(r?.value) === expectedCents
      && (!boundRefundId || String(r?.id ?? '') === boundRefundId));
  }
  if (boundRefundId) return false; // sem refunds[] não há como conferir o id vinculado
  return cents(payment?.refundedValue) === expectedCents;
}

async function reconcilePartialRefundFromWebhook(storeId: string, payment: any): Promise<void> {
  const paymentId = String(payment.id);
  const refund = await prisma.directRefund.findFirst({
    where: { storeId, asaasPaymentId: paymentId, status: { in: ['uncertain', 'failed', 'requested', 'pending'] } },
    select: { id: true, orderId: true, amount: true, asaasRefundId: true },
  });
  if (!refund) {
    await alertFinalRefundConfirmed(storeId, paymentId, 'PAYMENT_PARTIALLY_REFUNDED');
    return;
  }
  const expected = Math.round(Number(refund.amount) * 100);
  if (partialRefundMatches(payment, expected, refund.asaasRefundId ?? null)) {
    await markDirectRefundDone(refund.orderId, 'webhook');
    return;
  }
  logger.warn('[asaasLoja] estorno parcial sem valor correspondente ao DirectRefund (ignorado)', { storeId, paymentId, refundId: refund.id });
  emitAdminNotification({
    title: 'Estorno parcial sem valor conferido',
    body: `Pedido ${String(refund.orderId).slice(-6)}: o Asaas avisou estorno parcial sem o valor esperado; conferir no Asaas.`,
    url: '/admin/estornos',
    tag: `refund:partial:${refund.id}`,
  });
}

async function dispatchStoreAsaasEvent(eventId: string, storeId: string, body: any): Promise<void> {
  const event = body.event as string;
  const payment = body.payment || {};
  logger.info('Webhook Asaas da loja recebido', { eventId, storeId, event, paymentId: payment.id, status: payment.status });

  let processError: string | undefined;
  try {
    switch (event) {
      case 'PAYMENT_RECEIVED':
      case 'PAYMENT_CONFIRMED':
        if (payment.id) await confirmDirectOrderPaid(storeId, String(payment.id), payment.status || (event === 'PAYMENT_CONFIRMED' ? 'CONFIRMED' : 'RECEIVED'));
        break;
      case 'PAYMENT_REFUNDED':
        if (payment.id) {
          await markDirectOrderRefunded(storeId, String(payment.id));
          await reconcileDirectRefundFromWebhook(storeId, String(payment.id));
        }
        break;
      case 'PAYMENT_PARTIALLY_REFUNDED':
        // Nunca marca o pedido inteiro como estornado sem conferir o valor (markDirectRefundDone faz isso).
        if (payment.id) await reconcilePartialRefundFromWebhook(storeId, payment);
        break;
      case 'TRANSFER_DONE':
      case 'TRANSFER_FAILED':
      case 'TRANSFER_CANCELLED':
        await reconcileTransferFromWebhook(storeId, event, body.transfer || {});
        break;
      default:
        break;
    }
  } catch (err: any) {
    // Sempre uma string não vazia: erro sem `message` (ex.: throw 'x') não pode virar
    // processed=true e perder o evento.
    processError = String(err?.message || err || 'erro').slice(0, 300) || 'erro';
    logger.error('Erro ao processar evento Asaas da loja', err as Error, { eventId, storeId, event });
    throw err;
  } finally {
    await prisma.webhookEvent.updateMany({
      where: { eventId },
      // Sucesso (inclusive reprocessamento) limpa o erro anterior.
      data: { processed: !processError, processedAt: new Date(), processError: processError ?? null },
    });
  }
}

/**
 * Roteador de eventos do Asaas.
 *  - fatura da mensalidade SaaS (assinatura na conta-mãe) → handleSaasBillingEvent, e PARA aí;
 *  - PAYMENT_RECEIVED / PAYMENT_CONFIRMED → confirma pedido pago + cria Payout (Fase 2)
 *  - PAYMENT_REFUNDED → estorno (Fase 5) [TODO]
 *  - PAYMENT_CHARGEBACK* → reserva/débito (Fase 6) [TODO]
 */
async function dispatchAsaasEvent(eventId: string, body: any): Promise<void> {
  const event = body.event as string;
  const payment = body.payment || {};
  logger.info('Webhook Asaas recebido', { eventId, event, paymentId: payment.id, status: payment.status });

  let processError: string | undefined;
  try {
    // Mensalidade SaaS primeiro: uma fatura da assinatura nunca pode ser tratada como pedido/recarga.
    if (await handleSaasBillingEvent(event, payment)) return;

    switch (event) {
      case 'PAYMENT_RECEIVED':
      case 'PAYMENT_CONFIRMED':
        // O payment.id pode ser de um PEDIDO ou de uma RECARGA de carteira.
        // Cada handler é no-op se não corresponder ao seu tipo.
        if (payment.id) {
          await confirmOrderPaidByPayment(payment.id, payment.status);
          await creditWalletTopupByPayment(payment.id);
        }
        break;
      case 'PAYMENT_REFUNDED':
        if (payment.id) await markOrderRefunded(payment.id);
        break;
      // Fase 6: PAYMENT_CHARGEBACK_REQUESTED, etc.
      default:
        // Evento não tratado ainda — fica registrado para auditoria/reprocesso.
        break;
    }
  } catch (err: any) {
    processError = err?.message?.slice(0, 300);
    logger.error('Erro ao processar evento Asaas', err as Error, { eventId, event });
    throw err; // deixa o handler responder 500 → Asaas re-tenta
  } finally {
    await prisma.webhookEvent.updateMany({
      where: { eventId },
      data: { processed: !processError, processedAt: new Date(), processError },
    });
  }
}

export default handleAsaasWebhook;
