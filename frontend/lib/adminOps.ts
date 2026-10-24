/**
 * Operação ao vivo (D3b-1): os formatos das rotas do servidor (espelho de src/services/adminOps/types.ts, plano
 * mestre "Interfaces compartilhadas"), as chamadas e os rótulos em português de Precisa de mim, Pedidos ao vivo,
 * Pedido do admin e Mapa ao vivo. Resposta fora do formato vira erro (fail closed): a tela mostra o erro com
 * "Tentar de novo", nunca zero nem lista vazia.
 */
import type { StatusTone } from '../components/admin/StatusTag';
import { serverErrorCode, serverErrorMessage } from '../components/admin/dinheiro/serverError';
import api from './api';
import { formatMoney } from './money';

/* ---------- formatos (iguais ao backend) ---------- */

export type QueueType =
  | 'refund' | 'withdrawal' | 'motoboy_transfer' | 'verification' | 'support'
  | 'payout' | 'plan_change' | 'order_no_motoboy' | 'order_store_late';
export type QueueGroup = 'customer_money' | 'person_waiting' | 'revenue' | 'operation';
export type QueueTag = 'Urgente' | 'Esperando' | 'Lote' | 'KYC' | 'Suporte' | 'Receita' | 'Operação';
export interface QueueItem { id: string; title: string; context: string; since: string; tag: QueueTag; href: string }
export interface QueueGroupEntry { type: QueueType; group: QueueGroup; count: number; items: QueueItem[]; error?: string }
export interface QueueResponse { groups: QueueGroupEntry[] }

export interface OpsSummary {
  today: {
    gmv: number; gmvLastWeekSameTime: number;
    orders: number; ordersActive: number;
    cancelPct: number; cancelLate: number;
    motoboysOnline: number; motoboysDelivering: number; motoboysFree: number;
  };
  perHour: { hour: number; count: number }[];
  health: { storeAcceptAvgMin: number | null; findMotoboyAvgMin: number | null; deliveryAvgMin: number | null };
}

export type AttentionReason =
  | 'estorno_pendente' | 'loja_parada' | 'cliente_decidindo' | 'sem_motoboy' | 'retirada_demorada' | 'atrasado';
export type OrdersFilter = 'atencao' | 'todos' | 'aguardando_pix' | 'na_loja' | 'em_entrega' | 'cancelados_hoje';
export interface AdminOrderRow {
  id: string; shortId: string;
  status: string; deliveryStatus: string | null;
  store: { id: string; name: string };
  motoboy: { id: string; name: string } | null;
  createdAt: string; stageSince: string;
  total: number;
  attention: AttentionReason | null;
}
export interface AdminOrdersResponse {
  items: AdminOrderRow[]; nextCursor: string | null;
  meta: {
    active: number; activePaid: number; awaitingPix: number; attention: number;
    acceptAvgMin: number | null; acceptLimitMin: number;
    findMotoboyAvgMin: number | null; poolTimeoutMin: number;
    deliveredToday: number;
    attentionTruncated: boolean;   // a varredura de atenção bateu no teto de 500 (I5)
  };
}

export type TimelineKey = 'created' | 'paid' | 'accepted' | 'assigned' | 'picked' | 'delivered' | 'cancelled';
export interface TimelineStep { key: TimelineKey; at: string | null; sincePrevMin: number | null }
export interface AdminOrderActionView {
  id: string; action: 'cancel' | 'reassign'; actorName: string; reason: string;
  faultParty: 'customer' | 'store' | 'motoboy' | 'platform' | null; at: string;
}
export type AdminOrderAllowedAction = 'cancel' | 'reassign';
export interface AdminOrderDetail {
  id: string; shortId: string; status: string; deliveryStatus: string | null;
  settlementMode: 'custody' | 'direct';
  store: { id: string; name: string };
  customer: { id: string; name: string; ordersCount: number; cancellations30d: number };
  motoboy: { id: string; name: string; vehicle: string | null; plate: string | null; rating: number | null } | null;
  timeline: TimelineStep[];
  adminActions: AdminOrderActionView[];
  items: { name: string; quantity: number; unitPrice: number; total: number }[];
  money: {
    subtotal: number; deliveryFee: number; couponDiscount: number; walletApplied: number; paidByCustomer: number;
    storeShare: number | null; motoboyShare: number | null; platformShare: number | null;
    payouts: { id: string; recipientType: string; amount: number; status: string }[];
    motoboyTransfer: { status: string; amount: number } | null;
  };
  cancellation: {
    cancelledBy: string; faultParty: string | null; reason: string; adminName: string | null;
    at: string; refundStatus: string;
  } | null;
  refundPending: boolean;
  allowedActions: AdminOrderAllowedAction[];
}

