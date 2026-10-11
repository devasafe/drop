export interface OrderMonthGroup { key: string; label: string; orders: any[] }

/** Agrupa pedidos por mês (mais recente primeiro). Sem data vai para o fim. */
export function groupOrdersByMonth(orders: any[]): OrderMonthGroup[] {
  const map = new Map<string, OrderMonthGroup>();
  const sorted = [...(orders || [])].sort((a, b) => (Date.parse(b?.createdAt) || 0) - (Date.parse(a?.createdAt) || 0));
  for (const o of sorted) {
    const t = Date.parse(o?.createdAt);
    const d = Number.isNaN(t) ? null : new Date(t);
    const key = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : 'sem-data';
    if (!map.has(key)) {
      const raw = d ? d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : 'Sem data';
      map.set(key, { key, label: raw.charAt(0).toUpperCase() + raw.slice(1), orders: [] });
    }
    map.get(key)!.orders.push(o);
  }
  return Array.from(map.values());
}
