import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { formatBRL } from '../ui/PriceTag';
import { ongoingStatusView } from '../../lib/deliveryStatus';
import styles from './OngoingDeliveryCard.module.css';

export interface OngoingDeliveryCardProps {
  delivery: any;
  onDetails: () => void;
}

/** Card de uma entrega EM ANDAMENTO do motoboy, no design system. */
export function OngoingDeliveryCard({ delivery: d, onDetails }: OngoingDeliveryCardProps) {
  const st = ongoingStatusView(d.status);
  return (
    <Card className={styles.card}>
      <div className={styles.top}>
        <span className={`${styles.pill} ${styles[st.tone]}`}>{st.label}</span>
        <span className={styles.value}>{formatBRL((d.fee || 0) * 0.8)}</span>
      </div>
      <div className={styles.order}>
        Pedido #{(d.orderId || d._id)?.slice(-6) || '—'} · {(d.distance || 0).toFixed(1)} km
      </div>
      <div className={styles.locs}>
        <div className={styles.loc}>
          <span className={styles.locLabel}>Retirada</span>
          <span className={styles.locValue}>{d.pickupLocation || 'A confirmar'}</span>
        </div>
        {d.destination && (
          <div className={styles.loc}>
            <span className={styles.locLabel}>Entrega</span>
            <span className={styles.locValue}>{d.destination}</span>
          </div>
        )}
      </div>
      <Button onClick={onDetails}>Ver detalhes</Button>
    </Card>
  );
}
