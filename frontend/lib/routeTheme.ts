import { useEffect, useLayoutEffect } from 'react';
import { useRouter } from 'next/router';
import {
  NIGHT_PREF_KEY, NIGHT_PREF_EVENT, NIGHT_START_HOUR, NIGHT_END_HOUR,
  readNightPref, resolveNightAuto, msUntilNextBoundary,
} from './nightTheme';

export type Theme = 'light' | 'dark';
/** Tipo do tema por rota: 'night-auto' (só motoboy) é resolvido para claro ou escuro pelo relógio e pela preferência. */
export type RouteTheme = Theme | 'night-auto';

/**
 * Rotas já redesenhadas no DS v2 (tema claro). Padrões no formato do router.pathname do Next
 * ("/stores/[id]"). A fase C adiciona cada tela aqui quando ela for migrada; o resto fica escuro.
 */
/**
 * Painel da loja (fase D1). Toda página nova de /seller entra aqui na task que a cria
 * (o teste __tests__/sellerTheme.test.ts cobra). Rotas compartilhadas com outros papéis
 * (/verificacao, /notifications) ficam fora: a loja ganha telas próprias.
 * Exceção: /dados-recebimento é clara para loja e motoboy (decisão do usuário na V7), por isso
 * entra em LIGHT_ROUTES, e não aqui.
 */
export const SELLER_LIGHT_ROUTES: string[] = [
  '/store-dashboard', '/verificacao-loja',
  '/seller/dashboard', '/seller/pedidos', '/seller/pedido/[id]', '/seller/order-[id]',
  '/seller/products', '/seller/create-product', '/seller/edit-product', '/seller/estoque',
  '/seller/dinheiro', '/seller/wallet', '/seller/transfer-wallet', '/seller/pagamentos', '/seller/conta-asaas',
  '/seller/loja', '/seller/avaliacoes', '/seller/notificacoes', '/seller/analytics', '/seller/coupons', '/seller/integrations',
  '/seller/assinatura', '/seller/select-plan', '/seller/create-store', '/seller/horarios', '/seller/plano', '/seller/abrir',
  '/seller/perfil', '/seller/ajuda',
];

export const LIGHT_ROUTES: string[] = ['/_styleguide', '/inicio', '/buscar', '/loja/[id]', '/produto/[id]', '/sacola', '/pedido/[id]', '/pedidos', '/conta', '/conta/carteira', '/login', '/register', '/esqueci-senha', '/categoria/[nome]', '/pedido/[id]/conversa', '/pedido/[id]/recibo', '/conta/notificacoes', '/conta/ajuda', '/conta/privacidade', '/termos', '/privacidade', '/cookies', '/privacidade/solicitacoes', '/access-denied', '/404', '/500', '/dados-recebimento', ...SELLER_LIGHT_ROUTES];

/**
 * Painel do motoboy (fase D2): claro de dia, escuro das 18:00 às 05:59 com a preferência "Tela escura à noite".
 * Toda página nova do motoboy entra aqui na task que a cria (__tests__/motoboyTheme.test.ts cobra); a task que
 * apaga uma página antiga tira a linha dela (lib/__tests__/routeTheme.pages.test.ts cobra).
 * As telas antigas ainda existentes também ficam aqui (decisão da P2): a moldura delas já é a do painel novo
 * e os tokens antigos têm ponte para o claro (styles/tokens.css, "ponte-claro").
 * Fora: /motoboy/[id] (perfil público, visto também pelo cliente) e /dados-recebimento (clara, V7).
 */
export const MOTOBOY_NIGHT_ROUTES: string[] = [
  '/motoboy',
  // Telas novas do DS v2 (P3–P5):
  '/motoboy/corrida/[id]', '/motoboy/entregas', '/motoboy/entregas/[id]', '/motoboy/ganhos',
  // Telas antigas, até a tela nova substituir (P3–P5):
  '/motoboy/ajuda-ganhos',
  '/motoboy/gamification', '/motoboy/beneficios', '/motoboy/ranking', '/motoboy/profile',
];

