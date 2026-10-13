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

/** Rotas do painel com a barra de 5 abas: as 5 abas e a Assinatura (protótipo, telas 35 e 36). As secundárias têm só o voltar. */
export const SELLER_TAB_BAR_ROUTES: string[] = [...SELLER_TAB_ROUTES, '/seller/assinatura'];

export function sellerShowsTabBar(pathname: string): boolean {
  return SELLER_TAB_BAR_ROUTES.includes(pathname);
}

/** Etapas do cadastro da loja que ainda moram fora de /seller (sem rodapé de marketing). */
export const SELLER_ONBOARDING_ROUTES: string[] = ['/verificacao-loja', '/dados-recebimento'];

/** Rotas em que o painel da loja (SellerPanelProvider) fica montado: todo /seller/* e o antigo /store-dashboard. */
export function isSellerPanelRoute(pathname: string): boolean {
  return pathname.startsWith('/seller/') || pathname === '/store-dashboard';
}
