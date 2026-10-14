/**
 * Rotas do painel do motoboy (DS v2, fase D2) — fonte única, espelho de lib/sellerRoutes.ts.
 * A moldura (_app), a barra de abas e as telas decidem por aqui, nunca por literal.
 * Os padrões são os do router.pathname do Next ('/motoboy/corrida/[id]').
 */

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
