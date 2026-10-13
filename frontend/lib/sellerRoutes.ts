/**
 * Rotas do painel da loja (DS v2, fase D1) — fonte única. Telas e componentes da loja
 * navegam por aqui, nunca por literal.
 */
export type PedidosSeg = 'andamento' | 'historico' | 'devolucoes';

const enc = encodeURIComponent;

export const SELLER_ROUTES = {
  // Abas
  agora: '/seller/dashboard',
  pedidos: (seg?: PedidosSeg): string => (seg ? `/seller/pedidos?seg=${seg}` : '/seller/pedidos'),
  produtos: '/seller/products',
  dinheiro: '/seller/dinheiro',
  loja: '/seller/loja',
  // Secundárias (header branco com voltar)
  pedido: (id: string): string => `/seller/pedido/${enc(id)}`,
  novoProduto: '/seller/create-product',
  editarProduto: (id: string): string => `/seller/edit-product?edit=${enc(id)}`,
  estoque: '/seller/estoque',
  desempenho: '/seller/analytics',
  avaliacoes: '/seller/avaliacoes',
  cupons: '/seller/coupons',
  integracoes: '/seller/integrations',
  horarios: '/seller/horarios',
  plano: '/seller/plano',
  assinatura: '/seller/assinatura',
  notificacoes: '/seller/notificacoes',
  contaAsaas: '/seller/conta-asaas',
  abrir: '/seller/abrir',
} as const;

/** As 5 abas, na ordem da barra (padrões do router.pathname). */
export const SELLER_TAB_ROUTES: string[] = [
  '/seller/dashboard',
  '/seller/pedidos',
  '/seller/products',
  '/seller/dinheiro',
  '/seller/loja',
];

/** Rotas em que o painel da loja (SellerPanelProvider) fica montado: todo /seller/* e o antigo /store-dashboard. */
export function isSellerPanelRoute(pathname: string): boolean {
  return pathname.startsWith('/seller/') || pathname === '/store-dashboard';
}
