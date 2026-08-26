import type { Request } from 'express';
import {
  createPixCharge, createCardCharge, getPaymentStatus as asaasGetStatus,
  cancelCharge as asaasCancel, ensureAsaasCustomer,
} from '../asaas/payment';
import type { CardChargeInput } from '../asaas/payment';
import { releaseOrderViaAsaas } from '../asaas/release';
import { refundOrderCharge } from '../asaas/refund';
import type {
  IPaymentProvider, PaymentProviderCapabilities, CreateChargeInput,
  ChargeResult, NormalizedPaymentStatus, NormalizedWebhookEvent, RefundResult,
} from './types';

/** Adaptador: embrulha o Asaas de hoje SEM alterar a lógica. */
export class AsaasProvider implements IPaymentProvider {
  readonly name = 'asaas' as const;
  readonly capabilities: PaymentProviderCapabilities = {
    supportsEscrow: true, supportsAppWithdrawal: true, supportsWalletTopup: true,
  };

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    const customerId = await ensureAsaasCustomer(input.buyerUserId);
    if (!customerId) throw new Error('Não foi possível criar o cliente Asaas');
    if (input.method === 'pix') {
      const pix = await createPixCharge({
        customerId, value: input.value, orderId: input.orderId, description: input.description,
      });
      return {
        providerPaymentId: pix.paymentId, status: pix.status, paidSynchronously: false,
        pix: { qrCodeImage: pix.qrCodeImage, qrCodePayload: pix.qrCodePayload, expiresAt: pix.expiresAt },
      };
    }
    // `input.card` é opaco no nível do IPaymentProvider (CreateChargeInput.card: unknown) —
    // aqui, no adaptador Asaas, ele carrega o restante do CardChargeInput real
    // (remoteIp, card, holder, installmentCount/Value), que o cast abaixo expõe.
    const cardExtra = input.card as Omit<CardChargeInput, 'customerId' | 'value' | 'orderId'>;
    const card = await createCardCharge({
      customerId, value: input.value, orderId: input.orderId, ...cardExtra,
    });
    const paid = ['CONFIRMED', 'RECEIVED'].includes(String(card.status).toUpperCase());
    return { providerPaymentId: card.paymentId, status: card.status, paidSynchronously: paid };
  }

  async getPaymentStatus(providerPaymentId: string): Promise<NormalizedPaymentStatus> {
    const raw = await asaasGetStatus(providerPaymentId);
    const s = String(raw || '').toUpperCase();
    if (['CONFIRMED', 'RECEIVED'].includes(s)) return 'paid';
    if (s === 'REFUNDED') return 'refunded';
    if (!raw) return 'unknown';
    return 'pending';
  }

  cancelCharge(providerPaymentId: string): Promise<boolean> {
    return asaasCancel(providerPaymentId);
  }

  // O Asaas usa webhook próprio já roteado em webhookController; parseWebhook
  // não é usado no fluxo Asaas atual (mantido null p/ não desviar o existente).
  parseWebhook(_req: Request): NormalizedWebhookEvent | null { return null; }

  onDeliveryConfirmed(orderId: string): Promise<void> {
    return releaseOrderViaAsaas(orderId);
  }

  async refund(_orderId: string, providerPaymentId: string, amount?: number): Promise<RefundResult> {
    try {
      await refundOrderCharge(providerPaymentId, amount);
      return { status: 'done' };
    } catch (err: any) {
      return { status: 'failed', errorMessage: err?.message || 'falha no estorno' };
    }
  }
}
