// Helpers puros dos KPIs do cockpit do motoboy — espelham lib/sellerOverview.ts.
// Motoboy recebe 80% da taxa (fee * 0.8), igual ao card de corrida.

export function isToday(value: string | number | Date, now: Date = new Date()): boolean {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

function deliveredToday(history: any[], now: Date): any[] {
  return (history || []).filter(
    (d) => d?.status === 'delivered' && d?.updatedAt && isToday(d.updatedAt, now),
  );
}

export function earningsToday(history: any[], now: Date = new Date()): number {
  return deliveredToday(history, now).reduce((s, d) => s + (d.fee || 0) * 0.8, 0);
}

export function deliveriesToday(history: any[], now: Date = new Date()): number {
  return deliveredToday(history, now).length;
}

export function avgRating(history: any[]): number | null {
  const rated = (history || []).filter((d) => typeof d?.rating === 'number' && d.rating > 0);
  if (rated.length === 0) return null;
  return rated.reduce((s, d) => s + d.rating, 0) / rated.length;
}
