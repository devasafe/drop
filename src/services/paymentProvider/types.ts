import type { Request } from 'express';
import type { PaymentProviderName } from './activeProvider';

export interface PaymentProviderCapabilities {
  supportsEscrow: boolean;         // Asaas: true (libera no PIN) | MP: false
  supportsAppWithdrawal: boolean;  // Asaas: true (saque subconta) | MP: false
  supportsWalletTopup: boolean;    // Asaas: true | MP: false (§7 do spec)
}

export interface CreateChargeInput {
  orderId: string;
  buyerUserId: string;
  value: number;                   // total a cobrar (já descontado o que veio da carteira)
  method: 'pix' | 'credit_card' | 'debit_card';
  description?: string;
  card?: unknown;                  // payload de cartão quando method != pix (opaco aqui)
}

export interface ChargeResult {
  providerPaymentId: string;
  status: string;                  // status cru do provedor
  paidSynchronously: boolean;      // cartão confirma na hora; pix não
  pix?: { qrCodeImage?: string; qrCodePayload?: string; expiresAt?: string };
}

export type NormalizedPaymentStatus = 'pending' | 'paid' | 'refunded' | 'failed' | 'unknown';

export interface NormalizedWebhookEvent {
  kind: 'payment_confirmed' | 'payment_refunded' | 'ignored';
  providerPaymentId?: string;
  rawStatus?: string;
}

export interface RefundResult {
  status: 'done' | 'failed';
  errorMessage?: string;
}

export interface IPaymentProvider {
  readonly name: PaymentProviderName;
  readonly capabilities: PaymentProviderCapabilities;

  createCharge(input: CreateChargeInput): Promise<ChargeResult>;
  getPaymentStatus(providerPaymentId: string): Promise<NormalizedPaymentStatus>;
  cancelCharge(providerPaymentId: string): Promise<boolean>;

  parseWebhook(req: Request): NormalizedWebhookEvent | null;

  onDeliveryConfirmed(orderId: string): Promise<void>;

  refund(orderId: string, providerPaymentId: string, amount?: number): Promise<RefundResult>;
}
