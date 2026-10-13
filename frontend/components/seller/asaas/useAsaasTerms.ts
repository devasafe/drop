// frontend/components/seller/asaas/useAsaasTerms.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../../lib/api';

export interface AsaasTerms {
  state: 'loading' | 'ok' | 'error';
  text: string;
  version: string;
  /** O que mudou na versão vigente (D1). */
  changes: string[];
  reload: () => Promise<void>;
}

/** Texto do termo vindo do backend (fonte única). A versão EXIBIDA é a que o aceite envia. */
export function useAsaasTerms(): AsaasTerms {
  const aliveRef = useRef(true);
  // Volta a true no (re)mount: em StrictMode o React monta, desmonta e monta de novo.
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);
  const [s, setS] = useState<Omit<AsaasTerms, 'reload'>>({ state: 'loading', text: '', version: '', changes: [] });

  const reload = useCallback(() => {
    setS((p) => ({ ...p, state: 'loading' }));
    return api.get('/settings/store-asaas-terms')
      .then((r) => {
        if (!aliveRef.current) return;
        const text = typeof r.data?.text === 'string' ? r.data.text.trim() : '';
        const version = typeof r.data?.version === 'string' ? r.data.version.trim() : '';
        const changes = Array.isArray(r.data?.changes)
          ? r.data.changes.filter((c: unknown): c is string => typeof c === 'string' && c.trim() !== '')
          : [];
        // Fail closed: sem texto ou sem versão, ninguém aceita um termo que não leu.
        setS({ state: text && version ? 'ok' : 'error', text, version, changes });
      })
      .catch(() => { if (aliveRef.current) setS((p) => ({ ...p, state: 'error' })); });
  }, []);

  useEffect(() => { reload(); }, [reload]);
  return { ...s, reload };
}
