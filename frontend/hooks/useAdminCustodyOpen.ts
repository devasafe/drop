import { useEffect, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useSaasConfig } from './useSaasConfig';

// Cache em módulo por usuário: GET /admin/custody-open uma vez por carregamento de página.
const cache = new Map<string, boolean>();

/** Só para testes. */
export function __resetAdminCustodyOpenCache() { cache.clear(); }

/**
 * I5: no modo 'direto', ainda há repasse de custódia (Payout pending/released/requested) ou
 * saque em aberto? Enquanto houver, o menu do admin mantém Payouts e Saques. Só consulta com
 * `payout:view` (a rota exige essa permissão). Carregando, em erro ou fora do modo direto → false.
 */
export function useAdminCustodyOpen(): boolean {
  const { user, can } = useAuth() || ({} as any);
  const { settlementMode } = useSaasConfig();
  const userId: string | undefined = user?._id || user?.id;
  const allowed = !!userId && typeof can === 'function' && can('payout:view');
  const enabled = settlementMode === 'direto' && allowed;
  const [value, setValue] = useState<boolean>(enabled && userId ? cache.get(userId) === true : false);

  useEffect(() => {
    if (!enabled || !userId) { setValue(false); return; }
    if (cache.has(userId)) { setValue(cache.get(userId) === true); return; }
    let cancelled = false;
    Promise.resolve()
      .then(() => api.get('/admin/custody-open'))
      .then((r: any) => {
        const v = r.data?.data?.open === true;
        cache.set(userId, v);
        if (!cancelled) setValue(v);
      })
      .catch(() => { if (!cancelled) setValue(false); });
    return () => { cancelled = true; };
  }, [enabled, userId]);

  return enabled && value;
}
