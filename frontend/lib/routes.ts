/**
 * Rotas do app do cliente (DS v2, fase C) — fonte única. Telas e componentes do cliente
 * navegam por aqui, nunca por literal. Loja, produto, pedido e sacola apontam para a rota
 * antiga até a task que cria a tela nova trocar o destino (e acrescentar o redirect em
 * lib/redirects.js): assim todo commit intermediário navega para uma tela que existe.
 */
export const ROUTES = {
  inicio: '/inicio',
  buscar: '/buscar',
  pedidos: '/pedidos',
  conta: '/conta',
  carteira: '/conta/carteira',
  sacola: '/checkout' as string,
  login: '/login',
} as const;

export type BuscarTab = 'produtos' | 'lojas';

export function buscarHref(p: { q?: string; tab?: BuscarTab; categoria?: string; focus?: boolean } = {}): string {
  const qs = new URLSearchParams();
  if (p.q) qs.set('q', p.q);
  if (p.tab) qs.set('tab', p.tab);
  if (p.categoria) qs.set('categoria', p.categoria);
  if (p.focus) qs.set('focus', '1');
  const s = qs.toString();
  return s ? `${ROUTES.buscar}?${s}` : ROUTES.buscar;
}

export type ContaSecao = 'dados' | 'verificacao' | 'enderecos';
export const contaHref = (secao?: ContaSecao): string => (secao ? `${ROUTES.conta}?secao=${secao}` : ROUTES.conta);

const enc = encodeURIComponent;
export const lojaHref = (id: string): string => `/stores/${enc(id)}`;
export const produtoHref = (id: string): string => `/product/${enc(id)}`;
export const pedidoHref = (id: string): string => `/store-order/${enc(id)}`;
