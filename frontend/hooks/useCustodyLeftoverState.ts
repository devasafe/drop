import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useSaasConfig } from './useSaasConfig';

// Cache em módulo por usuário: GET /settings/custody-leftover uma vez por carregamento de página.
// Só o sucesso entra no cache; a falha nunca (a próxima montagem ou o retry relê).
const cache = new Map<string, boolean>();

/** Só para testes. */
export function __resetCustodyLeftoverCache() { cache.clear(); }

export interface CustodyLeftoverState {
  hasLeftover: boolean;
  loading: boolean;
  /** A leitura falhou (hasLeftover fica false). Quem mostra o saldo antigo avisa e oferece retry (K29). */
  error: boolean;
  /** Relê o saldo antigo depois de um erro. */
  retry: () => void;
}

/** Igual a useCustodyLeftover, mas informa se a consulta ainda está em voo (para gates de página) e se falhou. */
export function useCustodyLeftoverState(): CustodyLeftoverState {
  const { user } = useAuth() || ({} as any);
  const { settlementMode } = useSaasConfig();
  const userId: string | undefined = user?._id || user?.id;
  const enabled = settlementMode === 'direto' && !!userId;
  const [value, setValue] = useState<boolean>(enabled && userId ? cache.get(userId) === true : false);
  const [loaded, setLoaded] = useState<boolean>(enabled && userId ? cache.has(userId) : false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled || !userId) { setValue(false); setLoaded(false); setError(false); return; }
    if (cache.has(userId)) { setValue(cache.get(userId) === true); setLoaded(true); setError(false); return; }
    let cancelled = false;
    Promise.resolve()
      .then(() => api.get('/settings/custody-leftover'))
      .then((r: any) => {
        const v = r.data?.hasLeftover === true;
        cache.set(userId, v);
        if (!cancelled) { setValue(v); setError(false); setLoaded(true); }
      })
      .catch(() => { if (!cancelled) { setValue(false); setError(true); setLoaded(true); } });
    return () => { cancelled = true; };
  }, [enabled, userId, attempt]);

  // Não volta a `loading`: a tela que já mostra o resto não pisca; o erro só some com o sucesso.
  const retry = useCallback(() => { setAttempt((n) => n + 1); }, []);

  return { hasLeftover: enabled && value, loading: enabled && !loaded, error: enabled && error, retry };
}