export interface OpsMapResponse {
  motoboys: {
    id: string; name: string; lat: number; lng: number; updatedAt: string; state: 'free' | 'delivering' | 'stale';
    orderId: string | null; shortId: string | null;   // pedido em entrega do motoboy (P1.6)
  }[];
  waiting: { orderId: string; shortId: string; storeName: string; storeLat: number | null; storeLng: number | null;
             since: string; radiusKm: number | null; customerDeciding: boolean }[];
  inDelivery: { orderId: string; shortId: string; motoboyName: string; stage: 'indo_para_loja' | 'levando' }[];
  dispatch: { initialKm: number; stepKm: number; stepSeconds: number; maxKm: number; poolTimeoutMin: number };
  /** D3b-4b: lojas abertas, com ponto e sem nenhum motoboy online a até dispatch.maxKm. */
  storesWithoutCourier: OpsMapStorePoint[];
}
export interface OpsMapStorePoint { id: string; name: string; lat: number; lng: number }

export type CancelFault = 'customer' | 'store' | 'motoboy' | 'platform';
export interface CancelPreview {
  fault: CancelFault;
  customerRefund: number;
  feeCharged: number;
  motoboyCompensation: number;
  compensationPaidBy: 'customer' | 'store' | 'platform' | null;
  countsAgainst: 'customer' | 'store' | 'motoboy' | null;
}
export interface CancelResult { ok: true; cancellationId: string; refundAmount: number; refundStatus: string }

/** Evento da sala admin (P1.7): só ids e status, sem dado pessoal. */
export interface AdminOrderChangedEvent { orderId: string; status: string; at: string }
export const ADMIN_ORDER_CHANGED_EVENT = 'admin:order_changed';

export type MotoboyMapState = OpsMapResponse['motoboys'][number]['state'];
/** O Mapa ao vivo relê a cada 15 s (o ritmo do envio de posição do app do motoboy). */
export const OPS_MAP_POLL_MS = 15_000;
/** Precisa de mim: a fila tem saques, verificações e suporte, que não têm evento; relê sempre a cada 60 s. */
export const OPERACAO_POLL_MS = 60_000;
/** Posição mais velha que isto: "Sem sinal". */
export const STALE_AFTER_MS = 2 * 60_000;

/* ---------- checagem do formato (fail closed) ---------- */

const SHAPE_ERROR = 'resposta fora do formato';
const isObj = (d: unknown): d is Record<string, unknown> => !!d && typeof d === 'object' && !Array.isArray(d);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNumOrNull = (v: unknown): boolean => v === null || isNum(v);
const allNum = (o: Record<string, unknown>, keys: string[]): boolean => keys.every((k) => isNum(o[k]));

const isStr = (v: unknown): v is string => typeof v === 'string';
const isIso = (v: unknown): v is string => isStr(v) && Number.isFinite(Date.parse(v));
const isIsoOrNull = (v: unknown): boolean => v === null || isIso(v);
const isStrOrNull = (v: unknown): boolean => v === null || isStr(v);
const oneOf = (v: unknown, list: readonly string[]): boolean => isStr(v) && list.includes(v);
const oneOfOrNull = (v: unknown, list: readonly string[]): boolean => v === null || oneOf(v, list);
const FAULTS: readonly string[] = ['customer', 'store', 'motoboy', 'platform'];
const ATTENTIONS: readonly string[] = [
  'estorno_pendente', 'loja_parada', 'cliente_decidindo', 'sem_motoboy', 'retirada_demorada', 'atrasado',
];
const TAGS: readonly string[] = ['Urgente', 'Esperando', 'Lote', 'KYC', 'Suporte', 'Receita', 'Operação'];
const TIMELINE_KEYS: readonly string[] = ['created', 'paid', 'accepted', 'assigned', 'picked', 'delivered', 'cancelled'];
const idName = (v: unknown): boolean => isObj(v) && isStr(v.id) && isStr(v.name);

