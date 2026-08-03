// Helpers puros das telas de entregas do motoboy (em andamento + histórico).
// O motoboy recebe 80% da taxa (mesma regra do cockpit / motoboyOverview).

const MOTOBOY_SHARE = 0.8;

export type OngoingTone = 'waiting' | 'transit' | 'near';

/** Rótulo + tom visual de uma entrega em andamento, a partir do status cru. */
export function ongoingStatusView(status: string): { label: string; tone: OngoingTone } {
  switch (status) {
    case 'assigned': return { label: 'Aguardando retirada', tone: 'waiting' };
    case 'picked': return { label: 'Em trânsito', tone: 'transit' };
    case 'delivering': return { label: 'Próximo da entrega', tone: 'near' };
    default: return { label: status || 'Em andamento', tone: 'transit' };
  }
}

/** Estatísticas lifetime do histórico: total de entregas, ganhos (80% da taxa)
 * e média das notas recebidas (null se nenhuma). */
export function historyStats(history: any[]): { total: number; earnings: number; avgRating: number | null } {
  const list = history || [];
  const earnings = list.reduce((s, d) => s + (d?.fee || 0) * MOTOBOY_SHARE, 0);
  const rated = list.filter((d) => typeof d?.rating === 'number' && d.rating > 0);
  const avgRating = rated.length ? rated.reduce((s, d) => s + d.rating, 0) / rated.length : null;
  return { total: list.length, earnings, avgRating };
}

/** Filtra o histórico por status (all = tudo). */
export function filterHistory(history: any[], filter: 'all' | 'delivered' | 'cancelled'): any[] {
  const list = history || [];
  return filter === 'all' ? list : list.filter((d) => d?.status === filter);
}
