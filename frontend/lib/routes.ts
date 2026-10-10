/**
 * Rotas do app do cliente (DS v2, fase C) — fonte única. Telas e componentes do cliente
 * navegam por aqui, nunca por literal.
 */
export const ROUTES = {
  inicio: '/inicio',
  buscar: '/buscar',
  pedidos: '/pedidos',
  conta: '/conta',
  carteira: '/conta/carteira',
  sacola: '/sacola',
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
export const lojaHref = (id: string): string => `/loja/${enc(id)}`;
export const produtoHref = (id: string): string => `/produto/${enc(id)}`;
export const pedidoHref = (id: string): string => `/pedido/${enc(id)}`;

/** Telas do cliente com TabBar + barra da sacola (padrões do router.pathname). */
export const CUSTOMER_TAB_ROUTES: string[] = ['/inicio', '/buscar', '/pedidos', '/conta', '/conta/carteira', '/user-profile', '/loja/[id]', '/pedido/[id]'];
/** Telas do cliente com header próprio no mobile: a Nav global só aparece no desktop. */
export const CUSTOMER_HEADERLESS_ROUTES: string[] = ['/loja/[id]', '/produto/[id]'];
/** Todas as telas do cliente (faixa "Sem conexão"). */
export const CUSTOMER_ROUTES: string[] = [...CUSTOMER_TAB_ROUTES, '/produto/[id]', '/sacola'];
