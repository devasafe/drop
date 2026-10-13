import type { DayKey, OperatingHours } from './storeHours';

export type DayConfig = { open: string; close: string; closed: boolean };

/** Semana na ordem do lojista (segunda primeiro). */
export const WEEK: Array<{ key: DayKey; label: string; short: string }> = [
  { key: 'monday', label: 'Segunda', short: 'Seg' },
  { key: 'tuesday', label: 'Terça', short: 'Ter' },
  { key: 'wednesday', label: 'Quarta', short: 'Qua' },
  { key: 'thursday', label: 'Quinta', short: 'Qui' },
  { key: 'friday', label: 'Sexta', short: 'Sex' },
  { key: 'saturday', label: 'Sábado', short: 'Sáb' },
  { key: 'sunday', label: 'Domingo', short: 'Dom' },
];

const HHMM = /^\d{2}:\d{2}$/;
const fmt = (hhmm: string) => {
  const [h, m] = hhmm.split(':');
  return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}`;
};
const signature = (d?: DayConfig) => (!d ? 'free' : d.closed ? 'closed' : `${d.open}-${d.close}`);

/** "Seg–Sex 9h–22h · Sáb 10h–18h · Dom fechado" */
export function summarizeHours(oh?: OperatingHours | null): string {
  if (!oh || WEEK.every((d) => !oh[d.key])) return 'Sem horário definido';
  const parts: string[] = [];
  let i = 0;
  while (i < WEEK.length) {
    const cur = oh[WEEK[i].key] as DayConfig | undefined;
    const sig = signature(cur);
    let j = i;
    while (j + 1 < WEEK.length && signature(oh[WEEK[j + 1].key] as DayConfig | undefined) === sig) j++;
    const days = i === j ? WEEK[i].short : `${WEEK[i].short}–${WEEK[j].short}`;
    if (sig === 'free') parts.push(`${days} sem horário`);
    else if (sig === 'closed') parts.push(`${days} fechado`);
    else parts.push(`${days} ${fmt(cur!.open)}–${fmt(cur!.close)}`);
    i = j + 1;
  }
  return parts.join(' · ');
}

/** Erro da linha do dia (null = ok). Horário "HH:MM" compara como texto. */
export function dayError(d: DayConfig): string | null {
  if (d.closed) return null;
  if (!HHMM.test(d.open) || !HHMM.test(d.close)) return 'Informe abertura e fechamento.';
  return d.close > d.open ? null : 'O fechamento precisa ser depois da abertura.';
}

/** Copia a segunda para terça a sexta (cópias novas, sem compartilhar objeto). */
export function copyToWeekdays(hours: Record<DayKey, DayConfig>): Record<DayKey, DayConfig> {
  const mon = hours.monday;
  return { ...hours, tuesday: { ...mon }, wednesday: { ...mon }, thursday: { ...mon }, friday: { ...mon } };
}
