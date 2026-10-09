import { useEffect, useState } from 'react';
import api from '../lib/api';

export type SettlementMode = 'custodia' | 'direto';
export interface SaasConfig {
  settlementMode: SettlementMode;
  directCardEnabled: boolean;
  loading: boolean;
}

interface Loaded { settlementMode: SettlementMode; directCardEnabled: boolean }

// Cache em módulo: GET /settings/saas é feito uma vez por carregamento de página.
let cached: Loaded | null = null;
let inflight: Promise<Loaded | null> | null = null;

function load(): Promise<Loaded | null> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = api.get('/settings/saas')
      .then((r) => {
        cached = {
          settlementMode: r.data?.settlementMode === 'direto' ? 'direto' : 'custodia',
          directCardEnabled: !!r.data?.directCardEnabled,
        };
        return cached;
      })
      .catch(() => null) // sem cache em erro: tenta de novo na próxima montagem
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** Versão sem hook (para código assíncrono fora de componente). null se a leitura falhar. */
export const loadSaasConfig = load;

/** Só para testes. */
export function __resetSaasConfigCache() { cached = null; inflight = null; }

/**
 * Modo de liquidação da plataforma. Enquanto carrega (ou se falhar) assume
 * 'custodia' — o comportamento atual; o backend é quem bloqueia de verdade.
 */
export function useSaasConfig(): SaasConfig {
  const [state, setState] = useState<Loaded | null>(cached);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    load().then((v) => {
      if (cancelled) return;
      if (v) setState(v);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  return {
    settlementMode: state?.settlementMode ?? 'custodia',
    directCardEnabled: state?.directCardEnabled ?? false,
    loading,
  };
}
