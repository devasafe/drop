import { Request, Response } from 'express';
import env from '../config/env';
import logger from '../config/logger';
import WebhookEvent from '../models/WebhookEvent';
import { confirmOrderPaidByPayment } from '../services/asaas/orderPayment';

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

// Deriva uma chave de idempotência estável mesmo que o corpo não traga `id`.
function deriveEventId(body: any): string | null {
  if (body?.id) return String(body.id);
  const event = body?.event;
  const paymentId = body?.payment?.id;
  const status = body?.payment?.status;
  if (event && paymentId) return `${event}:${paymentId}:${status ?? ''}`;
  return null;
}

export const handleAsaasWebhook = async (req: Request, res: Response) => {
  try {
    // 1. Validação de origem (se o token estiver configurado).
    if (env.ASAAS_WEBHOOK_TOKEN) {
      const token = req.header('asaas-access-token');
      if (token !== env.ASAAS_WEBHOOK_TOKEN) {
        logger.warn('Webhook Asaas rejeitado: token inválido');
        return res.status(401).json({ error: 'invalid webhook token' });
      }
    }

    const body = req.body || {};
    const eventId = deriveEventId(body);
    if (!eventId || !body.event) {
      return res.status(400).json({ error: 'payload de webhook inválido' });
    }

    // 2. Idempotência via insert com índice unique.
    try {
      await WebhookEvent.create({
        provider: 'asaas',
        eventId,
        event: body.event,
        payload: body,
        processed: false,
      });
    } catch (err: any) {
      // E11000 = duplicate key → já recebido. ACK sem reprocessar.
      if (err?.code === 11000) {
        return res.status(200).json({ received: true, duplicate: true });
      }
      throw err;
    }

    // 3. Processamento de negócio (no-op na Fase 0; implementado nas fases 2/3/5).
    await dispatchAsaasEvent(eventId, body);

    return res.status(200).json({ received: true });
  } catch (err) {
    logger.error('Erro ao processar webhook Asaas', err as Error);
    // 500 faz o Asaas re-tentar — o evento já está persistido (idempotente).
    return res.status(500).json({ error: 'erro ao processar webhook' });
  }
};

/**
 * Roteador de eventos do Asaas.
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
    switch (event) {
      case 'PAYMENT_RECEIVED':
      case 'PAYMENT_CONFIRMED':
        if (payment.id) await confirmOrderPaidByPayment(payment.id, payment.status);
        break;
      // Fases seguintes: PAYMENT_REFUNDED, PAYMENT_CHARGEBACK_REQUESTED, etc.
      default:
        // Evento não tratado ainda — fica registrado para auditoria/reprocesso.
        break;
    }
  } catch (err: any) {
    processError = err?.message?.slice(0, 300);
    logger.error('Erro ao processar evento Asaas', err as Error, { eventId, event });
    throw err; // deixa o handler responder 500 → Asaas re-tenta
  } finally {
    await WebhookEvent.updateOne(
      { eventId },
      { processed: !processError, processedAt: new Date(), processError }
    );
  }
}

export default handleAsaasWebhook;
