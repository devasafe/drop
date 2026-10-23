/**
 * D3b-2a · tipos das leituras de Pessoas e Lojas (spec 6). Fonte única dos nomes: o frontend espelha
 * em frontend/lib/adminAccounts.ts (P3.1). Datas em ISO 8601 UTC; valores em reais como number (2 casas).
 */
import type { SaasBillingStatus } from '@prisma/client';
import type { TimelineItem } from './actions';
import type { NearbyCouriers } from '../adminOps/couriersNear';

/** D3b-2b · mensalidade da loja como sai nas ações (estender, cancelar) e na ficha (plan.saas). Datas ISO. */
export interface StoreSaasState {
  status: SaasBillingStatus;
  trialEndsAt: string;
  paidUntil: string | null;
  cancelledAt: string | null;
}

// ── Lista de pessoas (P2.1) ──────────────────────────────────────────────

export type UserListTab = 'all' | 'cliente' | 'lojista' | 'motoboy' | 'equipe' | 'bloqueados';

/** Resumo da verificação para os itens que o papel exige (userVerification.ts). */
export type VerificationSummary = 'ok' | 'pending' | 'rejected' | 'none';

export type AccountStatus = 'active' | 'blocked' | 'inactive';

/** Itens de verificação de uma pessoa, como ficam em `User.verification`. */
export type UserVerificationKey = 'email' | 'document' | 'facial' | 'courier';

export interface UserListItem {
  id: string;
  name: string;
  email: string;
  /** Todos os papéis da conta: `roles` mais `role` e `activeRole` (conta antiga). */
  roles: string[];
  status: AccountStatus;
  blockReason: string | null;
  verification: VerificationSummary;
  lastSeenAt: string | null;
  /** Pedidos feitos como cliente nos últimos 90 dias. */
  orders90d: number;
  /** Soma das dívidas pendentes; null quando não há. */
  pendingDebt: number | null;
  createdAt: string;
}

export interface UserListResponse {
  items: UserListItem[];
  nextCursor: string | null;
}

// ── Histórico (P2.2) ─────────────────────────────────────────────────────

export type { TimelineItem };

/** Uma página do histórico (`listTimeline`, P1): 50 por página, mais nova primeiro. */
export interface TimelineResponse {
  items: TimelineItem[];
  nextCursor: string | null;
}

// ── Ficha da pessoa (P2.2) ───────────────────────────────────────────────

/** Situação da loja agora: pausa do admin > pausa do lojista > aberta pelo horário > fechada. */
export type StoreSituation = 'open' | 'closed' | 'paused' | 'admin_paused';

/** Situação de um item na ficha (decisão 21): `verified` do e-mail vira `approved`; o que não espera o admin, `none`. */
export type VerificationEntryStatus = 'pending' | 'approved' | 'rejected' | 'none';

export interface UserVerificationEntry {
  kind: UserVerificationKey;
  status: VerificationEntryStatus;
  /** Motivo da recusa, quando recusado. */
  reason: string | null;
  /** Data da decisão, da confirmação do e-mail ou do envio, nessa ordem. */
  at: string | null;
}

export interface UserDetailOrder {
  id: string;
  shortId: string;
  status: string;
  total: number;
  store: { id: string; name: string };
  createdAt: string;
}

export type DebtStatus = 'pending' | 'collected' | 'forgiven';

export interface UserDetailDebt {
  id: string;
  amount: number;
  status: DebtStatus;
  reason: string;
  sourceOrderId: string;
  createdAt: string;
  collectedAt: string | null;
  forgivenAt: string | null;
}

export interface UserDetailMotoboy {
  /** CNH e placa como estão na verificação (`verification.courier`). */
  cnh: string | null;
  plate: string | null;
  courierStatus: string;
  /** A chave nunca sai: o "Ver chave" auditado da D3b-1 é o único caminho. */
  hasPixKey: boolean;
  deliveries30d: number;
  /** Só com payout:view ou money:overview; sem a permissão, a chave nem existe no JSON. */
  earnings30d?: number;
}

export interface UserDetailStore {
  id: string;
  name: string;
  situation: StoreSituation;
}

/** Uma carteira (decisão 9). */
export interface UserDetailWallet {
  balance: number;
  available: number;
  pending: number;
  blocked: number;
}

/** Carteiras da pessoa, separadas: `user` (compras) e `motoboy` (entregas); null quando a pessoa não tem aquela. */
export interface UserDetailWallets {
  cliente: UserDetailWallet | null;
  motoboy: UserDetailWallet | null;
}

export interface UserDetailCan {
  /** Bloquear: user:block, não é a própria conta e a conta não está bloqueada. */
  block: boolean;
  /** Desbloquear: user:block, não é a própria conta e a conta está bloqueada. */
  unblock: boolean;
  /** Desconectar: user:block e não é a própria conta. */
  disconnect: boolean;
  roles: boolean;
  forgiveDebt: boolean;
  note: boolean;
}

