/**
 * Rotas do painel do motoboy (DS v2, fase D2) — fonte única, espelho de lib/sellerRoutes.ts.
 * A moldura (_app), a barra de abas e as telas decidem por aqui, nunca por literal.
 * Os padrões são os do router.pathname do Next ('/motoboy/corrida/[id]').
 */

export type EntregasSeg = 'andamento' | 'concluidas';
export type GanhosSeg = 'corridas' | 'saques' | 'notas';

const enc = encodeURIComponent;

/** Fonte única das rotas do painel do motoboy (espelho de SELLER_ROUTES). Ids são codificados. */
export const MOTOBOY_ROUTES = {
  // Abas
  corridas: '/motoboy',
  ganhos: (seg?: GanhosSeg): string => (seg ? `/motoboy/ganhos?seg=${seg}` : '/motoboy/ganhos'),
  nivel: '/motoboy/nivel',
  perfil: '/motoboy/perfil',
  // Sob a aba Corridas (com a barra)
  entregas: (seg?: EntregasSeg): string => (seg ? `/motoboy/entregas?seg=${seg}` : '/motoboy/entregas'),
  // Fluxo (sem barra, com voltar)
  entrega: (id: string): string => `/motoboy/entregas/${enc(id)}`,
  corrida: (id: string): string => `/motoboy/corrida/${enc(id)}`,
  comoCalculamos: '/motoboy/ganhos/como-calculamos',
  ranking: '/motoboy/ranking',
  notificacoes: '/motoboy/notificacoes',
  perfilPublico: (id: string): string => `/motoboy/${enc(id)}`,
  cadastro: '/motoboy/cadastro',
  // Subtelas do Perfil (C8)
  perfilDados: '/motoboy/perfil/dados',
  perfilAjuda: '/motoboy/perfil/ajuda',
  // Compartilhada com a loja (clara, V7)
  recebimento: '/dados-recebimento',
} as const;

/** As 4 abas, na ordem da barra (protótipo: Corridas · Ganhos · Nível · Perfil). */
export const MOTOBOY_TAB_ROUTES: string[] = ['/motoboy', '/motoboy/ganhos', '/motoboy/nivel', '/motoboy/perfil'];

/** Rotas com a barra de 4 abas: as 4 abas e Entregas, que fica sob a aba Corridas (protótipo, tela 20). */
export const MOTOBOY_TAB_BAR_ROUTES: string[] = [...MOTOBOY_TAB_ROUTES, '/motoboy/entregas'];

export function motoboyShowsTabBar(pathname: string): boolean {
  return MOTOBOY_TAB_BAR_ROUTES.includes(pathname);
}

/**
 * Rotas do painel do motoboy (moldura do painel no _app): /motoboy e todo /motoboy/*.
 * O perfil público (/motoboy/[id]) fica fora: ele é visto também pelo cliente. O _app põe a moldura
 * nele só quando o papel ativo é motoboy, e decide /dados-recebimento pelo papel também.
 */
export function isMotoboyPanelRoute(pathname: string): boolean {
  if (pathname === '/motoboy/[id]') return false;
  return pathname === '/motoboy' || pathname.startsWith('/motoboy/');
}
