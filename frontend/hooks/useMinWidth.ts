import { useEffect, useState } from 'react';

/** Breakpoint único do admin (spec D3a): computador a partir de 1024 px. */
export const ADMIN_DESKTOP_MIN = 1024;

const queryFor = (px: number) => `(min-width: ${px}px)`;
const read = (px: number): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(queryFor(px)).matches : true;

/**
 * true quando a tela tem pelo menos `px` de largura. Sem matchMedia (SSR, jsdom) devolve true (computador).
 * Segue as mudanças de largura (girar o aparelho, redimensionar a janela).
 */
export function useMinWidth(px: number): boolean {
  const [ok, setOk] = useState<boolean>(() => read(px));
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(queryFor(px));
    const update = () => setOk(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, [px]);
  return ok;
}

export default useMinWidth;
