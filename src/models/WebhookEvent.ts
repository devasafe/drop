import { Schema, model, Document } from 'mongoose';

/**
 * Registro de eventos de webhook recebidos do Asaas.
 *
 * Por que existe: webhooks PODEM chegar duplicados (retry do Asaas, timeout de
 * rede). Processar o mesmo evento 2x = dinheiro duplicado. O índice unique em
 * `eventId` garante idempotência: a 2ª tentativa de inserir o mesmo evento falha
 * e a gente devolve 200 sem reprocessar.
 */
export interface IWebhookEvent extends Document {
  provider: 'asaas';
  eventId: string; // id do evento (ex: "evt_..."), ou chave derivada se ausente
  event: string; // ex: PAYMENT_RECEIVED, PAYMENT_REFUNDED, PAYMENT_CHARGEBACK
  payload: any; // corpo completo do webhook (para auditoria/reprocessamento)
  processed: boolean;
  processedAt?: Date | null;
  processError?: string;
  receivedAt: Date;
}

const WebhookEventSchema = new Schema<IWebhookEvent>({
  provider: { type: String, default: 'asaas', index: true },
  eventId: { type: String, required: true, unique: true },
  event: { type: String, required: true, index: true },
  payload: { type: Schema.Types.Mixed },
  processed: { type: Boolean, default: false, index: true },
  processedAt: { type: Date, default: null },
  processError: { type: String },
  receivedAt: { type: Date, default: Date.now },
});

export default model<IWebhookEvent>('WebhookEvent', WebhookEventSchema);
