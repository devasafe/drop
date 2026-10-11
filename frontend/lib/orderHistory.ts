import { formatMoney } from './money';

const ddmm = (iso?: string | null) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? '' : new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};
const itens = (products: any[] = []) => {
  const n = products.reduce((s, p) => s + (Number(p.quantity) || 1), 0);
  return n ? `${n} ${n === 1 ? 'item' : 'itens'}` : '';
};

export const historyTitle = (o: any): string => `${o?.storeName || 'Loja'} · ${formatMoney(Number(o?.totalValue) || 0)}`;

/** Linha de apoio da linha do histórico (protótipo Pedidos). A data é a do pedido. */
export function historyLine(o: any): string {
  if (o?.status === 'rejeitado') return `Recusado pela loja ${ddmm(o.createdAt)}`.trim();
  if (o?.status === 'cancelado') {
    return [`Cancelado ${ddmm(o.cancelledAt || o.createdAt)}`.trim(), o.paymentStatus === 'refunded' ? 'estorno feito' : null].filter(Boolean).join(' · ');
  }
  const parts = [`Entregue ${ddmm(o?.createdAt)}`.trim(), itens(o?.products)];
  if (o?.status === 'entregue' && !o.storeRating) parts.push('avaliar a loja');
  return parts.filter(Boolean).join(' · ');
}