const isQueueItem = (i: unknown): boolean => isObj(i) && isStr(i.id) && isStr(i.title) && isStr(i.context)
  && isIso(i.since) && oneOf(i.tag, TAGS) && isStr(i.href);

export function isQueueResponse(d: unknown): d is QueueResponse {
  return isObj(d) && Array.isArray(d.groups) && d.groups.every((g) => isObj(g)
    && isStr(g.type) && isStr(g.group) && isNum(g.count) && Array.isArray(g.items) && g.items.every(isQueueItem));
}

export function isOpsSummary(d: unknown): d is OpsSummary {
  if (!isObj(d) || !isObj(d.today) || !Array.isArray(d.perHour) || !isObj(d.health)) return false;
  const h = d.health;
  return allNum(d.today, [
    'gmv', 'gmvLastWeekSameTime', 'orders', 'ordersActive', 'cancelPct', 'cancelLate',
    'motoboysOnline', 'motoboysDelivering', 'motoboysFree',
  ])
    && d.perHour.every((p) => isObj(p) && isNum(p.hour) && isNum(p.count))
    && isNumOrNull(h.storeAcceptAvgMin) && isNumOrNull(h.findMotoboyAvgMin) && isNumOrNull(h.deliveryAvgMin);
}

export function isAdminOrdersResponse(d: unknown): d is AdminOrdersResponse {
  if (!isObj(d) || !Array.isArray(d.items) || !isObj(d.meta)) return false;
  if (!(d.nextCursor == null || isStr(d.nextCursor))) return false;
  const m = d.meta;
  return allNum(m, ['active', 'activePaid', 'awaitingPix', 'attention', 'acceptLimitMin', 'poolTimeoutMin', 'deliveredToday'])
    && isNumOrNull(m.acceptAvgMin) && isNumOrNull(m.findMotoboyAvgMin) && typeof m.attentionTruncated === 'boolean'
    && d.items.every((r) => isObj(r) && isStr(r.id) && isStr(r.shortId) && isStr(r.status) && isStrOrNull(r.deliveryStatus)
      && idName(r.store) && (r.motoboy === null || idName(r.motoboy))
      && isIso(r.createdAt) && isIso(r.stageSince) && isNum(r.total) && oneOfOrNull(r.attention, ATTENTIONS));
}

export function isAdminOrderDetail(d: unknown): d is AdminOrderDetail {
  if (!isObj(d) || !isStr(d.id) || !isStr(d.shortId) || !isStr(d.status) || !isStrOrNull(d.deliveryStatus)) return false;
  if (!oneOf(d.settlementMode, ['custody', 'direct']) || typeof d.refundPending !== 'boolean') return false;
  if (!idName(d.store)) return false;
  const c = d.customer;
  if (!isObj(c) || !isStr(c.id) || !isStr(c.name) || !isNum(c.ordersCount) || !isNum(c.cancellations30d)) return false;
  const mb = d.motoboy;
  if (mb !== null && !(isObj(mb) && idName(mb))) return false;
  const m = d.money;
  // Ruling de segurança: sem permissão, as três partes vêm null e payouts [] / motoboyTransfer null (não é zero).
  if (!isObj(m) || !allNum(m, ['subtotal', 'deliveryFee', 'couponDiscount', 'walletApplied', 'paidByCustomer'])
    || !isNumOrNull(m.storeShare) || !isNumOrNull(m.motoboyShare) || !isNumOrNull(m.platformShare)
    || !Array.isArray(m.payouts) || !m.payouts.every((p) => isObj(p) && isStr(p.id) && isStr(p.recipientType) && isNum(p.amount) && isStr(p.status))
    || !(m.motoboyTransfer === null || (isObj(m.motoboyTransfer) && isStr(m.motoboyTransfer.status) && isNum(m.motoboyTransfer.amount)))) {
    return false;
  }
  const k = d.cancellation;
  if (k !== null && !(isObj(k) && isStr(k.cancelledBy) && isStrOrNull(k.faultParty) && isStr(k.reason)
    && isStrOrNull(k.adminName) && isIso(k.at) && isStr(k.refundStatus))) return false;
  return Array.isArray(d.timeline) && d.timeline.every((t) => isObj(t) && oneOf(t.key, TIMELINE_KEYS) && isIsoOrNull(t.at) && isNumOrNull(t.sincePrevMin))
    && Array.isArray(d.adminActions) && d.adminActions.every((a) => isObj(a) && isStr(a.id) && oneOf(a.action, ['cancel', 'reassign'])
      && isStr(a.actorName) && isStr(a.reason) && oneOfOrNull(a.faultParty, FAULTS) && isIso(a.at))
    && Array.isArray(d.items) && d.items.every((i) => isObj(i) && isStr(i.name) && allNum(i, ['quantity', 'unitPrice', 'total']))
    && Array.isArray(d.allowedActions) && d.allowedActions.every((x) => oneOf(x, ['cancel', 'reassign']));
}

