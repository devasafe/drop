import { brazilNow, isOpenAt } from './storeHours';

/**
 * D1 · pausa da loja (`Store.pausedUntil`). Lógica pura, sem I/O e sem job: a pausa vence na leitura.
 * Usado pela vitrine (cotação e busca), pelo GET público da loja e pelo checkout — um helper só.
 */

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const HHMM = /^\d{2}:\d{2}$/;
const DEFAULT_REOPEN = '08:00';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Pausada = `pausedUntil` no futuro. Nulo, vencido ou inválido = não pausada. */
export function isStorePaused(store: { pausedUntil?: Date | null }, now: Date = new Date()): boolean {
  if (!store.pausedUntil) return false;
  const until = new Date(store.pausedUntil).getTime();
  return Number.isFinite(until) && until > now.getTime();
}

/** "Aberta agora" da spec: `isOpen && (pausedUntil == null || pausedUntil <= agora)` e, desde a D3b-2a, sem pausa do admin. */
export function isStoreOpenNow(
  store: { isOpen: boolean; pausedUntil?: Date | null; adminPausedAt?: Date | null },
  now: Date = new Date(),
): boolean {
  return !!store.isOpen && !store.adminPausedAt && !isStorePaused(store, now);
}

/** `isStoreOpenNow` + horário de funcionamento (fuso de São Paulo) e o override de abrir fora do horário. É o `isOpenNow` do GET público da loja. */
export function isStoreOpenWithHoursNow(
  store: { isOpen: boolean; pausedUntil?: Date | null; operatingHours?: any; openOverrideUntil?: Date | null; adminPausedAt?: Date | null },
  now: Date = new Date(),
): boolean {
  if (!isStoreOpenNow(store, now)) return false;
  const { dayIndex, minutes } = brazilNow(now);
  return isOpenAt(store, dayIndex, minutes, now);
}

/**
 * `hhmm` do dia (hoje + `dayOffset`) em São Paulo, como Date.
 * Offset fixo -03:00: o Brasil não tem horário de verão desde 2019.
 */
function atBrazilTime(now: Date, dayOffset: number, hhmm: string): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(now.getTime() + dayOffset * DAY_MS));
  return new Date(`${ymd}T${hhmm}:00-03:00`);
}

/**
 * Fim da pausa "até amanhã": a abertura do próximo dia que abre, pelo `operatingHours`.
 * Dia sem horário configurado (ou sem horário nenhum) reabre às 08:00. Semana toda fechada: amanhã 08:00.
 */
export function pauseUntilTomorrowAt(store: { operatingHours?: any }, now: Date = new Date()): Date {
  const hours = store.operatingHours as Record<string, { open?: string; close?: string; closed?: boolean }> | null | undefined;
  if (!hours) return atBrazilTime(now, 1, DEFAULT_REOPEN);
  const { dayIndex } = brazilNow(now);
  for (let offset = 1; offset <= 7; offset++) {
    const cfg = hours[DAYS[(dayIndex + offset) % 7]];
    if (cfg?.closed) continue;
    const open = cfg && typeof cfg.open === 'string' && HHMM.test(cfg.open) ? cfg.open : DEFAULT_REOPEN;
    return atBrazilTime(now, offset, open);
  }
  return atBrazilTime(now, 1, DEFAULT_REOPEN);
}
