/**
 * D2 · dinheiro do motoboy por corrida. Só lê números do servidor (Payout da custódia e
 * MotoboyTransfer do direto): nenhuma porcentagem é calculada aqui. Sem dado → sem badge e
 * sem valor; total de um grupo só quando todos os itens têm valor (fail closed).
 */
import { formatFullDate } from './sellerApi';

export type MoneyTone = 'ok' | 'warn' | 'err' | 'info' | 'neutral';

export interface MoneyInfo {
  id: string;
  kind: 'payout' | 'transfer';
  amount: number;
  status: string;
  blocked: boolean;
  blockReason: string | null;
  deliveryId: string | null;
  orderId: string | null;
  createdAt: string | null;
  doneAt: string | null;
}

const str = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));
const money = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Repasse da custódia (GET /payouts/my → payouts[]). Valor estranho → null. */
export function payoutToMoney(p: any): MoneyInfo | null {
  const amount = money(p?.amount);
  if (!p || Number.isNaN(amount)) return null;
  return {
    id: String(p._id ?? p.id),
    kind: 'payout',
    amount,
    status: String(p.status ?? ''),
    blocked: p.blocked === true,
    blockReason: str(p.blockReason),
    deliveryId: str(p.deliveryId),
    orderId: str(p.orderId),
    createdAt: str(p.createdAt),
    doneAt: str(p.paidAt),
  };
}

/** Pix da loja no direto (GET /motoboy/transfers → data[]; visão do motoboy, sem deliveryId). */
export function transferToMoney(t: any): MoneyInfo | null {
  const amount = money(t?.amount);
  if (!t || Number.isNaN(amount)) return null;
  return {
    id: String(t.id ?? t._id),
    kind: 'transfer',
    amount,
    status: String(t.status ?? ''),
    blocked: false,
    blockReason: null,
    deliveryId: null,
    orderId: str(t.orderId),
    createdAt: str(t.createdAt),
    doneAt: str(t.doneAt),
  };
}

/**
 * Rótulo e tom do Pix da loja (modo direto), um só para a conclusão, a lista e o sheet de atraso.
 * Status desconhecido nunca é otimista: fica "Em conferência", neutro.
 */
export function transferView(status: string): { label: string; tone: MoneyTone; detail: string } {
  switch (status) {
    case 'done': return { label: 'Na conta', tone: 'ok', detail: '' };
    case 'pending':
    case 'requested': return { label: 'A caminho', tone: 'info', detail: 'A caminho da sua conta.' };
    case 'failed': return { label: 'Atrasado', tone: 'warn', detail: 'A loja vai tentar de novo.' };
    case 'uncertain': return { label: 'Atrasado', tone: 'warn', detail: 'Em conferência pela DROP.' };
    case 'failed_final': return { label: 'Atrasado', tone: 'warn', detail: 'As tentativas acabaram — a DROP está cuidando do seu repasse.' };
    default: return { label: 'Em conferência', tone: 'neutral', detail: 'Em conferência.' };
  }
}

/** Pix que não saiu: mesmo conjunto que transferView mostra como "Atrasado". */
export const isLateTransfer = (m: MoneyInfo): boolean =>
  m.kind === 'transfer' && transferView(m.status).label === 'Atrasado';

export function moneyBadge(m: MoneyInfo): { label: string; tone: MoneyTone } {
  if (m.kind === 'transfer') {
    const { label, tone } = transferView(m.status);
    return { label, tone };
  }
  if (m.blocked && m.status !== 'paid' && m.status !== 'cancelled') return { label: 'Bloqueado', tone: 'err' };
  switch (m.status) {
    case 'pending': return { label: 'A liberar', tone: 'warn' };
    case 'releasing': return { label: 'Em transferência', tone: 'info' };
    case 'released': return { label: 'Liberado', tone: 'ok' };
    case 'requested': return { label: 'Saque pedido', tone: 'info' };
    case 'paid': return { label: 'Sacado', tone: 'neutral' };
    case 'cancelled': return { label: 'Cancelado', tone: 'neutral' };
    default: return { label: 'Em conferência', tone: 'neutral' };
  }
}