export function isOpsMapResponse(d: unknown): d is OpsMapResponse {
  return isObj(d) && Array.isArray(d.motoboys) && Array.isArray(d.waiting) && Array.isArray(d.inDelivery)
    && isObj(d.dispatch) && allNum(d.dispatch, ['initialKm', 'stepKm', 'stepSeconds', 'maxKm', 'poolTimeoutMin'])
    && d.motoboys.every((m) => isObj(m) && isStr(m.id) && isStr(m.name) && isNum(m.lat) && isNum(m.lng) && isStr(m.updatedAt)
      && oneOf(m.state, ['free', 'delivering', 'stale']) && isStrOrNull(m.orderId) && isStrOrNull(m.shortId))
    && d.waiting.every((w) => isObj(w) && isStr(w.orderId) && isStr(w.shortId) && isStr(w.storeName)
      && isNumOrNull(w.storeLat) && isNumOrNull(w.storeLng) && isIso(w.since) && isNumOrNull(w.radiusKm)
      && typeof w.customerDeciding === 'boolean')
    && d.inDelivery.every((x) => isObj(x) && isStr(x.orderId) && isStr(x.shortId) && isStr(x.motoboyName)
      && oneOf(x.stage, ['indo_para_loja', 'levando']))
    && Array.isArray(d.storesWithoutCourier)
    && d.storesWithoutCourier.every((s) => isObj(s) && isStr(s.id) && isStr(s.name) && isNum(s.lat) && isNum(s.lng));
}

export function isCancelPreview(d: unknown): d is CancelPreview {
  return isObj(d) && oneOf(d.fault, FAULTS) && allNum(d, ['customerRefund', 'feeCharged', 'motoboyCompensation'])
    && oneOfOrNull(d.compensationPaidBy, ['customer', 'store', 'platform'])
    && oneOfOrNull(d.countsAgainst, ['customer', 'store', 'motoboy']);
}

const isCancelResult = (d: unknown): d is CancelResult => isObj(d) && d.ok === true
  && typeof d.cancellationId === 'string' && isNum(d.refundAmount) && typeof d.refundStatus === 'string';

function shaped<T>(data: unknown, ok: (d: unknown) => d is T): T {
  if (!ok(data)) throw new Error(SHAPE_ERROR);
  return data;
}

/* ---------- chamadas ---------- */

const orderPath = (id: string) => `/admin/orders/${encodeURIComponent(id)}`;

export async function fetchQueue(): Promise<QueueResponse> {
  const res = await api.get('/admin/queue');
  return shaped(res.data, isQueueResponse);
}

export async function fetchOpsSummary(): Promise<OpsSummary> {
  const res = await api.get('/admin/ops/summary');
  return shaped(res.data, isOpsSummary);
}

export async function fetchAdminOrders(
  filter: OrdersFilter,
  opts: { storeId?: string | null; cursor?: string | null } = {},
): Promise<AdminOrdersResponse> {
  const params = new URLSearchParams({ filtro: filter });
  if (opts.storeId) params.set('storeId', opts.storeId);
  if (opts.cursor) params.set('cursor', opts.cursor);
  const res = await api.get(`/admin/orders?${params}`);
  const page = shaped(res.data, isAdminOrdersResponse);
  return { ...page, nextCursor: page.nextCursor ?? null };
}

export async function fetchAdminOrder(id: string): Promise<AdminOrderDetail> {
  const res = await api.get(orderPath(id));
  return shaped(res.data, isAdminOrderDetail);
}

