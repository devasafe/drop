export type OrderBucket = 'novos' | 'emPreparo' | 'aCaminho';

const BUCKET: Record<string, OrderBucket> = {
  criado: 'novos', created: 'novos', pago: 'novos', paid: 'novos',
  aguardando_motoboy: 'emPreparo', assigned: 'emPreparo',
  picked: 'aCaminho', enviado: 'aCaminho', shipped: 'aCaminho', aguardando_confirmacao: 'aCaminho',
};

export function bucketOfStatus(status: string): OrderBucket | null {
  return BUCKET[status] ?? null;
}

export function countByBucket(orders: any[]): Record<OrderBucket, number> {
  const acc: Record<OrderBucket, number> = { novos: 0, emPreparo: 0, aCaminho: 0 };
  for (const o of orders || []) {
    const b = bucketOfStatus(o?.status);
    if (b) acc[b] += 1;
  }
  return acc;
}

function ts(o: any): number {
  const v = o?.createdAt;
  const n = typeof v === 'number' ? v : Date.parse(v);
  return Number.isNaN(n) ? 0 : n;
}

/** O pedido a destacar: primeiro os "novos" (aguardando aceite) mais recentes; senão o ongoing mais recente. */
export function pickActiveOrder(orders: any[]): any | null {
  const list = orders || [];
  if (list.length === 0) return null;
  const novos = list.filter((o) => bucketOfStatus(o?.status) === 'novos');
  const pool = novos.length > 0 ? novos : list;
  return [...pool].sort((a, b) => ts(b) - ts(a))[0] ?? null;
}

/** Receita líquida da loja num pedido (comissão já descontada). */
export function orderNetRevenue(order: any): number {
  const sa = order?.walletDistribution?.storeAmount;
  if (typeof sa === 'number') return sa;
  const productTotal = (order?.totalValue || 0) - (order?.deliveryFee || 0);
  return productTotal * 0.9;
}

export function isToday(value: string | number | Date, now: Date = new Date()): boolean {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

export function todayStats(
  orders: any[], history: any[], now: Date = new Date(),
): { pedidosHoje: number; faturamentoHoje: number } {
  const all = [...(orders || []), ...(history || [])];
  const todays = all.filter((o) => o?.createdAt && isToday(o.createdAt, now) && !TERMINAL_CANCEL(o?.status));
  const faturamentoHoje = todays.reduce((s, o) => s + orderNetRevenue(o), 0);
  return { pedidosHoje: todays.length, faturamentoHoje };
}

function TERMINAL_CANCEL(status: string): boolean {
  return status === 'cancelado' || status === 'cancelled' || status === 'rejeitado';
}

export function isStoreOpen(store: any): boolean {
  return store?.isOpen !== false;
}