export interface UserDetail {
  profile: {
    id: string;
    name: string;
    email: string;
    /** Só os 4 últimos dígitos ("1234"); null sem telefone. */
    phoneLast4: string | null;
    roles: string[];
    activeRole: string;
    status: AccountStatus;
    /** Só com a conta bloqueada: motivo, data e autor. */
    block: { reason: string | null; at: string | null; by: { id: string; name: string | null } | null } | null;
    createdAt: string;
    lastSeenAt: string | null;
  };
  verification: UserVerificationEntry[];
  /** Os 20 pedidos mais novos feitos como cliente. */
  orders: UserDetailOrder[];
  debts: UserDetailDebt[];
  /** Só para quem tem o papel motoboy. */
  motoboy?: UserDetailMotoboy;
  /** Só para quem tem o papel lojista. */
  stores?: UserDetailStore[];
  /** Só com payout:view ou money:overview. */
  wallets?: UserDetailWallets;
  timeline: TimelineResponse;
  can: UserDetailCan;
}

// ── Lista de lojas (P2.3) ────────────────────────────────────────────────

export type StoreListFilter = 'all' | 'admin_paused' | 'attention' | 'trial';

/** Modo de liquidação da plataforma visto pela loja: 'direto' aparece como 'saas'. */
export type StoreMode = 'custodia' | 'saas';

export type ReceivingStatus = 'ok' | 'pending' | 'problem' | 'na';

export interface StoreListItem {
  id: string;
  name: string;
  ownerName: string;
  plan: number;
  mode: StoreMode;
  /** Média de Order.storeRating dos últimos 90 dias (1 casa); null sem avaliação. */
  rating90d: number | null;
  /** Cancelados ÷ pedidos dos últimos 30 dias (0 a 1, 3 casas); null com menos de 5 pedidos. */
  cancelRate30d: number | null;
  receiving: ReceivingStatus;
  situation: StoreSituation;
  /** Pausada pelo admin, recebimento com problema ou cancelamento acima de 10%. */
  attention: boolean;
}

export interface StoreListResponse {
  items: StoreListItem[];
  nextCursor: string | null;
}

// ── Ficha da loja (P2.4) ─────────────────────────────────────────────────

/** D3b-2b · bloco "Conta Asaas · histórico" da ficha da loja (só o CEO recebe). */
export interface StoreAsaasHistory {
  /** StoreAsaasAudit, até 20, os mais novos primeiro. `actor.name` é null quando o autor não é usuário. */
  audits: Array<{ action: string; apiKeyLast4: string | null; actor: { id: string; name: string | null }; createdAt: string }>;
  /** O último aceite do termo (StoreAsaasConsent), sem o userAgent; null se nunca aceitou. */
  consent: { termsVersion: string; ip: string | null; acceptedAt: string; actorRole: string } | null;
}

/**
 * D3b-2b · mensalidade na ficha: o estado das ações mais `coveredUntil`, o último instante coberto
 * (`policy.sellsUntil` = `coverageEnd − 1 ms`), em qualquer status. A tela formata em Brasília
 * ("vende até DD/MM" da cancelada; prévia da folha de cancelar). O front não recalcula a cobertura.
 */
export interface StoreDetailSaas extends StoreSaasState {
  coveredUntil: string;
}

/** O que a pessoa pode fazer na ficha da loja (os botões só aparecem com `true`). */
export interface StoreDetailCan {
  pause: boolean;
  unpause: boolean;
  note: boolean;
  /** D3b-2b: plan:manage e mensalidade em `trialing`. */
  extendTrial: boolean;
  /** D3b-2b: plan:manage e mensalidade existente e não `cancelled`. */
  cancelSaas: boolean;
}

export interface StoreDetail {
  profile: {
    id: string;
    name: string;
    cnpj: string | null;
    owner: { id: string; name: string };
    city: string | null;
    situation: StoreSituation;
    /** Pausa do admin; `by.name` é null quando foi o sistema ('system'). */
    adminPause: { at: string; by: { id: string; name: string | null }; reason: string } | null;
  };
  stats30d: {
    orders: number;
    /** Cancelamentos dos últimos 30 dias que contam contra a loja (dela ou do admin com culpa da loja). */
    cancelledByStore: number;
    rating: number | null;
  };
  /** As 10 avaliações mais novas com nota e comentário. */
  reviews: Array<{ orderId: string; rating: number; comment: string; reply: string | null; createdAt: string }>;
  /** `detail` = último erro gravado do recebimento; só para o CEO (null para os demais). */
  receiving: { status: ReceivingStatus; detail: string | null };
  /** `saas` = mensalidade (StoreSaasBilling), quando existe. As ações (estender, cancelar) são da 2b. */
  plan: {
    plan: number;
    mode: StoreMode;
    saas: StoreDetailSaas | null;
  };
  /** Os 20 pedidos mais novos. */
  orders: Array<{ id: string; shortId: string; status: string; total: number; customerName: string; createdAt: string }>;
  timeline: TimelineResponse;
  can: StoreDetailCan;
  /** D3b-4b: motoboys online e livres a até `nearbyRadiusKm` da loja; null = a loja não tem ponto no mapa. */
  nearbyCouriers: NearbyCouriers | null;
  /** O raio do despacho (DISPATCH_MAX_KM): a tela mostra este número, nunca um escrito à mão. */
  nearbyRadiusKm: number;
  /** D3b-2b: só para o CEO. Para os outros, a chave não existe no JSON. */
  asaasHistory?: StoreAsaasHistory;
}
