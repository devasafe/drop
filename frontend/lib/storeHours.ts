export type DayKey = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';
export type OperatingHours = Partial<Record<DayKey, { open: string; close: string; closed: boolean }>>;
const DAYS: DayKey[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0); };

/** "HH:MM" (America/Sao_Paulo) em que a pausa termina; null se não há pausa ativa. */
export function pausedBackAt(pausedUntil?: string | null, now: Date = new Date()): string | null {
  if (!pausedUntil) return null;
  const d = new Date(pausedUntil);
  if (Number.isNaN(d.getTime()) || d.getTime() <= now.getTime()) return null;
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

/** Aberta agora pelo horário cadastrado (isOpen=false manda). Sem horário: vale isOpen, sem horas. */
export function openStatus(
  store: { isOpen?: boolean; operatingHours?: OperatingHours | null; pausedUntil?: string | null },
  now: Date = new Date(),
): { open: boolean; closesAt: string | null; opensAt: string | null; pausedBackAt?: string } {
  const back = pausedBackAt(store.pausedUntil, now);
  if (back) return { open: false, closesAt: null, opensAt: null, pausedBackAt: back };
  if (store.isOpen === false) return { open: false, closesAt: null, opensAt: null };
  const day = store.operatingHours?.[DAYS[now.getDay()]];
  if (!day || !day.open || !day.close) return { open: true, closesAt: null, opensAt: null };
  if (day.closed) return { open: false, closesAt: null, opensAt: null };
  const t = now.getHours() * 60 + now.getMinutes();
  if (t >= toMin(day.open) && t < toMin(day.close)) return { open: true, closesAt: day.close, opensAt: null };
  return { open: false, closesAt: null, opensAt: t < toMin(day.open) ? day.open : null };
}
