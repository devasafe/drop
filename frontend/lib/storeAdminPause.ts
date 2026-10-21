/**
 * Pausa pelo DROP (D3b-2a, spec 5.4), do lado do lojista. A loja vem de GET /stores/dashboard com
 * `adminPausedAt` e `adminPauseReason`; enquanto `adminPausedAt` existir, só o DROP reabre. Abrir, abrir fora do
 * horário, pausar e reabrir respondem 409 STORE_ADMIN_PAUSED com o motivo (P1.5). Horário: { error, code, reason };
 * pausar e reabrir: { success: false, error: { message, statusCode, code, reason } }. O texto da tela sai daqui.
 */
export const STORE_ADMIN_PAUSED = 'STORE_ADMIN_PAUSED';

export interface AdminPauseInfo { reason: string | null }

const cleanReason = (v: unknown): string | null =>
  (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Pausada pelo DROP? `null` = não (ou loja ainda não lida). */
export function adminPauseOf(store: unknown): AdminPauseInfo | null {
  const s = store as { adminPausedAt?: unknown; adminPauseReason?: unknown } | null | undefined;
  if (!s || s.adminPausedAt == null || s.adminPausedAt === '') return null;
  return { reason: cleanReason(s.adminPauseReason) };
}

/** "Loja pausada pelo DROP: <motivo>. Fale com o suporte." (sem ponto duplicado). */
export function adminPausedText(reason: string | null): string {
  const r = reason ? reason.replace(/[.\s]+$/, '') : '';
  return r ? `Loja pausada pelo DROP: ${r}. Fale com o suporte.` : 'Loja pausada pelo DROP. Fale com o suporte.';
}

/** 409 STORE_ADMIN_PAUSED → o motivo (se veio); qualquer outro erro → null. */
export function storeAdminPausedError(err: unknown): AdminPauseInfo | null {
  const res = (err as { response?: { status?: number; data?: unknown } } | null)?.response;
  if (!res || res.status !== 409 || !res.data || typeof res.data !== 'object') return null;
  const d = res.data as Record<string, unknown>;
  const nested = d.error && typeof d.error === 'object' ? (d.error as Record<string, unknown>) : null;
  if (d.code !== STORE_ADMIN_PAUSED && nested?.code !== STORE_ADMIN_PAUSED) return null;
  return { reason: cleanReason(d.reason ?? nested?.reason) };
}
