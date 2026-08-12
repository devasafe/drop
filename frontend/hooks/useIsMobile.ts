import { useEffect, useState } from 'react';

/**
 * `true` quando a viewport está abaixo de `maxWidth` (mobile/estreito). SSR-safe:
 * começa `false` e ajusta no client (matchMedia). Usado pelo Drop Maps p/ trocar
 * o layout dos cards (dock no desktop, bottom-sheet no mobile).
 */
export function useIsMobile(maxWidth = 760): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [maxWidth]);

  return isMobile;
}

export default useIsMobile;
