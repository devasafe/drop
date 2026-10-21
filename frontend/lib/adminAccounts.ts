/**
 * Pessoas e lojas (D3b-2a): os formatos das rotas do servidor (espelho de src/services/adminAccounts/types.ts;
 * plano mestre "Interfaces compartilhadas", spec 6 e "Contratos consumidos" da P3), as chamadas, os papéis, os
 * rótulos e as mensagens de Usuários, Lojas e das duas fichas.
 * - Resposta fora do formato vira erro (fail closed): a tela mostra o erro com "Tentar de novo", nunca lista vazia.
 * - Bloco que o servidor não mandou (motoboy, lojas, carteira, ganhos) não aparece; `null` conta como não mandado.
 * - Erro: as rotas respondem { error: <texto>, code }; o código vem de `code` (ou de `error.code`, formato do
 *   errorHandler); o texto em português dos códigos sai daqui.
 */
import type { StatusTone } from '../components/admin/StatusTag';
import { adminErrorMessage } from './adminErrors';
import { actorLabel, spTime } from './adminMoney';
import { ageLabel } from './adminOps';
import { REJECT_REASON_LABEL, VERIFICATION_KIND_SHORT } from './adminVerificacoes';
import api from './api';
import { formatMoney } from './money';

/* ---------- formatos (iguais ao backend) ---------- */

export type UserTab = 'all' | 'cliente' | 'lojista' | 'motoboy' | 'equipe' | 'bloqueados';
export type UserStatus = 'active' | 'inactive' | 'blocked';
export type VerificationSummary = 'ok' | 'pending' | 'rejected' | 'none';
/** `none` = não enviado, ou e-mail ainda não confirmado (nada espera o admin). */
export type VerificationItemStatus = 'pending' | 'approved' | 'rejected' | 'none';
export type DebtStatus = 'pending' | 'collected' | 'forgiven';
export type StoreSituation = 'open' | 'closed' | 'paused' | 'admin_paused';
export type ReceivingStatus = 'ok' | 'pending' | 'problem' | 'na';
export type StoreMode = 'custodia' | 'saas';
export type StoreFilter = 'all' | 'admin_paused' | 'attention' | 'trial';
export type SaasStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'cancelled';
export type AccountActionType =
  | 'block' | 'unblock' | 'roles_change' | 'disconnect' | 'debt_forgive' | 'store_pause' | 'store_unpause' | 'note'
  | 'verification_decision' | 'trial_extend' | 'saas_cancel' | 'plan_reject';

export interface ActorRef { id: string; name: string | null }

export interface TimelineItem {
  id: string;
  /** AccountActionType; tipo que a tela não conhece (a D3b-2b acrescenta) aparece como "Ação da equipe". */
  type: string;
  /** Motivo da ação, ou o texto da nota (type 'note'). */
  reason: string | null;
  meta: unknown;
  createdAt: string;
  actor: { id: string; name: string | null; role: string };
}
export interface TimelineResponse { items: TimelineItem[]; nextCursor: string | null }

export interface UserListItem {
  id: string;
  name: string;
  email: string;
  roles: string[];
  status: UserStatus;
  blockReason: string | null;
  verification: VerificationSummary;
  lastSeenAt: string | null;
  orders90d: number;
  pendingDebt: number | null;
}
export interface UserListResponse { items: UserListItem[]; nextCursor: string | null }

export interface AccountOrder { id: string; status: string; total: number; createdAt: string }
export interface UserOrder extends AccountOrder { store: { id: string; name: string } }
export interface UserDebt {
  id: string;
  amount: number;
  status: DebtStatus;
  reason: string;
  sourceOrderId: string | null;
  createdAt: string;
  forgivenAt: string | null;
}
export interface UserVerificationItem { kind: string; status: VerificationItemStatus; reason: string | null; at: string | null }
export interface UserCan { block: boolean; unblock: boolean; disconnect: boolean; roles: boolean; forgiveDebt: boolean; note: boolean }
export interface UserBlock { reason: string | null; at: string | null; by: ActorRef | null }
export interface UserWallet { balance: number; available: number; pending: number; blocked: number }
export interface UserMotoboy {
  cnh: string | null;
  plate: string | null;
  hasPixKey: boolean;
  deliveries30d: number;
  /** Só com payout:view ou money:overview. */
  earnings30d?: number | null;
}
export interface UserDetail {
  profile: {
    id: string;
    name: string;
    email: string;
    phoneLast4: string | null;
    roles: string[];
    status: UserStatus;
    block: UserBlock | null;
    createdAt: string;
    lastSeenAt: string | null;
  };
  verification: UserVerificationItem[];
  orders: UserOrder[];
  debts: UserDebt[];
  /** Só para quem tem o papel. */
  motoboy?: UserMotoboy | null;
  /** Só para lojista. */
  stores?: { id: string; name: string; situation: StoreSituation }[] | null;
  /** Só com payout:view ou money:overview. Cada carteira separada; null = a pessoa não tem aquela. */
  wallets?: { cliente: UserWallet | null; motoboy: UserWallet | null } | null;
  timeline: TimelineResponse;
  can: UserCan;
}

