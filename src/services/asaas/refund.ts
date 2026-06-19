import asaasClient from './client';
import logger from '../../config/logger';

/**
 * Estorno real de uma cobrança no Asaas (Fase 5 — resolve o bug #4: antes o
 * estorno era só crédito virtual na carteira; agora devolve de verdade pro
 * cartão/PIX do cliente).
 *
 * Só faz sentido enquanto o dinheiro está retido na conta-mãe (antes da entrega).
 * Full refund quando `value` é omitido; refund parcial com `value` (ex: estorno
 * menos a multa de cancelamento tardio).
 */
export async function refundOrderCharge(asaasPaymentId: string, value?: number): Promise<void> {
  if (!asaasPaymentId) throw new Error('asaasPaymentId ausente para estorno');
  await asaasClient.post(`/payments/${asaasPaymentId}/refund`, value != null ? { value: Number(value.toFixed(2)) } : {});
  logger.info('Estorno solicitado no Asaas', { asaasPaymentId, value: value ?? 'total' });
}

export default { refundOrderCharge };
