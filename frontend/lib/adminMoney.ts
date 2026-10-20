/**
 * Dinheiro · Visão geral, Histórico e Ajustar saldo (D3b-3): os formatos das rotas do servidor
 * (GET /admin/money/summary|movements|actions, P3; POST /admin/wallets/:id/adjust, P2), os rótulos em português
 * e o resumo legível de "antes → depois" do registro de ações. Nada aqui chama o servidor.
 */
import type { StatusTone } from '../components/admin/StatusTag';
import { adminRoleLabel } from './adminNav';
import { formatMoney } from './money';

export type SettlementMode = 'custodia' | 'direto';

export interface MoneyAmountCount { amount: number; count: number }

export interface MoneyFlow {
  orders: number;
  inFromCustomers: number;
  toStores: number;
  toMotoboys: number;
  gatewayCost: number;
  platform: number;
}

export interface MoneySummary {
  mode: SettlementMode;
  day: string;
  custody: MoneyAmountCount | null;
  toRelease: (MoneyAmountCount & { uncertain: number }) | null;
  withdrawalsToday: MoneyAmountCount & { pending: number; uncertain: number };
  refunds: MoneyAmountCount | null;
  platformRevenueToday: number;
  whereMoneyWent: MoneyFlow;
}

export const MONEY_MOVEMENT_TYPES = [
  'order_payment', 'payout_release', 'withdrawal_paid', 'refund', 'commission', 'wallet_adjust', 'cashbox',
] as const;
export type MoneyMovementType = (typeof MONEY_MOVEMENT_TYPES)[number];

export interface MoneyMovement {
  id: string;
  at: string;
  type: MoneyMovementType;
  amount: number;
  orderId: string | null;
  personName: string | null;
  label: string;
}

export interface MoneyMovementPage { day: string; items: MoneyMovement[]; nextCursor: string | null }

export const ADMIN_MONEY_ACTION_TYPES = [
  'payout_release', 'payout_block', 'payout_unblock', 'payout_mark_paid', 'payout_resolve_uncertain',
  'withdrawal_approve', 'withdrawal_reject', 'withdrawal_resolve_uncertain',
  'cashbox_deposit', 'cashbox_withdrawal_request', 'cashbox_withdrawal_approve', 'cashbox_withdrawal_reject',
  'wallet_adjust', 'commission_sync', 'motoboy_transfer_retry', 'motoboy_transfer_resolve', 'direct_refund_resolve',
  // D3b-1 (P2.3): cancelamento do admin com estorno, alvo 'order'.
  'order_admin_cancel',
] as const;
export type AdminMoneyActionType = (typeof ADMIN_MONEY_ACTION_TYPES)[number];

export interface AdminMoneyActionItem {
  id: string;
  at: string;
  actorId: string;
  actorName: string | null;
  actorRole: string;
  type: AdminMoneyActionType;
  targetType: string;
  targetId: string;
  amount: number | null;
  reason: string | null;
  before: unknown;
  after: unknown;
}

export interface AdminMoneyActionPage { items: AdminMoneyActionItem[]; nextCursor: string | null }

export interface WalletAdjustment {
  actionId: string;
  walletId: string;
  direction: 'credit' | 'debit';
  amount: number;
  reason: string;
  balanceBefore: number;
  balanceAfter: number;
  walletEntryId: string;
  createdAt: string;
}

export interface WalletAdjustResponse { message: string; replayed: boolean; adjustment: WalletAdjustment }

/** Rótulos do filtro "Tipo de movimento" (cada linha usa o `label` que o servidor manda). */
export const MOVEMENT_TYPE_LABEL: Record<MoneyMovementType, string> = {
  order_payment: 'Pagamentos de pedido',
  payout_release: 'Repasses liberados',
  withdrawal_paid: 'Saques pagos',
  refund: 'Estornos',
  commission: 'Comissões',
  wallet_adjust: 'Ajustes de saldo',
  cashbox: 'Caixa (depósitos e retiradas)',
};

export const MOVEMENT_TONE: Record<MoneyMovementType, StatusTone> = {
  order_payment: 'info',
  payout_release: 'warn',
  withdrawal_paid: 'ok',
  refund: 'bad',
  commission: 'neutral',
  wallet_adjust: 'warn',
  cashbox: 'neutral',
};

export const ACTION_TYPE_LABEL: Record<AdminMoneyActionType, string> = {
  payout_release: 'Repasse liberado',
  payout_block: 'Repasse bloqueado',
  payout_unblock: 'Repasse desbloqueado',
  payout_mark_paid: 'Repasse marcado como pago',
  payout_resolve_uncertain: 'Repasse incerto resolvido',
  withdrawal_approve: 'Saque aprovado',
  withdrawal_reject: 'Saque recusado',
  withdrawal_resolve_uncertain: 'Saque incerto resolvido',
  cashbox_deposit: 'Depósito no caixa',
  cashbox_withdrawal_request: 'Retirada do caixa pedida',
  cashbox_withdrawal_approve: 'Retirada do caixa aprovada',
  cashbox_withdrawal_reject: 'Retirada do caixa recusada',
  wallet_adjust: 'Saldo ajustado',
  commission_sync: 'Comissão do plano aplicada às lojas',
  motoboy_transfer_retry: 'Pix ao motoboy: nova tentativa',
  motoboy_transfer_resolve: 'Pix ao motoboy resolvido',
  direct_refund_resolve: 'Estorno resolvido',
  order_admin_cancel: 'Pedido cancelado pelo admin',
};

