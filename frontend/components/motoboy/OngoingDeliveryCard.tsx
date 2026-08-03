import { ChevronRight, Bike } from 'lucide-react';
import { Card } from '../ui/Card';
import { formatBRL } from '../ui/PriceTag';
import { ongoingStatusView } from '../../lib/deliveryStatus';
import styles from './OngoingDeliveryCard.module.css';

export interface OngoingDeliveryCardProps {
  delivery: any;
  onDetails: () => void;
}

/** Card de uma entrega EM ANDAMENTO do motoboy — inteiro clicável. */
export function OngoingDeliveryCard({ delivery: d, onDetails }: OngoingDeliveryCardProps) {
  const st = ongoingStatusView(d.status);
  const route = [d.pickupLocation || 'A confirmar', d.destination].filter(Boolean).join(' → ');

  return (
    <Card interactive onClick={onDetails} className={styles.card}>
      <div className={styles.body}>
        <span className={styles.media} aria-hidden="true"><Bike size={20} /></span>
        <div className={styles.info}>
          <div className={styles.top}>
            <span className={`${styles.pill} ${styles[st.tone]}`}>{st.label}</span>
            <span className={styles.value}>{formatBRL((d.fee || 0) * 0.8)}</span>
          </div>
          <div className={styles.sub}>
            Pedido #{(d.orderId || d._id)?.slice(-6) || '—'} · {(d.distance || 0).toFixed(1)} km
          </div>
          <div className={styles.route}>{route}</div>
        </div>
        <ChevronRight size={18} className={styles.chevron} aria-hidden="true" />
      </div>
    </Card>
  );
}
