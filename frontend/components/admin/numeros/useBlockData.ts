import { useCallback, useEffect, useRef, useState } from 'react';
import { adminErrorMessage } from '../../../lib/adminErrors';

export interface BlockData<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  retry: () => void;
}

/**
 * Leitura de um bloco da tela, independente dos outros (ficha da tela 7: erro num bloco não derruba o resto).
 * `key` nulo = o papel não pode ver o bloco: nada é pedido. Trocar a `key` (ex.: o período) apaga o dado
 * anterior até o novo chegar (nunca mostra número de outro período). Falha = mensagem do servidor, sem dado.
 */
export function useBlockData<T>(key: string | null, load: () => Promise<T>): BlockData<T> {
  const loadRef = useRef(load);
  loadRef.current = load;
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null, error: null, loading: key !== null,
  });

  useEffect(() => {
    if (key === null) {
      setState({ data: null, error: null, loading: false });
      return undefined;
    }
    let cancelled = false;
    setState({ data: null, error: null, loading: true });
    loadRef.current()
      .then((data) => { if (!cancelled) setState({ data, error: null, loading: false }); })
      .catch((err) => {
        if (!cancelled) {
          setState({ data: null, error: adminErrorMessage(err, 'Não foi possível carregar estes números.'), loading: false });
        }
      });
    return () => { cancelled = true; };
  }, [key, tick]);

  const retry = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, retry };
}

export default useBlockData;
