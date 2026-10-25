// frontend/lib/sellerOrders.ts
// Vocabulário do pedido e do estoque do ponto de vista da loja (DS v2, D1).
import { isPlan1Order } from './customerOrder';

export type StageTone = 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'neutral';
export interface Stage { label: string; tone: StageTone }

const CANCELLED = ['cancelado', 'cancelled', 'rejeitado'];

export const isAwaitingAccept = (o: any): boolean => o?.status === 'criado' || o?.status === 'created';
export const isCancelled = (o: any): boolean => CANCELLED.includes(o?.status);
export const isDelivered = (o: any): boolean => o?.status === 'entregue' || o?.status === 'delivered';
export const hasPendingReturn = (o: any): boolean => o?.delivery?.statusDevolucao === 'aguardando_confirmacao';

/** Rótulo e tom do pedido para a loja. A devolução pendente vem antes de tudo o que ainda está aberto. */
export function orderStage(o: any): Stage {
  if (isCancelled(o)) return { label: 'Cancelado', tone: 'neutral' };
  // Reembolso de pedido entregue (caso B): o que espera a loja vem antes de "Entregue".
  if (o?.returnRequest?.status === 'aguardando_loja') return { label: 'Reembolso: responder', tone: 'warning' };
  if (o?.returnRequest?.status === 'devolvendo') return { label: 'Devolução: conferir código', tone: 'warning' };
  if (isDelivered(o)) return { label: 'Entregue', tone: 'success' };
  if (hasPendingReturn(o)) return { label: 'Devolução: responder', tone: 'warning' };
  if (isAwaitingAccept(o)) return { label: 'Novo', tone: 'brand' };
  const d = o?.delivery;
  if (d?.status === 'picked' || o?.status === 'enviado') return { label: 'A caminho do cliente', tone: 'info' };
  if (d?.status === 'assigned') return { label: 'Motoboy chegando', tone: 'info' };
  if (isPlan1Order(o)) return { label: 'Aguardando o cliente confirmar', tone: 'neutral' };
  if (o?.readyAt) return { label: 'Pronto para retirada', tone: 'brand' };
  return { label: 'Separando', tone: 'brand' };
}

/** "4 itens · Fone, Cabo e mais 1". */
export function itemsSummary(o: any): string {
  const list: any[] = Array.isArray(o?.products) ? o.products : [];
  const qty = list.reduce((s, p) => s + (Number(p?.quantity) || 0), 0);
  const names = list.map((p) => p?.productName || p?.name || 'Produto');
  const shown = names.slice(0, 2).join(', ');
  const rest = names.length > 2 ? ` e mais ${names.length - 2}` : '';
  return `${qty} ${qty === 1 ? 'item' : 'itens'}${names.length ? ` · ${shown}${rest}` : ''}`;
}

/** Produtos distintos do pedido (para "pausar até repor"). */
export function orderItems(o: any): Array<{ productId: string; name: string }> {
  const seen = new Set<string>();
  const out: Array<{ productId: string; name: string }> = [];
  for (const p of Array.isArray(o?.products) ? o.products : []) {
    const id = p?.productId ? String(p.productId) : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ productId: id, name: p?.productName || p?.name || 'Produto' });
  }
  return out;
}

const ts = (o: any) => {
  const n = Date.parse(o?.createdAt);
  return Number.isNaN(n) ? 0 : n;
};

/** Novos (aguardando aceite) primeiro; dentro de cada grupo, o mais recente no topo. */
export function sortOngoing(list: any[]): any[] {
  return [...(list || [])].sort((a, b) => {
    const na = isAwaitingAccept(a) ? 0 : 1;
    const nb = isAwaitingAccept(b) ? 0 : 1;
    return na !== nb ? na - nb : ts(b) - ts(a);
  });
}

/**
 * Motivos de recusa. `code` é exatamente o enum validado no servidor; `description` é o texto
 * que a tela antiga mandava em `reason` (o payload não muda).
 */
export const REJECT_REASONS = [
  { code: 'not_available', label: 'Acabou um item', description: 'Item fora de estoque' },
  { code: 'store_busy', label: 'Loja cheia agora', description: 'Muitos pedidos para processar' },
  { code: 'store_closed', label: 'Vou fechar', description: 'Loja está fechada no momento' },
  { code: 'payment_issue', label: 'Problema no pagamento', description: 'Problema com o pagamento' },
  { code: 'other', label: 'Outro motivo', description: '' },
] as const;
export type RejectReasonCode = (typeof REJECT_REASONS)[number]['code'];

export type PedidosSeg = 'novos' | 'andamento' | 'concluidos' | 'devolucoes';
/** Links antigos (?seg=historico) abrem Concluídos. */
export function parseSeg(v: unknown): PedidosSeg {
  if (v === 'historico') return 'concluidos';
  return v === 'novos' || v === 'concluidos' || v === 'devolucoes' ? v : 'andamento';
}

/** Até 3 unidades é estoque baixo; 0 é esgotado. */
export const LOW_STOCK_MAX = 3;
export function stockTone(quantity: number): 'out' | 'low' | 'ok' {
  if (quantity <= 0) return 'out';
  return quantity <= LOW_STOCK_MAX ? 'low' : 'ok';
}
export const isLowStock = (p: any): boolean => (Number(p?.quantity) || 0) <= LOW_STOCK_MAX;

/** Dias até acabar no ritmo dos últimos 30 dias; sem vendas → null; esgotado → 0. */
export function daysLeft(quantity: number, sold30: number): number | null {
  if (quantity <= 0) return 0;
  if (!sold30 || sold30 <= 0) return null;
  return Math.max(1, Math.round(quantity / (sold30 / 30)));
}

export const hasPhoto = (p: any): boolean => !!(p?.image || (Array.isArray(p?.images) && p.images.length > 0));
