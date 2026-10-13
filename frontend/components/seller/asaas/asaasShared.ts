// frontend/components/seller/asaas/asaasShared.ts
import { apiErrorCode } from '../../../lib/sellerApi';

export interface AsaasChecklistState { apiKey: boolean; paymentWebhook: boolean; ipWhitelistConfirmed: boolean; authWebhookConfirmed: boolean }
export interface AsaasStatus {
  status: 'none' | 'valid' | 'invalid';
  environment: 'sandbox' | 'production' | null;
  lastCheckedAt: string | null;
  checklist: AsaasChecklistState;
  apiKeyLast4?: string;
  /** Aceite mais recente do termo (null = nunca aceitou; os pedidos Pix ficam bloqueados). */
  consent?: { version: string; acceptedAt: string } | null;
  /** Versão vigente do termo. */
  termsVersion?: string;
}

export const TERMS_OUTDATED_MSG = 'O termo foi atualizado, recarregue';
export const isTermsOutdated = (e: any) => apiErrorCode(e) === 'TERMS_VERSION_OUTDATED';
export const authWebhookUrl = (storeId: string) => `https://api.dropapp.com.br/webhooks/asaas/loja/${storeId}/autorizacao`;

const pad = (n: number) => String(n).padStart(2, '0');
export function fmtDateTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} às ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
