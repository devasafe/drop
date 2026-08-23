import { Bike } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { formatBRL } from '../ui/PriceTag';
import { RouteThumbnail } from '../map/RouteThumbnail';
import { parseCoords } from '../../lib/geo';
import { RoutePoint } from '../../lib/staticMap';
import styles from './DeliveryOfferCard.module.css';

export interface DeliveryOfferCardProps {
  delivery: any;
  onAccept: () => void;
  onReject: () => void;
  accepting?: boolean;
  /** Posição atual do motoboy (pino no mapa da rota). */
  self?: RoutePoint | null;
}

export function DeliveryOfferCard({ delivery: d, onAccept, onReject, accepting, self }: DeliveryOfferCardProps) {
  const fee = d.fee || 0;
  const store = parseCoords(d.storeLatitude, d.storeLongitude);
  const customer = parseCoords(d.customerLatitude, d.customerLongitude);
  const dist = typeof d.distance === 'number' && d.distance > 0 ? `${d.distance.toFixed(1)} km` : null;

  return (
    <Card className={styles.card}>
      <div className={styles.header}>
        <div>
          <div className={styles.order}>Pedido #{(d.orderId || d._id)?.slice(-6) || '—'}</div>
          <div className={styles.earn}>{formatBRL(fee * 0.8)}</div>
          <div className={styles.feeNote}>Taxa {formatBRL(fee)} · você recebe 80%</div>
        </div>
        {dist && (
          <span className={styles.distPill}>
            <Bike size={15} aria-hidden="true" /> {dist}
          </span>
        )}
      </div>

      <RouteThumbnail store={store} customer={customer} motoboy={self} polyline={d.routePolyline} height={150} />

      <div className={styles.route}>
        <div className={styles.point}>
          <span className={styles.rail}>
            <span className={`${styles.dot} ${styles.dotStore}`} />
            <span className={styles.leg} />
          </span>
          <div className={styles.pointText}>
            <span className={styles.pointLabel}>Retirada</span>
            <div className={styles.pointAddr}>{d.storeAddress || d.pickupLocation || 'Loja'}</div>
          </div>
        </div>
        <div className={styles.point}>
          <span className={styles.rail}>
            <span className={`${styles.dot} ${styles.dotCustomer}`} />
          </span>
          <div className={styles.pointText}>
            <span className={styles.pointLabel}>Entrega</span>
            <div className={styles.pointAddr}>{d.customerAddress || d.destination || 'Cliente'}</div>
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <Button onClick={onAccept} disabled={accepting} loading={accepting}>Aceitar</Button>
        <Button variant="ghost" onClick={onReject} disabled={accepting}>Recusar</Button>
      </div>
    </Card>
  );
}
