import { useEffect, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useSaasConfig } from './useSaasConfig';

// Cache em módulo por usuário: GET /settings/custody-leftover uma vez por carregamento de página.
const cache = new Map<string, boolean>();

/** Só para testes. */
export function __resetCustodyLeftoverCache() { cache.clear(); }

/** Igual a useCustodyLeftover, mas informa se a consulta ainda está em voo (para gates de página). */
export function useCustodyLeftoverState(): { hasLeftover: boolean; loading: boolean } {
  const { user } = useAuth() || ({} as any);
  const { settlementMode } = useSaasConfig();
  const userId: string | undefined = user?._id || user?.id;
  const enabled = settlementMode === 'direto' && !!userId;
  const [value, setValue] = useState<boolean>(enabled && userId ? cache.get(userId) === true : false);
  const [loaded, setLoaded] = useState<boolean>(enabled && userId ? cache.has(userId) : false);

  useEffect(() => {
    if (!enabled || !userId) { setValue(false); setLoaded(false); return; }
    if (cache.has(userId)) { setValue(cache.get(userId) === true); setLoaded(true); return; }
    let cancelled = false;
    Promise.resolve()
      .then(() => api.get('/settings/custody-leftover'))
      .then((r: any) => {
        const v = r.data?.hasLeftover === true;
        cache.set(userId, v);
        if (!cancelled) { setValue(v); setLoaded(true); }
      })
      .catch(() => { if (!cancelled) { setValue(false); setLoaded(true); } });
    return () => { cancelled = true; };
  }, [enabled, userId]);

  return { hasLeftover: enabled && value, loading: enabled && !loaded };
}