export async function fetchOpsMap(): Promise<OpsMapResponse> {
  const res = await api.get('/admin/ops/map');
  return shaped(res.data, isOpsMapResponse);
}

export async function fetchCancelPreview(id: string, fault: CancelFault): Promise<CancelPreview> {
  const res = await api.get(`${orderPath(id)}/cancel-preview?fault=${fault}`);
  return shaped(res.data, isCancelPreview);
}

export async function adminCancelOrder(id: string, fault: CancelFault, reason: string): Promise<CancelResult> {
  const res = await api.post(`${orderPath(id)}/cancel`, { fault, reason });
  return shaped(res.data, isCancelResult);
}

export async function adminReassign(id: string, reason: string): Promise<void> {
  const res = await api.post(`${orderPath(id)}/reassign`, { reason });
  if (!isObj(res.data) || res.data.ok !== true) throw new Error(SHAPE_ERROR);
}

/* ---------- fila de hoje ---------- */

/** Ordem da spec 3.1: dinheiro do cliente → pessoa esperando → receita → operação. */
export const QUEUE_GROUP_ORDER: QueueGroup[] = ['customer_money', 'person_waiting', 'revenue', 'operation'];

export type QueueFilter = 'tudo' | 'dinheiro' | 'pessoas' | 'operacao';
export const QUEUE_FILTERS: { key: QueueFilter; label: string; groups: QueueGroup[] }[] = [
  { key: 'tudo', label: 'Tudo', groups: QUEUE_GROUP_ORDER },
  { key: 'dinheiro', label: 'Dinheiro', groups: ['customer_money', 'revenue'] },
  { key: 'pessoas', label: 'Pessoas', groups: ['person_waiting'] },
  { key: 'operacao', label: 'Operação', groups: ['operation'] },
];

/** Nome do assunto em "Não deu para carregar X" e "Mais N em X". */
export const QUEUE_TYPE_LABEL: Record<QueueType, string> = {
  refund: 'estornos',
  withdrawal: 'saques',
  motoboy_transfer: 'Pix aos motoboys',
  verification: 'verificações',
  support: 'chamados do suporte',
  payout: 'repasses',
  plan_change: 'trocas de plano',
  order_no_motoboy: 'pedidos sem motoboy',
  order_store_late: 'pedidos parados na loja',
};

export const QUEUE_TAG_TONE: Record<QueueTag, StatusTone> = {
  Urgente: 'bad',
  Esperando: 'warn',
  Lote: 'info',
  KYC: 'info',
  Suporte: 'info',
  Receita: 'ok',
  'Operação': 'warn',
};

export type QueueRow =
  | { kind: 'item'; key: string; type: QueueType; group: QueueGroup; item: QueueItem }
  | { kind: 'more'; key: string; type: QueueType; group: QueueGroup; count: number }
  | { kind: 'error'; key: string; type: QueueType; group: QueueGroup; message: string };

const groupsOf = (filter: QueueFilter) => QUEUE_FILTERS.find((f) => f.key === filter)?.groups ?? QUEUE_GROUP_ORDER;

/**
 * Linhas da fila na ordem da spec: por grupo; dentro do grupo, a mais antiga primeiro (entre todos os tipos do
 * grupo); depois "Mais N em X" de quem tem mais que os 5 itens; por fim, a linha de erro de cada tipo que falhou.
 */
export function buildQueueRows(groups: QueueGroupEntry[], filter: QueueFilter): QueueRow[] {
  const allowed = groupsOf(filter);
  const rows: QueueRow[] = [];
  for (const group of QUEUE_GROUP_ORDER) {
    if (!allowed.includes(group)) continue;
    const entries = groups.filter((g) => g.group === group);
    const ok = entries.filter((g) => !g.error);
    ok.flatMap((g) => g.items.map((item) => ({ type: g.type, item })))
      .sort((a, b) => Date.parse(a.item.since) - Date.parse(b.item.since))
      .forEach(({ type, item }) => rows.push({ kind: 'item', key: `${type}:${item.id}`, type, group, item }));
    ok.filter((g) => g.count > g.items.length).forEach((g) => rows.push({
      kind: 'more', key: `${g.type}:more`, type: g.type, group, count: g.count - g.items.length,
    }));
    entries.filter((g) => !!g.error).forEach((g) => rows.push({
      kind: 'error', key: `${g.type}:error`, type: g.type, group, message: String(g.error),
    }));
  }
  return rows;
}

