export type DayKey = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';
export type OperatingHours = Partial<Record<DayKey, { open: string; close: string; closed: boolean }>>;
const DAYS: DayKey[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0); };

/** Dia da semana (0=domingo) e minuto do dia em America/Sao_Paulo, igual ao `brazilNow` do backend. */
function brazilNow(now: Date): { dayIndex: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const val = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    dayIndex: WD[val('weekday')] ?? now.getDay(),
    minutes: Number(val('hour')) * 60 + Number(val('minute')),
  };
}

/** "HH:MM" (America/Sao_Paulo) de um instante no futuro; null se vazio, inválido ou já passou. */
function futureHHMM(iso?: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getTime() <= now.getTime()) return null;
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

/** "HH:MM" (America/Sao_Paulo) em que a pausa termina; null se não há pausa ativa. */
export function pausedBackAt(pausedUntil?: string | null, now: Date = new Date()): string | null {
  return futureHHMM(pausedUntil, now);
}

type HoursStatus = { open: boolean; closesAt: string | null; opensAt: string | null };

/** Só o horário cadastrado no instante `now` (SP), com as mesmas validações do backend (isOpenAt). */
function byHours(operatingHours: OperatingHours | null | undefined, now: Date): HoursStatus {
  const { dayIndex, minutes: t } = brazilNow(now);
  const day = operatingHours?.[DAYS[dayIndex]];
  if (!day) return { open: true, closesAt: null, opensAt: null };
  if (day.closed) return { open: false, closesAt: null, opensAt: null };
  if (!day.open || !day.close) return { open: true, closesAt: null, opensAt: null };
  const fmt = /^\d{2}:\d{2}$/;
  if (!fmt.test(day.open) || !fmt.test(day.close)) return { open: true, closesAt: null, opensAt: null };
  const openMin = toMin(day.open);
  const closeMin = toMin(day.close);
  // Horário que vira a meia-noite (ex.: 18:00-02:00): mesma regra do backend (isOpenAt),
  // que olha só a config do dia atual (SP).
  const isOpen = closeMin <= openMin ? t >= openMin || t < closeMin : t >= openMin && t < closeMin;
  if (isOpen) return { open: true, closesAt: day.close, opensAt: null };
  return { open: false, closesAt: null, opensAt: t < openMin ? day.open : null };
}

/**
 * Aberta agora, na ordem do backend (isOpenAt): pausada → fechada; isOpen=false → fechada;
 * aberta fora do horário (`openOverrideUntil` no futuro) → aberta; senão, o horário cadastrado.
 * Sem horário: vale isOpen, sem horas. Com override, `closesAt` é a hora do override, a não ser
 * que nesse instante o horário já abra (override até a abertura de hoje): aí a loja fica aberta
 * direto e fecha no fechamento do horário.
 */
export function openStatus(
  store: { isOpen?: boolean; operatingHours?: OperatingHours | null; pausedUntil?: string | null; openOverrideUntil?: string | null },
  now: Date = new Date(),
): { open: boolean; closesAt: string | null; opensAt: string | null; pausedBackAt?: string; overrideUntil?: string } {
  const back = pausedBackAt(store.pausedUntil, now);
  if (back) return { open: false, closesAt: null, opensAt: null, pausedBackAt: back };
  if (store.isOpen === false) return { open: false, closesAt: null, opensAt: null };
  const until = futureHHMM(store.openOverrideUntil, now);
  if (until) {
    const after = byHours(store.operatingHours, new Date(store.openOverrideUntil as string));
    return { open: true, closesAt: after.open ? after.closesAt : until, opensAt: null, overrideUntil: until };
  }
  return byHours(store.operatingHours, now);
}