export function patternToRegex(pattern: string): RegExp {
  // Escapa cada trecho literal; [slug] vira um segmento, [...slug] vira "o resto".
  const src = pattern
    .split(/(\[\.\.\.[^\]]+\]|\[[^\]]+\])/)
    .map((part) => {
      if (part.startsWith('[...')) return '.+';
      if (part.startsWith('[')) return '[^/]+';
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${src}/?$`);
}

const matchesAny = (list: string[], pathname: string) => list.some((p) => patternToRegex(p).test(pathname));

export function themeForPath(pathname: string): RouteTheme {
  if (matchesAny(MOTOBOY_NIGHT_ROUTES, pathname)) return 'night-auto';
  return matchesAny(LIGHT_ROUTES, pathname) ? 'light' : 'dark';
}

/** O tema que vale agora na rota: 'night-auto' resolvido pela hora e pela preferência. */
export function resolvedThemeForPath(pathname: string, now: Date, prefOn: boolean): Theme {
  const t = themeForPath(pathname);
  return t === 'night-auto' ? resolveNightAuto(now, prefOn) : t;
}

const sources = (list: string[]) => JSON.stringify(list.map((p) => patternToRegex(p).source));

/**
 * Roda no <head> antes da pintura: evita o tema piscar na primeira carga. Mesma regra de resolvedThemeForPath
 * (o teste routeTheme.night compara os dois com relógio fixo e preferência ligada/desligada).
 */
export const buildBootScript = (nightRoutes: string[], lightRoutes: string[]): string => `(function(){var d=document.documentElement;try{var p=location.pathname;var m=function(r){for(var i=0;i<r.length;i++){if(new RegExp(r[i]).test(p))return true;}return false;};var t='dark';if(m(${sources(nightRoutes)})){var on=true;try{on=localStorage.getItem(${JSON.stringify(NIGHT_PREF_KEY)})!=='0';}catch(e){}var h=new Date().getHours();t=on&&(h>=${NIGHT_START_HOUR}||h<${NIGHT_END_HOUR})?'dark':'light';}else if(m(${sources(lightRoutes)})){t='light';}d.setAttribute('data-theme',t);}catch(e){d.setAttribute('data-theme','dark');}})();`;

export const THEME_BOOT_SCRIPT = buildBootScript(MOTOBOY_NIGHT_ROUTES, LIGHT_ROUTES);

/** Layout effect no browser (antes da pintura e dos efeitos dos filhos); effect comum no SSR. */
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Mantém o data-theme certo: na navegação client-side e, nas rotas do motoboy, na virada do relógio
 * (um timer até 18:00/06:00) e quando a preferência muda (evento da mesma aba ou 'storage' de outra).
 */
export function useRouteTheme(): void {
  const router = useRouter();
  const pathname = router.pathname;
  useIsomorphicLayoutEffect(() => {
    const apply = () => {
      document.documentElement.setAttribute('data-theme', resolvedThemeForPath(pathname, new Date(), readNightPref()));
    };
    apply();
    if (themeForPath(pathname) !== 'night-auto') return undefined;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { apply(); schedule(); }, msUntilNextBoundary(new Date()));
    };
    schedule();
    const onStorage = (e: StorageEvent) => { if (e.key === NIGHT_PREF_KEY) apply(); };
    // O timer não sobrevive à suspensão do aparelho: ao voltar a ficar visível, relê a hora e reagenda.
    const onVisible = () => { if (document.visibilityState === 'visible') { apply(); schedule(); } };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(NIGHT_PREF_EVENT, apply);
    window.addEventListener('storage', onStorage);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(NIGHT_PREF_EVENT, apply);
      window.removeEventListener('storage', onStorage);
    };
  }, [pathname]);
}
