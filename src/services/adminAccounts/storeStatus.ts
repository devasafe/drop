/**
 * D3b-2a · situação da loja para as leituras do admin. "Aberta" é a do GET público
 * (isStoreOpenWithHoursNow: toggle, pausa do lojista, horário e "abrir fora do horário"); a pausa do
 * admin vem antes de tudo.
 */
import { Prisma } from '@prisma/client';
import { isStoreOpenWithHoursNow, isStorePaused } from '../../utils/storeOpen';
import { SettlementMode } from '../../utils/settlement';
import { isAdminPaused } from './storePause';
import { ReceivingStatus, StoreMode, StoreSituation } from './types';

export const STORE_SITUATION_SELECT = Prisma.validator<Prisma.StoreSelect>()({
  isOpen: true,
  pausedUntil: true,
  openOverrideUntil: true,
  operatingHours: true,
  adminPausedAt: true,
});

export interface StoreSituationInput {
  isOpen: boolean;
  pausedUntil: Date | null;
  openOverrideUntil: Date | null;
  operatingHours: Prisma.JsonValue | null;
  adminPausedAt: Date | null;
}

export function storeSituation(store: StoreSituationInput, now: Date = new Date()): StoreSituation {
  if (isAdminPaused(store)) return 'admin_paused';
  if (isStorePaused(store, now)) return 'paused';
  return isStoreOpenWithHoursNow(store, now) ? 'open' : 'closed';
}

/** Só o que decide o recebimento: nunca a chave Pix nem a chave da conta saem daqui. */
export const RECEIVING_SELECT = Prisma.validator<Prisma.StoreSelect>()({
  asaas: true,
  asaasAccount: {
    select: { status: true, paymentWebhookId: true, ipWhitelistConfirmedAt: true, authWebhookConfirmedAt: true, lastError: true },
  },
});

export interface ReceivingInput {
  asaas: Prisma.JsonValue | null;
  asaasAccount: {
    status: string;
    paymentWebhookId: string | null;
    ipWhitelistConfirmedAt: Date | null;
    authWebhookConfirmedAt: Date | null;
    lastError: string | null;
  } | null;
}

const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/**
 * Decisão 12. Direto: a conta Asaas da própria loja (inválida = problema; válida com webhook de
 * pagamento, IP liberado e webhook de autorização = ok). Custódia: o repasse sai por Pix para
 * Store.asaas.pixKey (asaasGateway); sem gateway Asaas, não se aplica.
 */
export function receivingStatus(mode: SettlementMode, gateway: string, store: ReceivingInput): ReceivingStatus {
  if (mode === 'direto') {
    const account = store.asaasAccount;
    if (!account) return 'pending';
    if (account.status !== 'valid') return 'problem';
    return account.paymentWebhookId && account.ipWhitelistConfirmedAt && account.authWebhookConfirmedAt ? 'ok' : 'pending';
  }
  if (gateway !== 'asaas') return 'na';
  const sub = asObject(store.asaas);
  if (sub.status === 'error') return 'problem';
  return typeof sub.pixKey === 'string' && sub.pixKey.trim() ? 'ok' : 'pending';
}

/** Último erro gravado do recebimento, para a ficha. */
export function receivingLastError(mode: SettlementMode, store: ReceivingInput): string | null {
  if (mode === 'direto') return store.asaasAccount?.lastError ?? null;
  const lastError = asObject(store.asaas).lastError;
  return typeof lastError === 'string' && lastError ? lastError : null;
}

const PLAN_NUMBER: Record<string, number> = { plan1: 1, plan2: 2, plan3: 3 };

/** Mesma regra do checkout: StoreSubscription.currentPlan quando existe; senão Store.plan; senão 1. */
export function storePlanNumber(currentPlan: string | null | undefined, storePlan: number | null | undefined): number {
  if (currentPlan) return PLAN_NUMBER[currentPlan] ?? 1;
  return storePlan ?? 1;
}

export const storeModeOf = (mode: SettlementMode): StoreMode => (mode === 'direto' ? 'saas' : 'custodia');
