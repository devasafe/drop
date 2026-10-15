// Helpers puros das telas de entregas do motoboy (em andamento + histórico).

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

/** Estatísticas do histórico: total de entregas e média das notas recebidas (null se nenhuma). */
export function historyStats(history: any[]): { total: number; avgRating: number | null } {
  const list = history || [];
  const rated = list.filter((d) => typeof d?.rating === 'number' && d.rating > 0);
  const avgRating = rated.length ? rated.reduce((s, d) => s + d.rating, 0) / rated.length : null;
  return { total: list.length, avgRating };
}

/** Filtra o histórico por status (all = tudo). */
export function filterHistory(history: any[], filter: 'all' | 'delivered' | 'cancelled'): any[] {
  const list = history || [];
  return filter === 'all' ? list : list.filter((d) => d?.status === filter);
}
