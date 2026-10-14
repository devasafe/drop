import { useEffect, useState } from 'react';

/** Relógio da tela (cronômetros). Só a tela usa; os componentes recebem `now` por prop (testáveis). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export default useNow;
