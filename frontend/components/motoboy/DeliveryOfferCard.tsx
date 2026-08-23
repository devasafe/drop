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
  /** Posição atual do motoboy (pino no thumbnail da rota). */
  self?: RoutePoint | null;
}

export function DeliveryOfferCard({ delivery: d, onAccept, onReject, accepting, self }: DeliveryOfferCardProps) {
  const fee = d.fee || 0;
  const store = parseCoords(d.storeLatitude, d.storeLongitude);
  const customer = parseCoords(d.customerLatitude, d.customerLongitude);
  return (
    <Card className={styles.card}>
      <div className={styles.header}>
        <span className={styles.order}>Pedido #{(d.orderId || d._id)?.slice(-6) || '—'}</span>
        <span className={styles.value}>{formatBRL(fee * 0.8)}</span>
      </div>
      <div className={styles.feeNote}>Taxa {formatBRL(fee)} · você recebe 80%</div>
      <RouteThumbnail store={store} customer={customer} motoboy={self} polyline={d.routePolyline} />
      <div className={styles.rows}>
        <div className={styles.row}>Distância <strong>{(d.distance || 0).toFixed(1)} km</strong></div>
        <div className={styles.row}>Origem <strong>{d.pickupLocation || 'A confirmar'}</strong></div>
        {d.destination && <div className={styles.row}>Destino <strong>{d.destination}</strong></div>}
      </div>
      <div className={styles.actions}>
        <Button onClick={onAccept} disabled={accepting}>Aceitar</Button>
        <Button variant="ghost" onClick={onReject} disabled={accepting}>Recusar</Button>
      </div>
    </Card>
  );
}