export interface StoreListItem {
  id: string;
  name: string;
  ownerName: string;
  plan: number | null;
  mode: StoreMode;
  rating90d: number | null;
  /** Fração de 0 a 1; null com menos de 5 pedidos. */
  cancelRate30d: number | null;
  receiving: ReceivingStatus;
  situation: StoreSituation;
  attention: boolean;
}
export interface StoreListResponse { items: StoreListItem[]; nextCursor: string | null }
export interface StoreCan { pause: boolean; unpause: boolean; note: boolean; extendTrial: boolean; cancelSaas: boolean }
/**
 * Mensalidade (SaaS) da loja; `cancelledAt` é quando o admin cancelou (D3b-2b). `coveredUntil` (só na ficha, P2.5) é o
 * último instante coberto, calculado no servidor pela mesma conta da vitrine; as respostas das ações não trazem.
 */
export interface StoreSaas {
  status: SaasStatus;
  trialEndsAt: string | null;
  paidUntil: string | null;
  cancelledAt: string | null;
  coveredUntil?: string | null;
}
export interface StoreAsaasAudit { action: string; apiKeyLast4: string | null; actor: ActorRef; createdAt: string }
export interface StoreAsaasConsent { termsVersion: string; ip: string | null; acceptedAt: string; actorRole: string }
/** Conta Asaas própria da loja: alterações (até 20, mais novas primeiro) e o último aceite do termo. Só o CEO recebe. */
export interface StoreAsaasHistory { audits: StoreAsaasAudit[]; consent: StoreAsaasConsent | null }
export interface StoreAdminPause { at: string; reason: string; by: ActorRef | null }
export interface StoreDetail {
  profile: {
    id: string;
    name: string;
    cnpj: string | null;
    owner: { id: string; name: string };
    city: string | null;
    situation: StoreSituation;
    adminPause: StoreAdminPause | null;
  };
  stats30d: { orders: number; cancelledByStore: number; rating: number | null };
  reviews: { orderId: string; rating: number; comment: string; createdAt: string }[];
  receiving: { status: ReceivingStatus; detail: string | null };
  plan: {
    plan: number | null;
    mode: StoreMode;
    saas: StoreSaas | null;
  };
  orders: AccountOrder[];
  timeline: TimelineResponse;
  can: StoreCan;
  /** Só o CEO recebe (ruling 11); para os outros a chave não vem. */
  asaasHistory?: StoreAsaasHistory | null;
}

/* ---------- checagem do formato (fail closed) ---------- */

const SHAPE_ERROR = 'resposta fora do formato';
const isObj = (d: unknown): d is Record<string, unknown> => !!d && typeof d === 'object' && !Array.isArray(d);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isIso = (v: unknown): v is string => isStr(v) && Number.isFinite(Date.parse(v));
const isIsoOrNull = (v: unknown): boolean => v === null || isIso(v);
const isStrOrNull = (v: unknown): boolean => v === null || isStr(v);
const isNumOrNull = (v: unknown): boolean => v === null || isNum(v);
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const oneOf = (v: unknown, list: readonly string[]): boolean => isStr(v) && list.includes(v);
const allNum = (o: Record<string, unknown>, keys: string[]): boolean => keys.every((k) => isNum(o[k]));
const allBool = (o: Record<string, unknown>, keys: string[]): boolean => keys.every((k) => isBool(o[k]));
const listOf = (v: unknown, ok: (x: unknown) => boolean): boolean => Array.isArray(v) && v.every(ok);
/** Bloco opcional: ausente ou null é "o servidor não mandou"; se veio, tem de estar no formato. */
const optional = (v: unknown, ok: (x: unknown) => boolean): boolean => v === undefined || v === null || ok(v);
const idName = (v: unknown): boolean => isObj(v) && isStr(v.id) && isStr(v.name);
const actorRef = (v: unknown): boolean => v === null || (isObj(v) && isStr(v.id) && isStrOrNull(v.name));
const isPage = (d: unknown, ok: (x: unknown) => boolean): boolean =>
  isObj(d) && listOf(d.items, ok) && (d.nextCursor === null || isStr(d.nextCursor));

const USER_STATUSES: readonly string[] = ['active', 'inactive', 'blocked'];
const VERIFICATION_SUMMARIES: readonly string[] = ['ok', 'pending', 'rejected', 'none'];
const VERIFICATION_ITEM_STATUSES: readonly string[] = ['pending', 'approved', 'rejected', 'none'];
const DEBT_STATUSES: readonly string[] = ['pending', 'collected', 'forgiven'];
const SITUATIONS: readonly string[] = ['open', 'closed', 'paused', 'admin_paused'];
const RECEIVINGS: readonly string[] = ['ok', 'pending', 'problem', 'na'];
const MODES: readonly string[] = ['custodia', 'saas'];
const SAAS_STATUSES: readonly string[] = ['trialing', 'active', 'past_due', 'paused', 'cancelled'];