const TARGET_LABEL: Record<string, string> = {
  payout: 'Repasse',
  withdrawal_request: 'Saque',
  cashbox_withdrawal: 'Retirada do caixa',
  cashbox: 'Caixa',
  wallet: 'Carteira',
  plan_commission: 'Plano',
  motoboy_transfer: 'Pix ao motoboy',
  direct_refund: 'Estorno',
  verification: 'Verificação',
  order: 'Pedido',
};

export const shortId = (id: string): string => `#${String(id).slice(-6)}`;

export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function actionTargetLabel(targetType: string, targetId: string): string {
  if (targetType === 'plan_commission') {
    const m = /^plan([123])$/.exec(targetId);
    if (m) return `Plano ${m[1]}`;
  }
  return `${TARGET_LABEL[targetType] ?? targetType} ${shortId(targetId)}`;
}

export function actorLabel(i: { actorName: string | null; actorRole: string }): string {
  return `${i.actorName ?? 'Pessoa removida'} · ${adminRoleLabel(i.actorRole)}`;
}

const SP = 'America/Sao_Paulo';

export const spTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: SP });

export const spDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: SP });

const STATUS_LABEL: Record<string, string> = {
  pending: 'pendente',
  releasing: 'em liberação',
  released: 'liberado',
  requested: 'saque pedido',
  paid: 'pago',
  processed: 'pago',
  approved: 'aprovado',
  rejected: 'recusado',
  cancelled: 'cancelado',
  done: 'resolvido',
  failed: 'falhou',
  failed_final: 'falhou (sem novas tentativas)',
  uncertain: 'incerto',
};

const asObject = (v: unknown): Record<string, unknown> =>
  (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const toNum = (v: unknown): number | null => {
  if (isNum(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};
const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const statusText = (v: unknown): string | null => (typeof v === 'string' ? STATUS_LABEL[v] ?? v : null);

/** "pendente → liberado", "saldo R$ 10,00 → R$ 35,50 · crédito", "15% → 12% · manteve as especiais"… */
export function summarizeMoneyChange(beforeRaw: unknown, afterRaw: unknown): string {
  const b = asObject(beforeRaw);
  const a = asObject(afterRaw);
  const parts: string[] = [];

  const from = statusText(b.status);
  const to = statusText(a.status);
  if (from && to && from !== to) parts.push(`${from} → ${to}`);
  else if (to || from) parts.push((to ?? from) as string);

  if (a.blocked === true) parts.push('bloqueado');
  if (a.blocked === false) parts.push('desbloqueado');

  const bb = toNum(b.balance);
  const ab = toNum(a.balance);
  if (bb !== null || ab !== null) {
    parts.push(`saldo ${bb === null ? '—' : formatMoney(bb)} → ${ab === null ? '—' : formatMoney(ab)}`);
  }

  const bv = toNum(b.value);
  const av = toNum(a.value);
  if (bv !== null || av !== null) parts.push(`${bv === null ? '—' : pct(bv)} → ${av === null ? '—' : pct(av)}`);
  if (a.choice === 'keep_special') parts.push('manteve as especiais');
  if (a.choice === 'all') parts.push('igualou todas');
  const updated = toNum(a.storesUpdated);
  if (updated !== null) parts.push(plural(updated, 'loja atualizada', 'lojas atualizadas'));

  if (a.direction === 'credit') parts.push('crédito');
  if (a.direction === 'debit') parts.push('débito');
  if (a.outcome === 'paid' || a.outcome === 'released') parts.push('conferido: pago');
  if (a.outcome === 'not_sent') parts.push('conferido: não enviado');
  if (a.uncertain === true) parts.push('incerto');
  if (a.selfApproved === true) parts.push('aprovou a própria retirada');

  return parts.length ? parts.join(' · ') : '—';
}

const isAmountCount = (v: unknown): v is MoneyAmountCount =>
  !!v && typeof v === 'object' && isNum((v as MoneyAmountCount).amount) && isNum((v as MoneyAmountCount).count);

/** O resumo tem o formato da P3? Fora dele a tela mostra erro (fail closed), nunca zero. */
export function isMoneySummary(d: unknown): d is MoneySummary {
  const s = d as MoneySummary | null;
  if (!s || typeof s !== 'object' || (s.mode !== 'custodia' && s.mode !== 'direto')) return false;
  if (!isNum(s.platformRevenueToday)) return false;
  const w = s.withdrawalsToday;
  if (!isAmountCount(w) || !isNum(w.pending) || !isNum(w.uncertain)) return false;
  const f = s.whereMoneyWent;
  if (!f || ![f.orders, f.inFromCustomers, f.toStores, f.toMotoboys, f.gatewayCost, f.platform].every(isNum)) return false;
  if (s.mode === 'custodia') {
    return isAmountCount(s.custody) && isAmountCount(s.toRelease) && isNum(s.toRelease.uncertain);
  }
  return isAmountCount(s.refunds);
}

export const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** 16 bytes → uuid v4 (marca versão e variante numa cópia). */
export function uuidFromBytes(bytes: Uint8Array): string {
  const b = Uint8Array.from(bytes);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Chave de idempotência do Ajustar saldo (uuid v4). Nasce quando a folha abre e vale para todas as tentativas. */
export function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return uuidFromBytes(bytes);
}
