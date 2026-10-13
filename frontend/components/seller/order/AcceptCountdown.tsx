import { useEffect, useRef, useState } from 'react';
import { formatClock } from '../../../lib/sellerApi';
import styles from './AcceptCountdown.module.css';

/**
 * Tempo que falta para aceitar o pedido. O prazo vem pronto do servidor (acceptDeadline),
 * calculado pelo mesmo relógio do job que CANCELA (com reembolso) o pedido vencido.
 * Nunca há valor fixo aqui, e o pedido não é aceito sozinho.
 */
export function AcceptCountdown({ deadline, onExpire }: {
  deadline?: string | null;
  /** Chamado uma vez por prazo quando ele vence (ex.: recarregar o painel, o job pode não ter rodado). */
  onExpire?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const end = deadline ? Date.parse(deadline) : NaN;
  const valid = !Number.isNaN(end);
  const expired = valid && end - now <= 0;
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const firedFor = useRef<number | null>(null);

  useEffect(() => {
    if (!expired || firedFor.current === end) return;
    firedFor.current = end;
    onExpireRef.current?.();
  }, [expired, end]);

  useEffect(() => {
    if (!valid) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [end, valid]);

  if (!valid) return null;
  const left = end - now;
  if (left <= 0) return <span className={[styles.badge, styles.over].join(' ')}>Cancelado por falta de aceite</span>;
  return (
    <span role="timer" className={[styles.badge, left <= 60000 ? styles.urgent : ''].filter(Boolean).join(' ')}>
      cancela em {formatClock(left)}
    </span>
  );
}
