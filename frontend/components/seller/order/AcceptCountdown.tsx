import { useEffect, useState } from 'react';
import { formatClock } from '../../../lib/sellerApi';
import styles from './AcceptCountdown.module.css';

/**
 * Tempo que falta para aceitar o pedido. O prazo vem pronto do servidor (acceptDeadline),
 * calculado pelo mesmo relógio do job que CANCELA (com reembolso) o pedido vencido.
 * Nunca há valor fixo aqui, e o pedido não é aceito sozinho.
 */
export function AcceptCountdown({ deadline }: { deadline?: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  const end = deadline ? Date.parse(deadline) : NaN;
  const valid = !Number.isNaN(end);

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
