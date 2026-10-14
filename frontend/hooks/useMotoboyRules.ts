import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import { parseMotoboyRules, type MotoboyRules } from '../lib/motoboyRules';

/** Regras de ganho do motoboy. Falha → `failed` e `rules = null` (nunca um padrão inventado). */
export function useMotoboyRules(): { rules: MotoboyRules | null; loading: boolean; failed: boolean; retry: () => void } {
  const [rules, setRules] = useState<MotoboyRules | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let off = false;
    setLoading(true);
    setFailed(false);
    Promise.resolve()
      .then(() => api.get('/settings/platform-config'))
      .then((r: any) => {
        if (off) return;
        const v = parseMotoboyRules(r?.data);
        setRules(v);
        setFailed(!v);
        setLoading(false);
      })
      .catch(() => {
        if (off) return;
        setRules(null);
        setFailed(true);
        setLoading(false);
      });
    return () => { off = true; };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { rules, loading, failed, retry };
}
