const MONTHS_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export interface NotifGroup<T> {
  label: string;
  items: T[];
}

function dayKey(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function labelForDay(d: Date, now: Date): string {
  const key = dayKey(d);
  const today = dayKey(now);
  const oneDay = 86400000;
  if (key === today) return 'Hoje';
  if (key === today - oneDay) return 'Ontem';
  return `${d.getDate()} de ${MONTHS_ABBR[d.getMonth()]}`;
}

/**
 * Agrupa notificações por dia (mais recente primeiro), com rótulos
 * "Hoje" / "Ontem" / "DD de mês". Preserva a ordem de entrada dentro do grupo.
 */
export function groupByDay<T extends { createdAt: string }>(items: T[], now: Date = new Date()): NotifGroup<T>[] {
  const byKey = new Map<number, T[]>();
  for (const it of items || []) {
    const d = new Date(it.createdAt);
    if (isNaN(d.getTime())) continue;
    const key = dayKey(d);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(it);
  }
  return [...byKey.keys()]
    .sort((a, b) => b - a)
    .map((key) => ({ label: labelForDay(new Date(key), now), items: byKey.get(key)! }));
}
