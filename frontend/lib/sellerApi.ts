// Utilidades das telas da loja (DS v2, D1): erro do servidor nos dois formatos do backend,
// resposta envelopada { success, data } e formatação de hora/relógio.

export interface ApiErrorInfo {
  status: number | null;
  code: string | null;
  message: string | null;
}

/** Erro do axios → status, código estável e mensagem do servidor (formatos antigo e AppError). */
export function apiError(err: unknown): ApiErrorInfo {
  const res = (err as { response?: { status?: number; data?: any } })?.response;
  if (!res) return { status: null, code: null, message: null };
  const d = res.data || {};
  const e = d.error;
  const message =
    typeof e === 'string' ? e
      : typeof e?.message === 'string' ? e.message
        : typeof d.message === 'string' ? d.message
          : null;
  const code = typeof d.code === 'string' ? d.code : typeof e?.code === 'string' ? e.code : null;
  return { status: typeof res.status === 'number' ? res.status : null, code, message };
}

/** `{ success:true, data }` → data; qualquer outro corpo volta como veio. */
export function unwrap<T = any>(res: { data?: any } | null | undefined): T {
  const d = res?.data;
  if (d && typeof d === 'object' && d.success === true && Object.prototype.hasOwnProperty.call(d, 'data')) return d.data as T;
  return d as T;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Tempo restante em m:ss (ou h:mm:ss). Nunca negativo. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function toDate(v: string | number | Date | null | undefined): Date | null {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "09:05" no fuso do aparelho. */
export function formatHour(v: string | number | Date | null | undefined): string | null {
  const d = toDate(v);
  return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : null;
}

/** "10/10". */
export function formatDayMonth(v: string | number | Date | null | undefined): string | null {
  const d = toDate(v);
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}` : null;
}

/** "10/10 09:05". */
export function formatDateTime(v: string | number | Date | null | undefined): string | null {
  const d = toDate(v);
  return d ? `${formatDayMonth(d)} ${formatHour(d)}` : null;
}

/** "2026-01-07" (data local, para ?from=&to= do analytics). */
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "2026-01" (?month= do resumo SaaS). */
export function currentMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

/** "1.842,60" / "49,90" / "49.90" → número; vazio ou inválido → NaN. */
export function parseMoneyInput(s: string): number {
  const t = String(s ?? '').trim();
  if (!t) return NaN;
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  if (!/^\d+(\.\d+)?$/.test(normalized)) return NaN;
  return Number(normalized);
}
