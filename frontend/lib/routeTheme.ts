import { useEffect, useLayoutEffect } from 'react';
import { useRouter } from 'next/router';

export type Theme = 'light' | 'dark';

/**
 * Rotas já redesenhadas no DS v2 (tema claro). Padrões no formato do router.pathname do Next
 * ("/stores/[id]"). A fase C adiciona cada tela aqui quando ela for migrada; o resto fica escuro.
 */
export const LIGHT_ROUTES: string[] = ['/_styleguide', '/inicio', '/buscar', '/loja/[id]', '/produto/[id]', '/sacola', '/pedido/[id]', '/pedidos', '/conta', '/conta/carteira', '/login'];

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

export function themeForPath(pathname: string): Theme {
  return LIGHT_ROUTES.some((p) => patternToRegex(p).test(pathname)) ? 'light' : 'dark';
}

/** Roda no <head> antes da pintura: evita o claro piscar escuro na primeira carga. */
export const THEME_BOOT_SCRIPT = `(function(){try{var r=${JSON.stringify(
  LIGHT_ROUTES.map((p) => patternToRegex(p).source),
)};var p=location.pathname;var t='dark';for(var i=0;i<r.length;i++){if(new RegExp(r[i]).test(p)){t='light';break;}}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

/** Layout effect no browser (antes da pintura e dos efeitos dos filhos); effect comum no SSR. */
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** Mantém o data-theme certo em navegação client-side. */
export function useRouteTheme(): void {
  const router = useRouter();
  useIsomorphicLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', themeForPath(router.pathname));
  }, [router.pathname]);
}
