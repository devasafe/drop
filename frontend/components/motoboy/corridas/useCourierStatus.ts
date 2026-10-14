import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../../lib/api';

export type CourierState = 'loading' | 'verified' | 'review' | 'incomplete' | 'error';

const notSent = (s: unknown) => s === undefined || s === null || s === 'none' || s === 'rejected';

/**
 * Estado do cadastro do motoboy a partir de /verification/motoboy/me (+ status do documento de /verification/me).
 * Só informa (alerta "Termine seu cadastro" e texto do EmAnalise): NÃO decide a trava do "Ficar online".
 * Quem trava é a tela, por `requiresVerification` ou pelo 403 COURIER_NOT_VERIFIED (C2). 'error' não bloqueia nada.
 */
export function courierState(mb: any, v: any): CourierState {
  if (!mb || typeof mb !== 'object') return 'error';
  if (mb.verified === true) return 'verified';
  const missing: string[] = Array.isArray(mb.missing) ? mb.missing : [];
  const doc = v?.verification?.document?.status;
  if (missing.includes('email')) return 'incomplete';
  if (missing.includes('courier') && notSent(mb.courier?.status)) return 'incomplete';
  if (missing.includes('facial') && notSent(mb.facial?.status)) return 'incomplete';
  if (missing.includes('document') && doc !== undefined && notSent(doc)) return 'incomplete';
  return 'review';
}

export function useCourierStatus(): { state: CourierState; reload: () => void } {
  const [state, setState] = useState<CourierState>('loading');
  const seq = useRef(0);
  const reload = useCallback(() => {
    const my = ++seq.current;
    Promise.all([
      api.get('/verification/motoboy/me').then((r: any) => r.data),
      api.get('/verification/me').then((r: any) => r.data).catch(() => null),
    ])
      .then(([mb, v]) => { if (my === seq.current) setState(courierState(mb, v)); })
      .catch(() => { if (my === seq.current) setState('error'); });
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { state, reload };
}
