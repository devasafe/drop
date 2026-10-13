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

/**
 * Situação do aceite do termo, a partir de GET /stores/:id/asaas (fail closed).
 * - `blocking`: conta válida sem aceite válido (ausente ou sem versão/data) → pedidos Pix bloqueados.
 * - `outdated`: aceite válido de uma versão anterior à vigente → só aviso, a loja segue vendendo.
 */
export function asaasConsentState(status: AsaasStatus | null | undefined): { blocking: boolean; outdated: boolean } {
  if (!status || status.status !== 'valid') return { blocking: false, outdated: false };
  const c = status.consent;
  const validConsent = !!c && typeof c.version === 'string' && c.version.trim() !== ''
    && typeof c.acceptedAt === 'string' && c.acceptedAt.trim() !== '';
  if (!validConsent) return { blocking: true, outdated: false };
  const current = typeof status.termsVersion === 'string' ? status.termsVersion.trim() : '';
  return { blocking: false, outdated: !!current && c!.version !== current };
}
