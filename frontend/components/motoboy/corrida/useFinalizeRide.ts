import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../../lib/api';
import { useOnline } from '../../../hooks/useOnline';
import { apiError } from '../../../lib/sellerApi';

export const PIN_LENGTH = 5;

export type FinalizeStatus = 'idle' | 'sending' | 'wrong' | 'locked' | 'error' | 'done';
export type FinalizeOutcome =
  | 'ok'
  /** 409 "Already delivered": o servidor já tinha concluído (ex.: resposta perdida na rede). É sucesso. */
  | 'already'
  | 'wrong'
  | 'locked'
  | 'conflict'
  | 'error'
  /** Já há um envio em voo: nada foi enviado agora. */
  | 'busy'
  /** Este PIN já foi enviado (recusado ou confirmado): nada foi enviado agora. */
  | 'repeated'
  | 'offline'
  | 'invalid';

/** Formato que o `onFinalize` do MotoboyNavMap (NavCard) espera, mais o motivo. */
export interface FinalizeResult { ok: boolean; outcome: FinalizeOutcome; error?: string }

export interface UseFinalizeRideOptions {
  /** 409 (já entregue, pedido cancelado): a página relê a corrida. */
  onConflict?: () => void;
}

/**
 * Finalizar a entrega com o PIN do cliente: `POST /deliveries/:id/finalizar { pin }` (K2).
 * Caminho ÚNICO de envio, usado pelo EntregarView e pelo `onFinalize` do MotoboyNavMap.
 * - um pedido em voo bloqueia qualquer outro (toque duplo = 1 POST);
 * - um PIN completo vai uma vez só: depois do envio, o mesmo PIN só vai de novo quando o
 *   servidor não deu veredito sobre ele (429 da trava, 409, rede, outro erro);
 * - 409 "Already delivered" é sucesso: a entrega já foi concluída no servidor (relê a corrida);
 * - resposta de uma corrida que já não está na tela é ignorada (não grava nada na nova);
 * - "PIN inválido" (400) guarda o PIN recusado até o motoboy digitar outro;
 * - o PIN nunca vai para log.
 */
export function useFinalizeRide(rideId: string | undefined | null, { onConflict }: UseFinalizeRideOptions = {}) {
  const online = useOnline();
  const [status, setStatus] = useState<FinalizeStatus>('idle');
  const [message, setMessage] = useState('');
  const [refusedPin, setRefusedPin] = useState<string | null>(null);
  /** Token do envio em voo (null = livre). Só o dono do token o libera. */
  const inFlight = useRef<object | null>(null);
  const currentRide = useRef(rideId);
  currentRide.current = rideId;
  const lastSentRef = useRef<string | null>(null);
  const conflictRef = useRef(onConflict);
  conflictRef.current = onConflict;
  const onlineRef = useRef(online);
  onlineRef.current = online;

  // Outra corrida: nada do PIN da anterior vale.
  useEffect(() => {
    inFlight.current = null;
    lastSentRef.current = null;
    setRefusedPin(null);
    setStatus('idle');
    setMessage('');
  }, [rideId]);

  const forget = () => {
    lastSentRef.current = null;
    setRefusedPin(null);
  };

  const finalize = useCallback(async (raw: string): Promise<FinalizeResult> => {
    const pin = String(raw ?? '').replace(/\D/g, '');
    if (!rideId || pin.length !== PIN_LENGTH) {
      return { ok: false, outcome: 'invalid', error: `Digite os ${PIN_LENGTH} números do código do cliente.` };
    }
    if (inFlight.current) return { ok: false, outcome: 'busy', error: 'O código já está sendo enviado. Aguarde.' };
    if (lastSentRef.current === pin) {
      return { ok: false, outcome: 'repeated', error: 'Este código já foi enviado. Peça o código de novo ao cliente.' };
    }
    if (!onlineRef.current) {
      return { ok: false, outcome: 'offline', error: 'Sem conexão: finalize quando a internet voltar.' };
    }

    const token = {};
    const sentFor = rideId;
    inFlight.current = token;
    lastSentRef.current = pin;
    setStatus('sending');
    setMessage('');
    // A corrida da tela mudou durante o envio: a resposta antiga não grava nada na nova.
    const stale = () => currentRide.current !== sentFor;
    const staleResult: FinalizeResult = { ok: false, outcome: 'error', error: 'Esta corrida não está mais na tela.' };
    try {
      await api.post(`/deliveries/${sentFor}/finalizar`, { pin });
      if (stale()) return staleResult;
      setStatus('done');
      return { ok: true, outcome: 'ok' };
    } catch (err) {
      if (stale()) return staleResult;
      const e = apiError(err);
      if (e.status === 409 && (e.code === 'ALREADY_DELIVERED' || /already delivered/i.test(e.message || ''))) {
        // O servidor já concluiu esta entrega (ex.: o 200 anterior se perdeu na rede): é sucesso.
        setStatus('done');
        conflictRef.current?.();
        return { ok: true, outcome: 'already' };
      }
      if (e.status === 400 && /pin/i.test(e.message || '')) {
        const msg = e.message || 'O código não confere.';
        setRefusedPin(pin);
        setStatus('wrong');
        setMessage(msg);
        return { ok: false, outcome: 'wrong', error: msg };
      }
      // Daqui para baixo o servidor não disse que ESTE PIN está errado: libera reenviar.
      forget();
      if (e.status === 429) {
        // A trava é checada antes do PIN: o 429 não gastou tentativa. A mensagem traz o tempo.
        const msg = e.message || 'Muitas tentativas de PIN. Espere alguns minutos e tente de novo.';
        setStatus('locked');
        setMessage(msg);
        return { ok: false, outcome: 'locked', error: msg };
      }
      if (e.status === 409) {
        const msg = e.message || 'Esta entrega mudou. Atualizamos a tela.';
        setStatus('error');
        setMessage(msg);
        conflictRef.current?.();
        return { ok: false, outcome: 'conflict', error: msg };
      }
      const msg = e.message || 'Não deu para finalizar agora. Confira a conexão e tente de novo.';
      setStatus('error');
      setMessage(msg);
      return { ok: false, outcome: 'error', error: msg };
    } finally {
      if (inFlight.current === token) inFlight.current = null;
    }
  }, [rideId]);

  const isRefused = useCallback((pin: string) => refusedPin !== null && pin === refusedPin, [refusedPin]);

  return { finalize, status, message, isRefused, online };
}

export type FinalizeRide = ReturnType<typeof useFinalizeRide>;

export default useFinalizeRide;
