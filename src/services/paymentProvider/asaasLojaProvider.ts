import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/AppError';
import { requestDirectRefund, executeDirectRefund } from '../asaasLoja/refund';
import { createStorePixCharge, getStorePaymentStatus, cancelStorePixCharge } from '../asaasLoja/charge';
import type {
  IPaymentProvider, PaymentProviderCapabilities, CreateChargeInput,
  ChargeResult, NormalizedPaymentStatus, NormalizedWebhookEvent, RefundResult,
} from './types';

/** Operação do provider ainda não construída (etapas seguintes do modo SaaS). */
function notImplemented(op: string): AppError {
  return new AppError(`asaas_loja: "${op}" ainda não implementado`, 501, true, 'NOT_IMPLEMENTED');
}

/**
 * Provedor do modo SaaS "direto": a cobrança nasce na conta Asaas DA LOJA.
 * Sem custódia: nada de escrow, saque pelo app ou recarga de carteira.
 */
export class AsaasLojaProvider implements IPaymentProvider {
  readonly name = 'asaas_loja' as const;
  readonly capabilities: PaymentProviderCapabilities = {
    supportsEscrow: false, supportsAppWithdrawal: false, supportsWalletTopup: false,
  };

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    if (!input.storeId) throw new Error('asaas_loja: storeId é obrigatório para cobrar na conta da loja');
    if (input.method !== 'pix') throw notImplemented(`createCharge(${input.method})`);
    return createStorePixCharge({
      storeId: input.storeId,
      orderId: input.orderId,
      buyerUserId: input.buyerUserId,
      value: input.value,
      description: input.description,
      cpf: input.cpf,
    });
  }

  /** Consulta com a chave da loja dona do pedido (achada pelo asaasPaymentId). */
  async getPaymentStatus(providerPaymentId: string): Promise<NormalizedPaymentStatus> {
    const order = await prisma.order.findFirst({
      where: { asaasPaymentId: providerPaymentId, paymentProvider: 'asaas_loja' },
      select: { storeId: true },
    });
    if (!order) return 'unknown';
    const raw = await getStorePaymentStatus(order.storeId, providerPaymentId);
    const s = String(raw || '').toUpperCase();
    if (['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'].includes(s)) return 'paid';
    if (s === 'REFUNDED') return 'refunded';
    if (!raw) return 'unknown';
    return 'pending';
  }

  /** Exclui a cobrança com a chave da loja dona do pedido. false = não excluída (não mexer no pedido). */
  async cancelCharge(providerPaymentId: string): Promise<boolean> {
    const order = await prisma.order.findFirst({
      where: { asaasPaymentId: providerPaymentId, paymentProvider: 'asaas_loja' },
      select: { storeId: true },
    });
    if (!order) return false;
    return cancelStorePixCharge(order.storeId, providerPaymentId);
  }

  parseWebhook(): NormalizedWebhookEvent | null {
    throw notImplemented('parseWebhook'); // Task 1.6
  }

  /** Sem custódia: o dinheiro já está na conta da loja, não há o que liberar na entrega. */
  async onDeliveryConfirmed(): Promise<void> {
    /* no-op de propósito */
  }

  /**
   * Estorno com a chave da loja (DirectRefund). 'done' só se o estorno terminou 'done';
   * qualquer outro desfecho (recusa, incerteza, pedido inelegível) devolve 'failed' sem lançar,
   * para o fluxo de cancelamento escalar ao admin.
   */
  async refund(orderId: string, _providerPaymentId: string, value?: number): Promise<RefundResult> {
    if (value === undefined || value === null || !Number.isFinite(Number(value))) {
      return { status: 'failed', errorMessage: 'asaas_loja: valor do estorno obrigatório' };
    }
    try {
      const cancellation = await prisma.cancellation.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' }, select: { id: true } });
      const refund = await requestDirectRefund({
        orderId, cancellationId: cancellation?.id ?? null,
        amount: Number(value), requestedBy: 'system',
      });
      const status = await executeDirectRefund(refund.id);
      if (status === 'done') return { status: 'done' };
      return { status: 'failed', errorMessage: `asaas_loja: estorno não concluído (${status})` };
    } catch (err) {
      return { status: 'failed', errorMessage: (err as Error)?.message || 'asaas_loja: falha no estorno' };
    }
  }
}
