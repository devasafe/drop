import { useEffect, useState } from 'react';

export type ResolvedTheme = 'light' | 'dark';

/**
 * Tema que está valendo agora no <html> (quem decide é o script do <head> e o useRouteTheme, inclusive o
 * modo escuro manual do motoboy). Sem atributo, ou fora do browser, vale escuro: é o que o mapa sempre leu.
 */
export function readResolvedTheme(): ResolvedTheme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/**
 * O tema resolvido, reagindo quando ele muda (navegação, modo escuro do motoboy).
 * Use em componentes montados só no browser (mapa com `dynamic(..., { ssr: false })`) ou cuja marcação
 * não dependa do valor: no SSR o primeiro valor é 'dark' e pode divergir da hidratação.
 */
export function useResolvedTheme(): ResolvedTheme {
  const [theme, setTheme] = useState<ResolvedTheme>(readResolvedTheme);
  useEffect(() => {
    setTheme(readResolvedTheme());
    const mo = new MutationObserver(() => setTheme(readResolvedTheme()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return theme;
}
