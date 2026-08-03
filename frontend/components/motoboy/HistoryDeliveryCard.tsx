import { ChevronRight, Bike } from 'lucide-react';
import { Card } from '../ui/Card';
import { StatusPill } from '../ui/StatusPill';
import { formatBRL } from '../ui/PriceTag';
import styles from './HistoryDeliveryCard.module.css';

export interface HistoryDeliveryCardProps {
  delivery: any;
  onDetails: () => void;
}

/** Card de uma entrega CONCLUÍDA (histórico) do motoboy — inteiro clicável. */
export function HistoryDeliveryCard({ delivery: d, onDetails }: HistoryDeliveryCardProps) {
  const delivered = d.status === 'delivered';
  const date = d.updatedAt ? new Date(d.updatedAt).toLocaleDateString('pt-BR') : '';
  const rating = typeof d.rating === 'number' ? d.rating : 0;

  return (
    <Card interactive onClick={onDetails} className={styles.card}>
      <div className={styles.body}>
        <span className={styles.media} aria-hidden="true"><Bike size={20} /></span>
        <div className={styles.info}>
          <div className={styles.top}>
            <span className={styles.title}>Pedido #{(d.orderId || d._id)?.slice(-6) || '—'}</span>
            <StatusPill status={delivered ? 'entregue' : 'cancelado'} />
          </div>
          <div className={styles.sub}>{date || 'Entrega concluída'}</div>
          <div className={styles.foot}>
            <span className={styles.value}>{formatBRL((d.fee || 0) * 0.8)}</span>
            {rating > 0 && (
              <span className={styles.stars} aria-label={`Avaliação ${rating} de 5`}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <span key={s} className={s <= rating ? styles.on : styles.off} aria-hidden="true">★</span>
                ))}
              </span>
            )}
          </div>
        </div>
        <ChevronRight size={18} className={styles.chevron} aria-hidden="true" />
      </div>
    </Card>
  );
}
