/**
 * Dinheiro · Mensalidades (D3b-4b, spec 6): o formato de GET /admin/money/saas, os rótulos em português e a
 * conferência do formato (fora dele a tela mostra erro, nunca zero). Nada aqui chama o servidor.
 */
import type { StatusTone } from '../components/admin/StatusTag';

export const SAAS_BILLING_STATUSES = ['trialing', 'active', 'past_due', 'paused', 'cancelled'] as const;
export type SaasBillingStatus = (typeof SAAS_BILLING_STATUSES)[number];

export interface SaasInvoice {
  id: string;
  storeId: string;
  storeName: string;
  value: number;
  dueDate: string; // AAAA-MM-DD (data do Asaas, sem fuso)
  status: string; // como o Asaas manda, mais 'DELETED'
  paidAt: string | null;
}
export interface SaasInvoicePage { items: SaasInvoice[]; nextCursor: string | null }

export interface SaasRevenueDirect {
  mode: 'direto';
  month: string;
  mrr: number;
  receivedThisMonth: number;
  overdue: { stores: number; amount: number };
  byStatus: Record<SaasBillingStatus, number>;
  trialsEndingIn7Days: number;
  invoices: SaasInvoicePage;
}
export type SaasRevenue = { mode: 'custodia' } | SaasRevenueDirect;

/** Situação da mensalidade da loja (spec 6.2). */
export const SAAS_SITUATION_LABEL: Record<SaasBillingStatus, string> = {
  trialing: 'Em teste',
  active: 'Ativa',
  past_due: 'Em atraso',
  paused: 'Pausada',
  cancelled: 'Cancelada',
};

/**
 * Status da fatura como o servidor grava (saasBilling/webhook.ts e payments.ts): o do Asaas, mais 'DELETED'
 * (PAYMENT_DELETED, ou cancelamento e troca de vencimento pelo admin).
 */
const INVOICE_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  PENDING: { label: 'Pendente', tone: 'info' },
  RECEIVED: { label: 'Paga', tone: 'ok' },
  RECEIVED_IN_CASH: { label: 'Paga', tone: 'ok' },
  CONFIRMED: { label: 'Confirmada', tone: 'ok' },
  OVERDUE: { label: 'Em atraso', tone: 'bad' },
  REFUNDED: { label: 'Estornada', tone: 'warn' },
  DELETED: { label: 'Cancelada', tone: 'neutral' },
};

/** Status que o DROP ainda não conhece: mostra o código do Asaas, sem inventar tradução. */
export function invoiceStatus(status: string): { label: string; tone: StatusTone } {
  return INVOICE_STATUS[status] ?? { label: status || '—', tone: 'neutral' };
}

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 'AAAA-MM-DD' → 'DD/MM/AAAA' sem passar por Date: a data do Asaas não muda de dia com o fuso. */
export function formatDueDate(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}

/** 'AAAA-MM' → 'outubro de 2026'. */
export function monthLabel(month: string): string {
  return new Date(`${month}-15T12:00:00.000Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const isInvoice = (v: unknown): v is SaasInvoice => {
  const i = v as SaasInvoice | null;
  return !!i && typeof i === 'object'
    && typeof i.id === 'string' && typeof i.storeId === 'string' && typeof i.storeName === 'string'
    && isNum(i.value) && typeof i.dueDate === 'string' && DAY_RE.test(i.dueDate)
    && typeof i.status === 'string' && (i.paidAt === null || typeof i.paidAt === 'string');
};

export function isSaasInvoicePage(v: unknown): v is SaasInvoicePage {
  const p = v as SaasInvoicePage | null;
  return !!p && Array.isArray(p.items) && p.items.every(isInvoice) && (p.nextCursor === null || typeof p.nextCursor === 'string');
}

export function isSaasRevenue(d: unknown): d is SaasRevenue {
  const s = d as SaasRevenueDirect | { mode: 'custodia' } | null;
  if (!s || typeof s !== 'object') return false;
  if (s.mode === 'custodia') return true;
  if (s.mode !== 'direto' || typeof s.month !== 'string' || !MONTH_RE.test(s.month)) return false;
  if (![s.mrr, s.receivedThisMonth, s.trialsEndingIn7Days].every(isNum)) return false;
  if (!s.overdue || !isNum(s.overdue.stores) || !isNum(s.overdue.amount)) return false;
  if (!s.byStatus || !SAAS_BILLING_STATUSES.every((k) => isNum(s.byStatus[k]))) return false;
  return isSaasInvoicePage(s.invoices);
}
