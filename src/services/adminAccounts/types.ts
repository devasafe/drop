/**
 * D3b-2a · tipos das leituras de Pessoas e Lojas (spec 6). Fonte única dos nomes: o frontend espelha
 * em frontend/lib/adminAccounts.ts (P3.1). Datas em ISO 8601 UTC; valores em reais como number (2 casas).
 */

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
