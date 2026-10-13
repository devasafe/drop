import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import api from '../../../lib/api';
import { Button } from '../../ui/Button';
import { apiError } from '../../../lib/sellerApi';
import styles from './AcceptButton.module.css';

/** Janela do segundo toque. Sem window.confirm: o mesmo botão pede a confirmação. */
export const ACCEPT_CONFIRM_MS = 3000;

export interface AcceptButtonProps {
  orderId: string;
  /** O mesmo valor que a tela antiga mandava (order.deliveryDistance || 0): o payload não muda. */
  distance: number;
  onAccepted: (data: any) => void;
  /**
   * Chamado em qualquer erro do aceite (exceto STORE_TRANSFER_PENDING): recarrega o pedido.
   * Deve devolver `true` se o pedido recarregado AINDA aguarda aceite; `false` se não aguarda mais
   * (então aparece "Já aceito"). Sem retorno, vale a mensagem do servidor.
   * O servidor responde 400 (não 409) quando o pedido já mudou de estado.
   */
  onAlreadyHandled?: () => Promise<boolean | void> | boolean | void;
  size?: 'sm' | 'md';
}

export function AcceptButton({ orderId, distance, onAccepted, onAlreadyHandled, size = 'md' }: AcceptButtonProps) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sending = useRef(false);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const disarm = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setArmed(false);
  };

  const onClick = async () => {
    if (busy || sending.current) return;
    if (!armed) {
      setMessage(null);
      setArmed(true);
      timer.current = setTimeout(() => { timer.current = null; setArmed(false); }, ACCEPT_CONFIRM_MS);
      return;
    }
    disarm();
    sending.current = true;
    setBusy(true);
    try {
      const r = await api.post(`/orders/${orderId}/accept`, { distance });
      onAccepted(r?.data);
    } catch (err) {
      const e = apiError(err);
      const fallback = e.message || 'Não deu para aceitar agora. Tente de novo.';
      if (e.code === 'STORE_TRANSFER_PENDING') {
        setMessage(fallback);
      } else {
        let stillAwaiting: boolean | void = undefined;
        try { stillAwaiting = await onAlreadyHandled?.(); } catch { /* recarga falhou: mostra o erro do servidor */ }
        setMessage(stillAwaiting === false ? 'Já aceito' : fallback);
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <span className={styles.wrap}>
      <Button
        size={size}
        variant="primary"
        loading={busy}
        onClick={onClick}
        className={armed ? styles.armed : undefined}
        leftIcon={armed ? undefined : <Check size={16} aria-hidden="true" />}
      >
        {armed ? 'Toque de novo para aceitar' : 'Aceitar pedido'}
      </Button>
      {message && <span role="status" className={styles.message}>{message}</span>}
    </span>
  );
}