const isTimelineItem = (i: unknown): boolean => isObj(i) && isStr(i.id) && isStr(i.type) && isStrOrNull(i.reason)
  && isIso(i.createdAt) && isObj(i.actor) && isStr(i.actor.id) && isStrOrNull(i.actor.name) && isStr(i.actor.role);

export function isTimelineResponse(d: unknown): d is TimelineResponse {
  return isPage(d, isTimelineItem);
}

const isUserListItem = (u: unknown): boolean => isObj(u) && isStr(u.id) && isStr(u.name) && isStr(u.email)
  && isStrArr(u.roles) && oneOf(u.status, USER_STATUSES) && isStrOrNull(u.blockReason)
  && oneOf(u.verification, VERIFICATION_SUMMARIES) && isIsoOrNull(u.lastSeenAt) && isNum(u.orders90d)
  && isNumOrNull(u.pendingDebt);

export function isUserListResponse(d: unknown): d is UserListResponse {
  return isPage(d, isUserListItem);
}

const isAccountOrder = (o: unknown): boolean => isObj(o) && isStr(o.id) && isStr(o.status) && isNum(o.total) && isIso(o.createdAt);
const isUserOrder = (o: unknown): boolean => isAccountOrder(o) && isObj(o) && idName(o.store);
const isDebt = (x: unknown): boolean => isObj(x) && isStr(x.id) && isNum(x.amount) && oneOf(x.status, DEBT_STATUSES)
  && isStr(x.reason) && isStrOrNull(x.sourceOrderId) && isIso(x.createdAt) && isIsoOrNull(x.forgivenAt);
const isVerificationItem = (v: unknown): boolean => isObj(v) && isStr(v.kind)
  && oneOf(v.status, VERIFICATION_ITEM_STATUSES) && isStrOrNull(v.reason) && isIsoOrNull(v.at);
const isMotoboy = (m: unknown): boolean => isObj(m) && isStrOrNull(m.cnh) && isStrOrNull(m.plate)
  && isBool(m.hasPixKey) && isNum(m.deliveries30d) && optional(m.earnings30d, isNum);
const isOwnedStore = (s: unknown): boolean => idName(s) && isObj(s) && oneOf(s.situation, SITUATIONS);
const isWallet = (w: unknown): boolean => isObj(w) && allNum(w, ['balance', 'available', 'pending', 'blocked']);
/** As duas chaves sempre vêm; cada uma é uma carteira ou null. */
const isWallets = (w: unknown): boolean =>
  isObj(w) && (w.cliente === null || isWallet(w.cliente)) && (w.motoboy === null || isWallet(w.motoboy));

export function isUserDetail(d: unknown): d is UserDetail {
  if (!isObj(d)) return false;
  const p = d.profile;
  const can = d.can;
  if (!isObj(p) || !isObj(can)) return false;
  const b = p.block;
  const profileOk = isStr(p.id) && isStr(p.name) && isStr(p.email) && isStrOrNull(p.phoneLast4) && isStrArr(p.roles)
    && oneOf(p.status, USER_STATUSES) && isIso(p.createdAt) && isIsoOrNull(p.lastSeenAt)
    && (b === null || (isObj(b) && isStrOrNull(b.reason) && isIsoOrNull(b.at) && actorRef(b.by)));
  return profileOk
    && listOf(d.verification, isVerificationItem)
    && listOf(d.orders, isUserOrder)
    && listOf(d.debts, isDebt)
    && optional(d.motoboy, isMotoboy)
    && optional(d.stores, (s) => listOf(s, isOwnedStore))
    && optional(d.wallets, isWallets)
    && isTimelineResponse(d.timeline)
    && allBool(can, ['block', 'unblock', 'disconnect', 'roles', 'forgiveDebt', 'note']);
}

const isStoreListItem = (s: unknown): boolean => isObj(s) && isStr(s.id) && isStr(s.name) && isStr(s.ownerName)
  && isNumOrNull(s.plan) && oneOf(s.mode, MODES) && isNumOrNull(s.rating90d) && isNumOrNull(s.cancelRate30d)
  && oneOf(s.receiving, RECEIVINGS) && oneOf(s.situation, SITUATIONS) && isBool(s.attention);

export function isStoreListResponse(d: unknown): d is StoreListResponse {
  return isPage(d, isStoreListItem);
}

const isStoreSaas = (s: unknown): s is StoreSaas => isObj(s) && oneOf(s.status, SAAS_STATUSES)
  && isIsoOrNull(s.trialEndsAt) && isIsoOrNull(s.paidUntil) && isIsoOrNull(s.cancelledAt) && optional(s.coveredUntil, isIso);
const isAsaasAudit = (a: unknown): boolean => isObj(a) && isStr(a.action) && isStrOrNull(a.apiKeyLast4)
  && isObj(a.actor) && isStr(a.actor.id) && isStrOrNull(a.actor.name) && isIso(a.createdAt);
