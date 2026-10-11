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
  cadastro: '/register',
  esqueciSenha: '/esqueci-senha',
  // provisório: vira /conta/notificacoes na Task 29
  notificacoes: '/notifications',
  // provisório: vira /conta/ajuda na Task 31
  ajuda: '/suporte',
  // provisório: vira /conta/privacidade na Task 32
  privacidadeConta: '/privacidade/solicitacoes',
} as const;

/** Só caminho interno (`/x`), nunca `//host` ou URL absoluta: evita open redirect. */
export function safeNext(v: unknown): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' && s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\') ? s : null;
}
/** Telas de entrar/cadastro/senha levando o caminho de volta. */
export function authHref(path: string, next?: string | null): string {
  const n = safeNext(next);
  return n ? `${path}?next=${encodeURIComponent(n)}` : path;
}

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
export const contaHref = (secao?: ContaSecao, next?: string | null): string => {
  const qs = new URLSearchParams();
  if (secao) qs.set('secao', secao);
  const n = safeNext(next);
  if (n) qs.set('next', n);
  const s = qs.toString();
  return s ? `${ROUTES.conta}?${s}` : ROUTES.conta;
};

const enc = encodeURIComponent;
export const lojaHref = (id: string): string => `/loja/${enc(id)}`;
export const produtoHref = (id: string): string => `/produto/${enc(id)}`;
export const categoriaHref = (nome: string): string => `/categoria/${enc(nome)}`;
export const pedidoHref = (id: string): string => `/pedido/${enc(id)}`;
export const pedidoReciboHref = (id: string): string => `${pedidoHref(id)}/recibo`;
export const pedidoConversaHref = (id: string, com?: 'loja' | 'entregador'): string => `${pedidoHref(id)}/conversa${com ? `?com=${com}` : ''}`;

/** Telas do cliente com TabBar + barra da sacola (padrões do router.pathname). */
export const CUSTOMER_TAB_ROUTES: string[] = ['/inicio', '/buscar', '/pedidos', '/conta', '/conta/carteira', '/loja/[id]', '/pedido/[id]', '/categoria/[nome]'];
/** Telas do cliente com header próprio no mobile: a Nav global só aparece no desktop. */
export const CUSTOMER_HEADERLESS_ROUTES: string[] = ['/loja/[id]', '/produto/[id]', '/sacola', '/pedido/[id]', '/pedido/[id]/conversa', '/pedido/[id]/recibo', '/categoria/[nome]'];
/** Todas as telas do cliente (faixa "Sem conexão"). */
export const CUSTOMER_ROUTES: string[] = [...CUSTOMER_TAB_ROUTES, '/produto/[id]', '/sacola', '/pedido/[id]/conversa', '/pedido/[id]/recibo'];