/** "Fila de hoje · N": soma das contagens dos tipos que carregaram, no filtro atual. */
export function queueTotal(groups: QueueGroupEntry[], filter: QueueFilter): number {
  const allowed = groupsOf(filter);
  return groups.filter((g) => !g.error && allowed.includes(g.group)).reduce((sum, g) => sum + g.count, 0);
}

/* ---------- pedidos ---------- */

export const ORDERS_FILTERS: { key: OrdersFilter; label: string }[] = [
  { key: 'atencao', label: 'Atenção' },
  { key: 'todos', label: 'Todos' },
  { key: 'aguardando_pix', label: 'Aguardando Pix' },
  { key: 'na_loja', label: 'Na loja' },
  { key: 'em_entrega', label: 'Em entrega' },
  { key: 'cancelados_hoje', label: 'Cancelados hoje' },
];

export const ATTENTION_LABEL: Record<AttentionReason, string> = {
  estorno_pendente: 'Estorno pendente',
  loja_parada: 'Loja não aceitou',
  cliente_decidindo: 'Cliente decidindo',
  sem_motoboy: 'Sem motoboy',
  retirada_demorada: 'Retirada demorada',
  atrasado: 'Atrasado',
};

export const ATTENTION_TONE: Record<AttentionReason, StatusTone> = {
  estorno_pendente: 'bad',
  loja_parada: 'bad',
  cliente_decidindo: 'warn',
  sem_motoboy: 'bad',
  retirada_demorada: 'warn',
  atrasado: 'bad',
};

export const orderTag = (shortId: string): string => (shortId.startsWith('#') ? shortId : `#${shortId}`);

/** Situação do pedido para a equipe: a etapa da entrega vence o status do pedido enquanto ele anda. */
export function adminOrderStatus(status: string, deliveryStatus: string | null): { label: string; tone: StatusTone } {
  if (status === 'cancelado') return { label: 'Cancelado', tone: 'bad' };
  if (status === 'rejeitado') return { label: 'Recusado pela loja', tone: 'bad' };
  if (status === 'enviado') return { label: 'Em entrega', tone: 'info' };
  if (status === 'entregue') return { label: 'Entregue', tone: 'ok' };
  if (status === 'criado') return { label: 'Aguardando pagamento', tone: 'neutral' };
  if (deliveryStatus === 'picked') return { label: 'Em entrega', tone: 'info' };
  if (deliveryStatus === 'assigned') return { label: 'Motoboy indo à loja', tone: 'info' };
  if (status === 'aguardando_motoboy' || deliveryStatus === 'pending') return { label: 'Procurando motoboy', tone: 'warn' };
  if (status === 'pago') return { label: 'Na loja', tone: 'warn' };
  return { label: status, tone: 'neutral' };
}

/* ---------- pedido do admin ---------- */