const isAsaasConsent = (c: unknown): boolean => isObj(c) && isStr(c.termsVersion) && isStrOrNull(c.ip)
  && isIso(c.acceptedAt) && isStr(c.actorRole);
/** As duas chaves sempre vêm: `audits` (lista) e `consent` (o último aceite, ou null). */
const isAsaasHistory = (h: unknown): boolean =>
  isObj(h) && listOf(h.audits, isAsaasAudit) && (h.consent === null || isAsaasConsent(h.consent));

export function isStoreDetail(d: unknown): d is StoreDetail {
  if (!isObj(d)) return false;
  const { profile: p, stats30d: st, receiving: r, plan, can } = d;
  if (!isObj(p) || !isObj(st) || !isObj(r) || !isObj(plan) || !isObj(can)) return false;
  const pause = p.adminPause;
  const saas = plan.saas;
  return isStr(p.id) && isStr(p.name) && isStrOrNull(p.cnpj) && idName(p.owner) && isStrOrNull(p.city)
    && oneOf(p.situation, SITUATIONS)
    && (pause === null || (isObj(pause) && isIso(pause.at) && isStr(pause.reason) && actorRef(pause.by)))
    && isNum(st.orders) && isNum(st.cancelledByStore) && isNumOrNull(st.rating)
    && listOf(d.reviews, (x) => isObj(x) && isStr(x.orderId) && isNum(x.rating) && isStr(x.comment) && isIso(x.createdAt))
    && oneOf(r.status, RECEIVINGS) && isStrOrNull(r.detail)
    && isNumOrNull(plan.plan) && oneOf(plan.mode, MODES)
    && (saas === null || isStoreSaas(saas))
    && listOf(d.orders, isAccountOrder)
    && isTimelineResponse(d.timeline)
    && allBool(can, ['pause', 'unpause', 'note', 'extendTrial', 'cancelSaas'])
    && optional(d.asaasHistory, isAsaasHistory);
}

function shaped<T>(data: unknown, ok: (d: unknown) => d is T): T {
  if (!ok(data)) throw new Error(SHAPE_ERROR);
  return data;
}

/* ---------- chamadas ---------- */

const userPath = (id: string) => `/admin/users/${encodeURIComponent(id)}`;
const storePath = (id: string) => `/admin/stores/${encodeURIComponent(id)}`;
const withQuery = (path: string, params: URLSearchParams): string => {
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
};

export interface UserListQuery { q?: string; tab?: UserTab; withDebt?: boolean; cursor?: string | null }
export interface StoreListQuery { q?: string; filter?: StoreFilter; cursor?: string | null }

/** `q` vai aparado e como foi digitado (o servidor tira a máscara de CPF e telefone). */
export async function fetchUsers(query: UserListQuery = {}): Promise<UserListResponse> {
  const params = new URLSearchParams();
  const q = query.q?.trim();
  if (q) params.set('q', q);
  if (query.tab && query.tab !== 'all') params.set('tab', query.tab);
  if (query.withDebt) params.set('withDebt', '1');
  if (query.cursor) params.set('cursor', query.cursor);
  const res = await api.get(withQuery('/admin/users', params));
  return shaped(res.data, isUserListResponse);
}

export async function fetchStores(query: StoreListQuery = {}): Promise<StoreListResponse> {
  const params = new URLSearchParams();
  const q = query.q?.trim();
  if (q) params.set('q', q);
  if (query.filter && query.filter !== 'all') params.set('filter', query.filter);
  if (query.cursor) params.set('cursor', query.cursor);
  const res = await api.get(withQuery('/admin/stores', params));
  return shaped(res.data, isStoreListResponse);
}

export async function fetchUserDetail(id: string): Promise<UserDetail> {
  const res = await api.get(userPath(id));
  return shaped(res.data, isUserDetail);
}

export async function fetchUserTimeline(id: string, cursor: string): Promise<TimelineResponse> {
  const res = await api.get(withQuery(`${userPath(id)}/timeline`, new URLSearchParams({ cursor })));
  return shaped(res.data, isTimelineResponse);
}

export async function fetchStoreDetail(id: string): Promise<StoreDetail> {
  const res = await api.get(storePath(id));
  return shaped(res.data, isStoreDetail);
}

export async function fetchStoreTimeline(id: string, cursor: string): Promise<TimelineResponse> {
  const res = await api.get(withQuery(`${storePath(id)}/timeline`, new URLSearchParams({ cursor })));
  return shaped(res.data, isTimelineResponse);
}

export async function blockUser(id: string, reason: string): Promise<void> {
  await api.put(`${userPath(id)}/status`, { status: 'blocked', reason });
}

/** Motivo opcional (spec 5.2): só vai no corpo quando alguém escreveu. */
export async function unblockUser(id: string, reason: string): Promise<void> {
  await api.put(`${userPath(id)}/status`, reason ? { status: 'active', reason } : { status: 'active' });
}

export async function disconnectUser(id: string): Promise<void> {
  await api.post(`${userPath(id)}/disconnect`);
}