/**
 * Soma, em centavos, as partes de um repasse dividido por saque (mesmo deliveryId), sem os
 * cancelados. Status só quando todas as partes têm o mesmo; misto → '' (nunca afirma "Liberado").
 */
export function sumPayoutParts(parts: MoneyInfo[]): { amount: number; status: string } | null {
  const active = parts.filter((p) => p.status !== 'cancelled');
  if (active.length === 0) return null;
  let cents = 0;
  for (const p of active) {
    if (!Number.isFinite(p.amount)) return null;
    cents += Math.round(p.amount * 100);
  }
  const statuses = new Set(active.map((p) => p.status));
  return { amount: cents / 100, status: statuses.size === 1 ? active[0].status : '' };
}

export interface MoneyIndex { byDelivery: Map<string, MoneyInfo[]>; byOrder: Map<string, MoneyInfo[]> }

export function indexMoney(list: MoneyInfo[]): MoneyIndex {
  const byDelivery = new Map<string, MoneyInfo[]>();
  const byOrder = new Map<string, MoneyInfo[]>();
  for (const m of list) {
    if (m.deliveryId) {
      byDelivery.set(m.deliveryId, [...(byDelivery.get(m.deliveryId) ?? []), m]);
    } else if (m.orderId) {
      // sem deliveryId só vale pelo pedido; um registro de OUTRA entrega não é desta
      byOrder.set(m.orderId, [...(byOrder.get(m.orderId) ?? []), m]);
    }
  }
  return { byDelivery, byOrder };
}

/** Junta as partes de uma entrega num só MoneyInfo (soma em centavos; status misto → ''). */
function combine(parts: MoneyInfo[]): MoneyInfo | null {
  if (parts.length === 1) return parts[0];
  if (parts.some((p) => p.kind !== 'payout')) return null;
  const sum = sumPayoutParts(parts);
  if (!sum) return parts.every((p) => p.status === 'cancelled') ? parts[0] : null;
  const active = parts.filter((p) => p.status !== 'cancelled');
  return {
    ...active[0],
    amount: sum.amount,
    status: sum.status,
    blocked: active.some((p) => p.blocked && p.status !== 'paid'),
  };
}

/** Pelo id da entrega; senão pelo pedido quando há UM registro só (ambíguo → null, sem badge). */
export function moneyFor(index: MoneyIndex, d: { _id?: unknown; id?: unknown; orderId?: unknown } | null | undefined): MoneyInfo | null {
  if (!d) return null;
  const id = str(d._id ?? d.id);
  const parts = id ? index.byDelivery.get(id) : undefined;
  if (parts && parts.length > 0) return combine(parts);
  const orderId = str(d.orderId);
  const list = orderId ? index.byOrder.get(orderId) : undefined;
  return list && list.length === 1 ? list[0] : null;
}

const DAY = 24 * 60 * 60 * 1000;

/** Hora que vale para a lista: entregue, cancelada ou, na falta, a última atualização. */
export function deliveryDate(d: any): string | null {
  return str(d?.deliveredAt) ?? str(d?.cancelledAt) ?? str(d?.updatedAt) ?? str(d?.createdAt);
}

export function isToday(iso: string | null | undefined, now: Date): boolean {
  const k = formatFullDate(iso);
  return !!k && k === formatFullDate(now);
}

export function dayLabel(iso: string, now: Date): string {
  const k = formatFullDate(iso);
  if (!k) return 'Sem data';
  if (k === formatFullDate(now)) return 'Hoje';
  if (k === formatFullDate(new Date(now.getTime() - DAY))) return 'Ontem';
  return k.slice(0, 5);
}

export function inMonth(iso: string | null | undefined, now: Date): boolean {
  const k = formatFullDate(iso);
  const n = formatFullDate(now);
  return !!k && !!n && k.slice(3) === n.slice(3);
}

