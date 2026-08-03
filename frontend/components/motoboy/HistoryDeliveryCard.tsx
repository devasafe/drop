import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { formatBRL } from '../ui/PriceTag';
import styles from './HistoryDeliveryCard.module.css';

export interface HistoryDeliveryCardProps {
  delivery: any;
  onDetails: () => void;
}

/** Card de uma entrega CONCLUÍDA (histórico) do motoboy, no design system. */
export function HistoryDeliveryCard({ delivery: d, onDetails }: HistoryDeliveryCardProps) {
  const delivered = d.status === 'delivered';
  const date = d.updatedAt ? new Date(d.updatedAt).toLocaleDateString('pt-BR') : '';
  const rating = typeof d.rating === 'number' ? d.rating : 0;
  return (
    <Card className={styles.card}>
      <div className={styles.top}>
        <span className={`${styles.pill} ${delivered ? styles.delivered : styles.cancelled}`}>
          {delivered ? 'Entregue' : 'Cancelada'}
        </span>
        <span className={styles.value}>{formatBRL((d.fee || 0) * 0.8)}</span>
      </div>
      <div className={styles.meta}>
        Pedido #{(d.orderId || d._id)?.slice(-6) || '—'}{date && ` · ${date}`}
      </div>
      {rating > 0 && (
        <div className={styles.stars} aria-label={`Avaliação ${rating} de 5`}>
          {[1, 2, 3, 4, 5].map((s) => (
            <span key={s} className={s <= rating ? styles.on : styles.off} aria-hidden="true">★</span>
          ))}
        </div>
      )}
      <Button variant="ghost" onClick={onDetails}>Ver detalhes</Button>
    </Card>
  );
}