/** Grava a lista COMPLETA de papéis; `storesClosed` = lojas que o servidor fechou porque Lojista saiu. */
export async function saveUserRoles(id: string, roles: string[]): Promise<{ storesClosed: number }> {
  const res = await api.put(`${userPath(id)}/roles`, { roles });
  return { storesClosed: Number(res?.data?.storesClosed) || 0 };
}

export async function forgiveDebt(userId: string, debtId: string, reason: string): Promise<void> {
  await api.post(`${userPath(userId)}/debts/${encodeURIComponent(debtId)}/forgive`, { reason });
}

export async function addUserNote(id: string, text: string): Promise<void> {
  await api.post(`${userPath(id)}/notes`, { text });
}

export async function pauseStore(id: string, reason: string): Promise<void> {
  await api.post(`${storePath(id)}/pause`, { reason });
}

export async function unpauseStore(id: string, reason: string): Promise<void> {
  await api.post(`${storePath(id)}/unpause`, reason ? { reason } : {});
}

export async function addStoreNote(id: string, text: string): Promise<void> {
  await api.post(`${storePath(id)}/notes`, { text });
}

export const TRIAL_DAYS = [7, 14, 30] as const;
export type TrialDays = (typeof TRIAL_DAYS)[number];

/** Mensalidade devolvida pela ação ({ saas }); null fora do formato (a ficha relê de qualquer jeito). */
const saasFrom = (data: unknown): StoreSaas | null => {
  const s = isObj(data) ? data.saas : null;
  return isStoreSaas(s) ? s : null;
};

export async function extendTrial(storeId: string, days: TrialDays, reason: string): Promise<StoreSaas | null> {
  const res = await api.post(`${storePath(storeId)}/saas/extend-trial`, { days, reason });
  return saasFrom(res?.data);
}

export async function cancelSaas(storeId: string, reason: string): Promise<StoreSaas | null> {
  const res = await api.post(`${storePath(storeId)}/saas/cancel`, { reason });
  return saasFrom(res?.data);
}

/* ---------- regras de texto ---------- */

export const SEARCH_DEBOUNCE_MS = 300;
export const REASON_MIN = 5;
export const REASON_MAX = 500;
export const NOTE_MAX = 2000;

export const reasonIsValid = (text: string): boolean => {
  const n = text.trim().length;
  return n >= REASON_MIN && n <= REASON_MAX;
};
export const noteIsValid = (text: string): boolean => {
  const n = text.trim().length;
  return n >= 1 && n <= NOTE_MAX;
};

/* ---------- papéis (vieram de pages/admin/users.tsx, D3a) ---------- */

/** Papéis que PUT /admin/users/:id/roles aceita (ALLOWED_ROLES do servidor), com o rótulo da tela. */
export const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'ceo', label: 'CEO' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'gerente_geral', label: 'Gerente geral' },
  { value: 'gerente_clientes', label: 'Gerente de clientes' },
  { value: 'gerente_lojistas', label: 'Gerente de lojistas' },
  { value: 'gerente_motoboys', label: 'Gerente de motoboys' },
  { value: 'lojista', label: 'Lojista' },
  { value: 'cliente', label: 'Cliente' },
  { value: 'motoboy', label: 'Motoboy' },
];

/** Papéis da equipe (ADMIN_ROLES do servidor): só o CEO atribui e só o CEO mexe em quem tem um deles. */
export const STAFF_ROLES = ['ceo', 'marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys'];

const ROLE_ORDER = ROLE_OPTIONS.map((r) => r.value);
export const sortRoles = (roles: string[]): string[] =>
  [...roles].sort((a, b) => (ROLE_ORDER.indexOf(a) + 1 || 99) - (ROLE_ORDER.indexOf(b) + 1 || 99));
/** Todo mundo pode comprar: `cliente` sempre entra. */
export const withCliente = (roles: string[]): string[] => sortRoles(Array.from(new Set([...roles, 'cliente'])));
export const sameRoles = (a: string[], b: string[]): boolean => a.length === b.length && a.every((r) => b.includes(r));
export const roleLabel = (role: string): string => ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;

/** Papéis além de cliente ("Gerente de motoboys · Motoboy"); só "Cliente" quando não há outro. */
export function rolesText(roles: string[]): string {
  const extra = withCliente(roles).filter((r) => r !== 'cliente');
  return (extra.length ? extra : ['cliente']).map(roleLabel).join(' · ');
}

/** Toast depois de salvar os papéis: sem lojista ninguém opera a loja, e o servidor fecha as lojas da pessoa. */
export function rolesSavedText(storesClosed: number): string {
  if (storesClosed === 1) return 'Papéis atualizados. A loja da pessoa foi fechada.';
  if (storesClosed > 1) return `Papéis atualizados. As ${storesClosed} lojas da pessoa foram fechadas.`;
  return 'Papéis atualizados.';
}

/* ---------- rótulos ---------- */

export interface Tag { label: string; tone: StatusTone }

