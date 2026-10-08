import { useEffect, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useSaasConfig } from './useSaasConfig';

// Cache em módulo por usuário: GET /settings/custody-leftover uma vez por carregamento de página.
const cache = new Map<string, boolean>();

/** Só para testes. */
export function __resetCustodyLeftoverCache() { cache.clear(); }

/**
 * P16: no modo 'direto', o usuário ainda tem saldo da custódia (repasse em aberto ou
 * carteira com saldo)? Quem decide é o backend. Enquanto carrega, em erro ou fora do
 * modo direto → false (o menu "Saldo do modo anterior" fica escondido; o backend é
 * quem libera ou bloqueia as rotas de verdade).
 */
export function useCustodyLeftover(): boolean {
  const { user } = useAuth() || ({} as any);
  const { settlementMode } = useSaasConfig();
  const userId: string | undefined = user?._id || user?.id;
  const enabled = settlementMode === 'direto' && !!userId;
  const [value, setValue] = useState<boolean>(enabled && userId ? cache.get(userId) === true : false);

  useEffect(() => {
    if (!enabled || !userId) { setValue(false); return; }
    if (cache.has(userId)) { setValue(cache.get(userId) === true); return; }
    let cancelled = false;
    Promise.resolve()
      .then(() => api.get('/settings/custody-leftover'))
      .then((r: any) => {
        const v = r.data?.hasLeftover === true;
        cache.set(userId, v);
        if (!cancelled) setValue(v);
      })
      .catch(() => { if (!cancelled) setValue(false); });
    return () => { cancelled = true; };
  }, [enabled, userId]);

  return enabled && value;
}
