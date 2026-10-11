export type DayKey = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';
export type OperatingHours = Partial<Record<DayKey, { open: string; close: string; closed: boolean }>>;
const DAYS: DayKey[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0); };

/** Aberta agora pelo horário cadastrado (isOpen=false manda). Sem horário: vale isOpen, sem horas. */
export function openStatus(
  store: { isOpen?: boolean; operatingHours?: OperatingHours | null },
  now: Date = new Date(),
): { open: boolean; closesAt: string | null; opensAt: string | null } {
  if (store.isOpen === false) return { open: false, closesAt: null, opensAt: null };
  const day = store.operatingHours?.[DAYS[now.getDay()]];
  if (!day || !day.open || !day.close) return { open: true, closesAt: null, opensAt: null };
  if (day.closed) return { open: false, closesAt: null, opensAt: null };
  const t = now.getHours() * 60 + now.getMinutes();
  if (t >= toMin(day.open) && t < toMin(day.close)) return { open: true, closesAt: day.close, opensAt: null };
  return { open: false, closesAt: null, opensAt: t < toMin(day.open) ? day.open : null };
}