export const USER_TABS: { id: UserTab; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'cliente', label: 'Clientes' },
  { id: 'lojista', label: 'Lojistas' },
  { id: 'motoboy', label: 'Motoboys' },
  { id: 'equipe', label: 'Equipe' },
  { id: 'bloqueados', label: 'Bloqueados' },
];

export const STORE_FILTERS: { key: StoreFilter; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'admin_paused', label: 'Pausadas pelo DROP' },
  { key: 'attention', label: 'Precisam de atenção' },
  { key: 'trial', label: 'Em teste' },
];

export const USER_STATUS: Record<UserStatus, Tag> = {
  active: { label: 'Ativo', tone: 'ok' },
  inactive: { label: 'Inativo', tone: 'neutral' },
  blocked: { label: 'Bloqueado', tone: 'bad' },
};

export const VERIFICATION_TAG: Record<VerificationSummary, Tag> = {
  ok: { label: 'Verificado', tone: 'ok' },
  pending: { label: 'Em análise', tone: 'warn' },
  rejected: { label: 'Recusado', tone: 'bad' },
  none: { label: 'Sem envio', tone: 'neutral' },
};

export const VERIFICATION_ITEM_TAG: Record<VerificationItemStatus, Tag> = {
  pending: { label: 'Em análise', tone: 'warn' },
  approved: { label: 'Aprovado', tone: 'ok' },
  rejected: { label: 'Recusado', tone: 'bad' },
  none: { label: 'Não concluído', tone: 'neutral' },
};

/** Os itens de `User.verification` que a P2 manda (decisão 1). */
export const VERIFICATION_KIND_LABEL: Record<string, string> = {
  email: 'E-mail',
  document: 'Documento',
  facial: 'Selfie',
  courier: 'CNH e veículo',
};

export const DEBT_TAG: Record<DebtStatus, Tag> = {
  pending: { label: 'Pendente', tone: 'warn' },
  collected: { label: 'Cobrada', tone: 'neutral' },
  forgiven: { label: 'Perdoada', tone: 'info' },
};

export const STORE_SITUATION: Record<StoreSituation, Tag> = {
  open: { label: 'Aberta', tone: 'ok' },
  closed: { label: 'Fechada', tone: 'neutral' },
  paused: { label: 'Pausada pela loja', tone: 'warn' },
  admin_paused: { label: 'Pausada pelo DROP', tone: 'bad' },
};

export const RECEIVING_TAG: Record<ReceivingStatus, Tag> = {
  ok: { label: 'Recebendo', tone: 'ok' },
  pending: { label: 'Pendente', tone: 'warn' },
  problem: { label: 'Com problema', tone: 'bad' },
  na: { label: 'Não se aplica', tone: 'neutral' },
};

export const STORE_MODE_LABEL: Record<StoreMode, string> = { custodia: 'Custódia', saas: 'SaaS' };

export const SAAS_STATUS_LABEL: Record<SaasStatus, string> = {
  trialing: 'Em teste',
  active: 'Em dia',
  past_due: 'Atrasada',
  paused: 'Pausada',
  cancelled: 'Cancelada',
};

export const ACTION_LABEL: Record<AccountActionType, string> = {
  block: 'Conta bloqueada',
  unblock: 'Conta desbloqueada',
  roles_change: 'Papéis alterados',
  disconnect: 'Sessão desconectada',
  debt_forgive: 'Dívida perdoada',
  store_pause: 'Loja pausada pelo DROP',
  store_unpause: 'Loja liberada',
  note: 'Nota',
  verification_decision: 'Decisão de verificação',
  trial_extend: 'Teste estendido',
  saas_cancel: 'Mensalidade cancelada',
  plan_reject: 'Troca de plano recusada',
};

export const actionLabel = (type: string): string => ACTION_LABEL[type as AccountActionType] ?? 'Ação da equipe';

/* ---------- textos curtos ---------- */

const SP = 'America/Sao_Paulo';
const DAY_MS = 86_400_000;

export const spDate = (iso: string): string => new Date(iso).toLocaleDateString('pt-BR', { timeZone: SP });

/** "Sem registro" (nunca gravado), "há 10 min" até 30 dias, depois a data. */
export function lastSeenLabel(iso: string | null, now: number = Date.now()): string {
  if (!iso) return 'Sem registro';
  return now - Date.parse(iso) >= 30 * DAY_MS ? spDate(iso) : ageLabel(iso, now);
}

