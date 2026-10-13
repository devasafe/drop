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

const TZ = 'America/Sao_Paulo';
const tzFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});

/** Partes da data no fuso de São Paulo (o mesmo do backend), independente do aparelho. */
function spParts(d: Date) {
  const o: Record<string, string> = {};
  for (const p of tzFormatter.formatToParts(d)) o[p.type] = p.value;
  return { year: o.year, month: o.month, day: o.day, hour: o.hour, minute: o.minute };
}

/** "09:05" no fuso de São Paulo. */
export function formatHour(v: string | number | Date | null | undefined): string | null {
  const d = toDate(v);
  if (!d) return null;
  const p = spParts(d);
  return `${p.hour}:${p.minute}`;
}

/** "10/10" no fuso de São Paulo. */
export function formatDayMonth(v: string | number | Date | null | undefined): string | null {
  const d = toDate(v);
  if (!d) return null;
  const p = spParts(d);
  return `${p.day}/${p.month}`;
}

/** "10/10/2026" no fuso de São Paulo. */
export function formatFullDate(v: string | number | Date | null | undefined): string | null {
  const d = toDate(v);
  if (!d) return null;
  const p = spParts(d);
  return `${p.day}/${p.month}/${p.year}`;
}

/** "10/10 09:05" no fuso de São Paulo. */
export function formatDateTime(v: string | number | Date | null | undefined): string | null {
  const d = toDate(v);
  return d ? `${formatDayMonth(d)} ${formatHour(d)}` : null;
}

/** "2026-01-07" (data de São Paulo, para ?from=&to= do analytics). */
export function todayISO(now: Date = new Date()): string {
  const p = spParts(now);
  return `${p.year}-${p.month}-${p.day}`;
}

/** "2026-01" (mês de São Paulo, para ?month= do resumo SaaS). */
export function currentMonth(now: Date = new Date()): string {
  const p = spParts(now);
  return `${p.year}-${p.month}`;
}

/**
 * Valor digitado em reais -> numero. Falha fechado: qualquer entrada ambigua ou invalida da NaN.
 * Aceita "10", "49,90", "49.90", "49.9", "1234,56" e "1.234,56" (ponto de milhar so com virgula decimal).
 * Recusa ponto seguido de 3 digitos sem virgula ("1.000", "49.999", "1.234.567"), pois "49.999" poderia
 * ser lido como 49999 e sacar o saldo inteiro; tambem recusa mais de 2 decimais, varias virgulas,
 * separadores misturados ("1,234.56"), negativo, vazio e texto.
 */
export function parseMoneyInput(s: string): number {
  const t = String(s ?? '').trim();
  if (!t) return NaN;
  let normalized: string;
  if (t.includes(',')) {
    const m = /^(\d+|\d{1,3}(?:\.\d{3})+),(\d{1,2})$/.exec(t);
    if (!m) return NaN;
    normalized = `${m[1].replace(/\./g, '')}.${m[2]}`;
  } else if (/^\d+$/.test(t) || /^\d+\.\d{1,2}$/.test(t)) {
    normalized = t;
  } else {
    return NaN;
  }
  return Number(normalized);
}