export const TIMELINE_LABEL: Record<TimelineKey, string> = {
  created: 'Criado',
  paid: 'Pago',
  accepted: 'Loja aceitou',
  assigned: 'Motoboy atribuído',
  picked: 'Retirado',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

export const ADMIN_ACTION_LABEL: Record<AdminOrderAllowedAction, string> = {
  cancel: 'Cancelado pelo admin',
  reassign: 'Motoboy reatribuído',
};

export const CANCEL_FAULTS: CancelFault[] = ['customer', 'store', 'motoboy', 'platform'];

export const FAULT_LABEL: Record<CancelFault, string> = {
  customer: 'Cliente',
  store: 'Loja',
  motoboy: 'Motoboy',
  platform: 'Ninguém (problema do DROP)',
};

/** "Taxa cobrada do cliente" / "da loja". */
export const FEE_FROM_LABEL: Record<CancelFault, string> = {
  customer: 'do cliente',
  store: 'da loja',
  motoboy: 'do motoboy',
  platform: 'do DROP',
};

export const PAYER_LABEL: Record<NonNullable<CancelPreview['compensationPaidBy']>, string> = {
  customer: 'pelo cliente',
  store: 'pela loja',
  platform: 'pelo DROP',
};

export const COUNTS_AGAINST_LABEL: Record<NonNullable<CancelPreview['countsAgainst']>, string> = {
  customer: 'Do cliente',
  store: 'Da loja',
  motoboy: 'Do motoboy',
};

const CANCELLED_BY_LABEL: Record<string, string> = {
  customer: 'pelo cliente',
  store: 'pela loja',
  motoboy: 'pelo motoboy',
  admin: 'pela equipe do DROP',
};

export const SETTLEMENT_LABEL: Record<AdminOrderDetail['settlementMode'], string> = {
  custody: 'Custódia',
  direct: 'SaaS',
};

export const PAYOUT_STATUS_LABEL: Record<string, string> = {
  pending: 'Aguardando liberação',
  releasing: 'Em liberação',
  released: 'Liberado',
  requested: 'Saque pedido',
  paid: 'Pago',
  cancelled: 'Cancelado',
};

export const RECIPIENT_LABEL: Record<string, string> = { store: 'Loja', motoboy: 'Motoboy' };

export type TimelineEntry =
  | { kind: 'step'; key: string; step: TimelineStep }
  | { kind: 'action'; key: string; action: AdminOrderActionView };

/**
 * Etapas na ordem do servidor, com cada ação do admin antes da primeira etapa com horário posterior a ela.
 * Etapa sem horário fica no lugar; ação mais nova que todas as etapas vai para o fim.
 */
export function mergeTimeline(steps: TimelineStep[], actions: AdminOrderActionView[]): TimelineEntry[] {
  const pending = [...actions].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const out: TimelineEntry[] = [];
  const flushBefore = (t: number) => {
    while (pending.length > 0 && Date.parse(pending[0].at) < t) {
      const a = pending.shift() as AdminOrderActionView;
      out.push({ kind: 'action', key: `a:${a.id}`, action: a });
    }
  };
  for (const step of steps) {
    if (step.at) flushBefore(Date.parse(step.at));
    out.push({ kind: 'step', key: `s:${step.key}`, step });
  }
  pending.forEach((a) => out.push({ kind: 'action', key: `a:${a.id}`, action: a }));
  return out;
}

/** "Motivo: … · por Marina Rocha · culpa: Loja" (fim vermelho da linha do tempo). */
export function cancellationNote(c: NonNullable<AdminOrderDetail['cancellation']>): string {
  const who = c.adminName ? `por ${c.adminName}` : (CANCELLED_BY_LABEL[c.cancelledBy] ?? c.cancelledBy);
  const fault = c.faultParty ? `culpa: ${FAULT_LABEL[c.faultParty as CancelFault] ?? c.faultParty}` : null;
  return [`Motivo: ${c.reason}`, who, fault].filter(Boolean).join(' · ');
}

/** Valor 0 (pedido não pago, I1) é "nada a devolver" seja qual for o status do estorno. */
export function cancelResultText(r: CancelResult): string {
  if (r.refundAmount <= 0) return 'Cancelado · nada a devolver';
  if (r.refundStatus !== 'processed') return 'Cancelado · estorno pendente, veja Estornos';
  return `Cancelado · ${formatMoney(r.refundAmount)} devolvidos`;
}

/** Prévia sem nada a devolver e sem taxa: o pedido não foi pago (I1). */
export const isUnpaidPreview = (p: Pick<CancelPreview, 'customerRefund' | 'feeCharged'>): boolean =>
  p.customerRefund <= 0 && p.feeCharged <= 0;

/* ---------- mapa ---------- */

export const MAP_STATE_LABEL: Record<MotoboyMapState, string> = {
  free: 'Livre',
  delivering: 'Em entrega',
  stale: 'Sem sinal',
};

export const STAGE_LABEL: Record<OpsMapResponse['inDelivery'][number]['stage'], string> = {
  indo_para_loja: 'indo para a loja',
  levando: 'levando ao cliente',
};

/** Estado do ponto agora: o do servidor, ou "Sem sinal" se a posição envelheceu desde a leitura. */
export function motoboyMapState(m: { state: MotoboyMapState; updatedAt: string }, now: number = Date.now()): MotoboyMapState {
  if (m.state === 'stale') return 'stale';
  const at = Date.parse(m.updatedAt);
  return !Number.isFinite(at) || now - at > STALE_AFTER_MS ? 'stale' : m.state;
}

/**
 * Pedido do motoboy tocado no mapa: o orderId/shortId do próprio item (P1.6), com a etapa vinda de inDelivery
 * pelo orderId. Sem pedido: null ("sem pedido agora").
 */
export function motoboyOrder(
  map: Pick<OpsMapResponse, 'inDelivery'>,
  m: { orderId: string | null; shortId: string | null },
): string | null {
  if (!m.orderId || !m.shortId) return null;
  const d = map.inDelivery.find((x) => x.orderId === m.orderId);
  return d ? `${orderTag(m.shortId)} · ${STAGE_LABEL[d.stage]}` : orderTag(m.shortId);
}

/* ---------- textos curtos ---------- */

export function elapsedLabel(iso: string, now: number = Date.now()): string {
  const min = Math.floor(Math.max(0, now - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(min) || min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

export function ageLabel(iso: string, now: number = Date.now()): string {
  const e = elapsedLabel(iso, now);
  return e === 'agora' ? e : `há ${e}`;
}

export const minutesLabel = (n: number | null): string => (n === null ? '—' : `${Math.round(n)} min`);

const decimal = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
export const pctLabel = (n: number): string => `${decimal(n)}%`;
export const kmLabel = (n: number): string => `${decimal(n)} km`;
export const radiusLabel = (km: number | null): string => (km === null ? 'aberto a todos' : `raio ${kmLabel(km)}`);

export function gmvComparison(gmv: number, lastWeek: number): string {
  if (lastWeek <= 0) return `Semana passada até esta hora: ${formatMoney(lastWeek)}`;
  const pct = Math.round(((gmv - lastWeek) / lastWeek) * 100);
  return `${pct >= 0 ? '+' : '−'}${Math.abs(pct)}% vs. semana passada até esta hora`;
}

/* ---------- erros ---------- */

const CONFLICT_CODES = new Set(['ORDER_CHANGED', 'ORDER_NOT_CANCELLABLE', 'DELIVERY_CHANGED', 'DELIVERY_NOT_REASSIGNABLE']);

interface HttpLike { response?: { status?: number; data?: { currentStatus?: unknown } } }
const httpOf = (err: unknown): HttpLike => (err && typeof err === 'object' ? err : {}) as HttpLike;

/** 409 de pedido ou de entrega que mudou: a tela relê o pedido. */
export function isOpsConflict(err: unknown): boolean {
  const code = serverErrorCode(err);
  return httpOf(err).response?.status === 409 && !!code && CONFLICT_CODES.has(code);
}

/** Mensagem em português dos códigos da D3b-1; o resto, o texto do servidor (403 vira "sem permissão"). */
export function opsErrorMessage(err: unknown, fallback?: string): string {
  const raw = httpOf(err).response?.data?.currentStatus;
  const current = typeof raw === 'string' ? raw : null;
  switch (serverErrorCode(err)) {
    case 'ORDER_CHANGED':
      return 'O pedido mudou. Recarregue.';
    case 'ORDER_NOT_CANCELLABLE':
      return current
        ? `Este pedido não pode mais ser cancelado (situação: ${adminOrderStatus(current, null).label.toLowerCase()}).`
        : 'Este pedido não pode mais ser cancelado.';
    case 'DELIVERY_CHANGED':
      return current === 'picked' ? 'O motoboy já retirou o pedido' : 'A entrega mudou';
    case 'DELIVERY_NOT_REASSIGNABLE':
      return current === 'picked' ? 'O motoboy já retirou o pedido' : 'Só dá para reatribuir enquanto o motoboy vai até a loja.';
    case 'ORDER_NOT_FOUND':
      return 'Pedido não encontrado.';
    default:
      return serverErrorMessage(err, fallback);
  }
}

/** Para jogar dentro do onClick da AdminSheet, que mostra `data.error`: texto em português e o código. */
export function flattenOpsError(err: unknown, fallback?: string): { response: { status?: number; data: { error: string; code?: string } } } {
  const code = serverErrorCode(err);
  return {
    response: {
      status: httpOf(err).response?.status,
      data: { error: opsErrorMessage(err, fallback), ...(code ? { code } : {}) },
    },
  };
}