export const phoneLabel = (last4: string | null): string => (last4 ? `•••• ${last4}` : 'Sem telefone');
export const planLabel = (plan: number | null): string => (plan === null ? '—' : `Plano ${plan}`);
export const ratingLabel = (n: number | null): string =>
  (n === null ? 'Sem nota' : n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
/** Fração de 0 a 1 → "12,5%"; null = menos de 5 pedidos. */
export const rateLabel = (r: number | null): string =>
  (r === null ? 'Poucos pedidos' : `${(r * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);

const spDayMonth = (iso: string): string =>
  new Date(iso).toLocaleDateString('pt-BR', { timeZone: SP, day: '2-digit', month: '2-digit' });

/** Até quando a loja tem direito: o `coveredUntil` que o servidor manda (policy.sellsUntil); sem ele, null. */
export const saasCoverageEnd = (s: Pick<StoreSaas, 'coveredUntil'>): string | null => s.coveredUntil ?? null;

/** Mensalidade na ficha: o rótulo do status; cancelada diz até quando vende (ruling 8). */
export function saasPlanText(s: StoreSaas, now: number = Date.now()): string {
  if (s.status !== 'cancelled') return SAAS_STATUS_LABEL[s.status];
  const end = saasCoverageEnd(s);
  if (!end || !Number.isFinite(Date.parse(end))) return 'Cancelada';
  return Date.parse(end) > now ? `Cancelada · vende até ${spDayMonth(end)}` : `Cancelada · vendeu até ${spDayMonth(end)}`;
}

/** Novo fim do teste: o fim atual (ou agora, se já passou) mais os dias (ruling 6). */
export function trialEndPreview(trialEndsAt: string | null, days: number, now: number = Date.now()): string {
  const end = trialEndsAt ? Date.parse(trialEndsAt) : NaN;
  const from = Number.isFinite(end) ? Math.max(end, now) : now;
  return spDate(new Date(from + days * DAY_MS).toISOString());
}

const normName = (s: string): string => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
/** Confirmação do cancelamento: o nome digitado confere sem diferença de maiúscula e de espaços. */
export const storeNameMatches = (typed: string, name: string): boolean =>
  normName(typed) !== '' && normName(typed) === normName(name);

const ASAAS_AUDIT_LABEL: Record<string, string> = {
  connect: 'Conta conectada',
  replace: 'Chave trocada',
  disconnect: 'Conta desconectada',
};
export const asaasAuditLabel = (action: string): string => ASAAS_AUDIT_LABEL[action] ?? 'Alteração na conta';

/** "Termo 2026-09 aceito em 30/09/2026 às 09:00 · IP 200.1.2.3 · pelo lojista". */
export function consentText(c: StoreAsaasConsent): string {
  const who = c.actorRole === 'admin' ? 'assinado com o DROP' : 'pelo lojista';
  return `Termo ${c.termsVersion} aceito em ${spDate(c.acceptedAt)} às ${spTime(c.acceptedAt)} · IP ${c.ip ?? 'não registrado'} · ${who}`;
}

const byName = (by: ActorRef): string => (by.id === 'system' ? 'pelo sistema' : `por ${by.name ?? 'Pessoa removida'}`);

/** "Motivo: … · por Marina Rocha · em 19/10/2026" (o que faltar some). */
export function blockNote(b: UserBlock): string {
  return [b.reason ? `Motivo: ${b.reason}` : null, b.by ? byName(b.by) : null, b.at ? `em ${spDate(b.at)}` : null]
    .filter(Boolean).join(' · ');
}

export function adminPauseNote(p: StoreAdminPause): string {
  return [`Motivo: ${p.reason}`, p.by ? byName(p.by) : null, `em ${spDate(p.at)}`].filter(Boolean).join(' · ');
}

/** Autor da linha do histórico; o job da D3b-2b grava `system`. */
export function timelineActor(a: TimelineItem['actor']): string {
  if (a.id === 'system') return 'Sistema';
  return actorLabel({ actorName: a.name, actorRole: a.role });
}

/** Detalhe da linha: papéis antes → depois e o valor perdoado. Outro `meta` não mostra nada. */
export function timelineDetail(item: TimelineItem): string | null {
  const m = isObj(item.meta) ? item.meta : null;
  if (!m) return null;
  if (item.type === 'roles_change' && isStrArr(m.before) && isStrArr(m.after)) return `${rolesText(m.before)} → ${rolesText(m.after)}`;
  if (item.type === 'debt_forgive' && isNum(m.amount)) return formatMoney(m.amount);
  if (item.type === 'verification_decision') return verificationDecisionDetail(m);
  if (item.type === 'trial_extend' && isNum(m.days) && isIso(m.to)) return `+${m.days} dias · até ${spDate(m.to)}`;
  return null;
}

/** "Aprovado: Documento, CNPJ" ou "Recusado: Selfie (Selfie não confere com o documento, pediu reenvio)". */
function verificationDecisionDetail(m: Record<string, unknown>): string | null {
  if ((m.decision !== 'approve' && m.decision !== 'reject') || !Array.isArray(m.items)) return null;
  const kinds = VERIFICATION_KIND_SHORT as Record<string, string>;
  const reasons = REJECT_REASON_LABEL as Record<string, string>;
  const parts = m.items.filter(isObj).map((i) => {
    const kind = isStr(i.kind) ? kinds[i.kind] ?? i.kind : 'Item';
    const extra = [isStr(i.reasonCode) ? reasons[i.reasonCode] : null, i.resend === true ? 'pediu reenvio' : null]
      .filter(Boolean).join(', ');
    return extra ? `${kind} (${extra})` : kind;
  });
  if (parts.length === 0) return null;
  return `${m.decision === 'approve' ? 'Aprovado' : 'Recusado'}: ${parts.join(', ')}`;
}

/* ---------- erros ---------- */

const CODE_TEXT: Record<string, string> = {
  REASON_REQUIRED: `Escreva o motivo, de ${REASON_MIN} a ${REASON_MAX} caracteres.`,
  NOTE_INVALID: `A nota precisa ter de 1 a ${NOTE_MAX} caracteres.`,
  DEBT_NOT_PENDING: 'Esta dívida não está mais pendente: já foi cobrada ou perdoada. A ficha foi atualizada.',
  ALREADY_PAUSED: 'A loja já está pausada pelo DROP. A ficha foi atualizada.',
  NOT_PAUSED: 'A loja não está pausada pelo DROP. A ficha foi atualizada.',
  USER_NOT_FOUND: 'Pessoa não encontrada.',
  STORE_NOT_FOUND: 'Loja não encontrada.',
  DEBT_NOT_FOUND: 'Dívida não encontrada.',
  NOT_TRIALING: 'A loja não está mais em teste. A ficha foi atualizada.',
  ALREADY_CANCELLED: 'A mensalidade já estava cancelada. A ficha foi atualizada.',
  NO_SAAS_BILLING: 'Esta loja não tem mensalidade para cancelar.',
  INVALID_DAYS: 'Escolha 7, 14 ou 30 dias.',
  ASAAS_UPDATE_FAILED: 'O Asaas não aceitou a nova data da cobrança. Nada mudou: tente de novo em alguns minutos.',
  SAAS_CANCEL_FAILED: 'Não deu para cancelar a assinatura no Asaas. Nada mudou: tente de novo em alguns minutos.',
};

/**
 * 403 que não é falta de permissão: regra da D3b-2a com texto próprio do servidor (só o CEO mexe na equipe;
 * ninguém perdoa a própria dívida). Qualquer outro 403 continua "Você não tem permissão para isso".
 * Fontes no servidor: STAFF_TARGET_FORBIDDEN em src/routes/admin.ts e SELF_ACTION_FORBIDDEN em
 * src/services/adminAccounts/debt.ts. Os mesmos códigos estão em FORBIDDEN_WITH_SERVER_TEXT (adminErrors.ts),
 * para a AdminSheet não trocar o texto por "sem permissão".
 */
const FORBIDDEN_TEXT: Record<string, string> = {
  STAFF_TARGET_FORBIDDEN: 'Somente o CEO pode bloquear ou desconectar alguém da equipe.',
  SELF_ACTION_FORBIDDEN: 'Você não pode perdoar a própria dívida.',
};

/** 409 que diz "o estado mudou": a ficha relê. */
const CONFLICT_CODES = new Set(['DEBT_NOT_PENDING', 'ALREADY_PAUSED', 'NOT_PAUSED', 'NOT_TRIALING', 'ALREADY_CANCELLED']);

interface HttpLike { response?: { status?: number; data?: unknown } }
const statusOf = (err: unknown): number | undefined => ((err ?? {}) as HttpLike).response?.status;
const dataOf = (err: unknown): Record<string, unknown> | null => {
  const d = ((err ?? {}) as HttpLike).response?.data;
  return isObj(d) ? d : null;
};

/** Código do servidor: `code` ({ error: <texto>, code }, o envelope das rotas admin) ou `error.code` (errorHandler). */
export function accountErrorCode(err: unknown): string | null {
  const d = dataOf(err);
  if (!d) return null;
  if (isStr(d.code) && d.code) return d.code;
  if (isObj(d.error) && isStr(d.error.code) && d.error.code) return d.error.code;
  return null;
}

/** Texto em português dos códigos da D3b-2a; senão o texto do servidor; 403 vira "sem permissão". */
export function accountErrorMessage(err: unknown, fallback = 'Não deu certo. Tente de novo.'): string {
  const code = accountErrorCode(err);
  if (statusOf(err) === 403) return (code && FORBIDDEN_TEXT[code]) || 'Você não tem permissão para isso';
  if (code && CODE_TEXT[code]) return CODE_TEXT[code];
  const d = dataOf(err);
  if (!d) return adminErrorMessage(err, fallback);
  if (isStr(d.error) && d.error) return d.error;
  if (isObj(d.error) && isStr(d.error.message) && d.error.message) return d.error.message;
  return fallback;
}

export function isAccountConflict(err: unknown): boolean {
  const code = accountErrorCode(err);
  return statusOf(err) === 409 && !!code && CONFLICT_CODES.has(code);
}

/** Para jogar dentro do onClick da AdminSheet, que mostra `data.error`: texto em português, status e código. */
export function flattenAccountError(
  err: unknown,
  fallback?: string,
): { response: { status?: number; data: { error: string; code?: string } } } {
  const code = accountErrorCode(err);
  return { response: { status: statusOf(err), data: { error: accountErrorMessage(err, fallback), ...(code ? { code } : {}) } } };
}