const MONTH_FMT = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'America/Sao_Paulo' });
export function monthName(now: Date): string {
  const m = MONTH_FMT.format(now);
  return m.charAt(0).toUpperCase() + m.slice(1);
}

export interface DayGroup<T> { key: string; label: string; items: T[] }

/** Agrupa mantendo a ordem de chegada (a lista já vem da mais recente para a mais antiga). */
export function groupByDay<T>(items: T[], dateOf: (t: T) => string | null, now: Date): DayGroup<T>[] {
  const out: DayGroup<T>[] = [];
  for (const it of items) {
    const iso = dateOf(it);
    const key = (iso && formatFullDate(iso)) || 'sem-data';
    let g = out.find((x) => x.key === key);
    if (!g) {
      g = { key, label: iso ? dayLabel(iso, now) : 'Sem data', items: [] };
      out.push(g);
    }
    g.items.push(it);
  }
  return out;
}

/** Soma só quando todos têm valor: um faltando → null (a tela não mostra total parcial). */
export function sumAll(values: Array<number | null | undefined>): number | null {
  let s = 0;
  for (const v of values) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    s += v;
  }
  return round2(s);
}

/**
 * Lista paginada da mais recente para a mais antiga: a janela (hoje, semana) está inteira
 * quando não há mais páginas ou quando o último item carregado já está fora dela.
 */
export function windowCovered(datesDesc: Array<string | null>, hasMore: boolean, inWindow: (iso: string) => boolean): boolean {
  if (!hasMore) return true;
  const last = datesDesc[datesDesc.length - 1];
  return !!last && !inWindow(last);
}

const WD_FMT = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' });
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEK_LABELS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const WEEK_NAMES = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

/** "dd/mm/aaaa" de segunda a domingo da semana de `now` (São Paulo não tem horário de verão). */
export function weekKeys(now: Date): string[] {
  const idx = WD.indexOf(WD_FMT.format(now));
  return WD.map((_, i) => formatFullDate(new Date(now.getTime() + (i - idx) * DAY)) as string);
}

export function isThisWeek(iso: string | null | undefined, now: Date): boolean {
  const k = formatFullDate(iso);
  return !!k && weekKeys(now).includes(k);
}

export interface WeekBars { days: Array<{ label: string; total: number; best: boolean }>; total: number; count: number; bestDay: string | null }

/**
 * Repasses da semana por dia. Repasse dividido por saque (mesmo deliveryId) é UMA corrida: soma
 * em centavos sem cancelados e vale no dia da parte mais antiga (a original, não a do saque).
 */
export function weekBars(list: MoneyInfo[], now: Date): WeekBars {
  const keys = weekKeys(now);
  const groups = new Map<string, MoneyInfo[]>();
  list.forEach((m, n) => {
    if (m.status === 'cancelled') return;
    const g = m.deliveryId ? `d:${m.deliveryId}` : `i:${n}`;
    groups.set(g, [...(groups.get(g) ?? []), m]);
  });
  const cents = keys.map(() => 0);
  let count = 0;
  for (const parts of groups.values()) {
    const times = parts.map((p) => (p.createdAt ? new Date(p.createdAt).getTime() : NaN)).filter((t) => !Number.isNaN(t));
    if (times.length === 0) continue;
    const i = keys.indexOf(formatFullDate(new Date(Math.min(...times))) as string);
    if (i < 0) continue;
    cents[i] += parts.reduce((s, p) => s + Math.round(p.amount * 100), 0);
    count += 1;
  }
  const max = Math.max(...cents);
  const bestIdx = max > 0 ? cents.indexOf(max) : -1;
  return {
    days: cents.map((c, i) => ({ label: WEEK_LABELS[i], total: c / 100, best: i === bestIdx })),
    total: cents.reduce((s, t) => s + t, 0) / 100,
    count,
    bestDay: bestIdx >= 0 ? WEEK_NAMES[bestIdx] : null,
  };
}
