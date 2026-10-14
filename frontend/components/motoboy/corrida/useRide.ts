import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../../lib/api';
import { apiError } from '../../../lib/sellerApi';
import { useSocket } from '../../../contexts/SocketContext';
import { mergeRide } from './rideView';

export type RideError = 'gone' | 'network' | null;
export interface CancelInfo { reason: string | null; compensation: number | null }

/** Eventos que mudam a corrida: cada um relê o servidor (os campos novos vêm certos). */
const REFRESH_EVENTS = [
  'delivery:status_changed',
  'delivery:pin_validated',
  'delivery:picked',
  'delivery:completed',
  'delivery:cancelled',
  'delivery:return_initiated',
  'delivery:updated',
];

/** Eventos que dizem "a loja validou a retirada": a tela passa para "entregar" na hora. */
const PICKED_EVENTS = new Set(['delivery:pin_validated', 'delivery:picked']);

function textOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

function numberOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Corrida do motoboy (/motoboy/corrida/[id]). Relê o servidor a cada evento da corrida e na
 * reconexão (onReconnect compartilhado, V16). Remenda na hora só a passagem assigned → picked.
 */
export function useRide(id?: string) {
  const { on, onReconnect } = useSocket();
  const [ride, setRide] = useState<any>(null);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState<RideError>(null);
  const [cancelInfo, setCancelInfo] = useState<CancelInfo | null>(null);
  const [returnConfirmed, setReturnConfirmed] = useState(false);
  const seq = useRef(0);
  // A loja já validou a retirada desta corrida: nenhuma leitura volta a tela para "retirar",
  // nem a que chega antes de a corrida estar na tela.
  const pickedSeen = useRef(false);

  const load = useCallback(async () => {
    if (!id) return;
    const my = ++seq.current;
    try {
      const r = await api.get(`/deliveries/${id}`);
      if (my !== seq.current) return;
      setRide((prev: any) => {
        const merged = mergeRide(prev, r.data);
        return pickedSeen.current && merged?.status === 'assigned' ? { ...merged, status: 'picked' } : merged;
      });
      setError(null);
    } catch (err) {
      if (my !== seq.current) return;
      const s = apiError(err).status;
      setError(s === 403 || s === 404 ? 'gone' : 'network');
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    seq.current += 1; // descarta leitura em voo da corrida anterior
    pickedSeen.current = false;
    setRide(null);
    setError(null);
    setCancelInfo(null);
    setReturnConfirmed(false);
    if (!id) { setLoading(false); return undefined; }
    setLoading(true);
    load();
    const mine = (d: any) => !!d && String(d.deliveryId ?? d._id) === String(id);
    const offs = REFRESH_EVENTS.map((ev) => on(ev, (d: any) => {
      if (!mine(d)) return;
      if (PICKED_EVENTS.has(ev)) {
        pickedSeen.current = true;
        setRide((p: any) => (p && p.status === 'assigned' ? { ...p, status: 'picked' } : p));
      }
      if (ev === 'delivery:cancelled') {
        // K20: o evento chega duas vezes (sala do motoboy com motivo e compensação; sala
        // "motoboys" só com o status). O que chega sem o campo não apaga o que já se sabe.
        setCancelInfo((prev) => ({
          reason: textOrNull(d.reason) ?? prev?.reason ?? null,
          compensation: numberOrNull(d.cancellationCompensation) ?? prev?.compensation ?? null,
        }));
      }
      load();
    }));
    // A loja confirmou a devolução: a corrida deixa de ser do motoboy (o GET daria 403).
    offs.push(on('delivery:return_confirmed', (d: any) => { if (mine(d)) setReturnConfirmed(true); }));
    const offRe = onReconnect(load);
    return () => { offs.forEach((off) => off()); offRe(); };
  }, [id, on, onReconnect, load]);

  return { ride, loading, error, reload: load, cancelInfo, returnConfirmed };
}
