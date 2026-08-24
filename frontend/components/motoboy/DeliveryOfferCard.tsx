import { Route, MapPin, Clock, Store, Home } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { formatBRL } from '../ui/PriceTag';
import { RouteThumbnail } from '../map/RouteThumbnail';
import { parseCoords, haversineKm } from '../../lib/geo';
import { splitAddressLines } from '../../lib/address';
import { RoutePoint } from '../../lib/staticMap';
import styles from './DeliveryOfferCard.module.css';

export interface DeliveryOfferCardProps {
  delivery: any;
  onAccept: () => void;
  onReject: () => void;
  accepting?: boolean;
  /** Posição atual do motoboy (pino no mapa + distância até a retirada). */
  self?: RoutePoint | null;
}

const MOTO_AVG_KMH = 20; // velocidade média urbana p/ estimar o tempo (sem campo de duração no backend)
const fmtKm = (km: number) => `${km.toFixed(1).replace('.', ',')} km`;

export function DeliveryOfferCard({ delivery: d, onAccept, onReject, accepting, self }: DeliveryOfferCardProps) {
  const fee = d.fee || 0;
  const earn = fee * 0.8; // regra financeira mantida (motoboy recebe 80% da taxa)
  const store = parseCoords(d.storeLatitude, d.storeLongitude);
  const customer = parseCoords(d.customerLatitude, d.customerLongitude);

  // Distâncias: total (loja→cliente, do backend) e até a retirada (motoboy→loja).
  const totalKm = typeof d.distance === 'number' && d.distance > 0
    ? d.distance
    : (store && customer ? haversineKm(store, customer) : null);
  const toPickupKm = self && store ? haversineKm(self, store) : null;

  // ETA estimado: percurso total (ir até a loja + entregar) na média urbana.
  const travelKm = (toPickupKm || 0) + (totalKm || 0);
  const etaMin = travelKm > 0 ? Math.max(1, Math.round((travelKm / MOTO_AVG_KMH) * 60)) : null;

  const code = (d.orderId || d._id)?.slice(-6)?.toUpperCase() || '—';
  const pickup = splitAddressLines(d.storeAddress || d.pickupLocation);
  const drop = splitAddressLines(d.customerAddress || d.destination);

  return (
    <Card className={styles.card}>
      {/* Cabeçalho: pedido + remuneração */}
      <div className={styles.head}>
        <span className={styles.orderPill}>PEDIDO #{code}</span>
        <span className={styles.earnLabel}>Você recebe</span>
        <div className={styles.earn}>{formatBRL(earn)}</div>
      </div>

      {/* Resumo rápido: total · até retirada · ETA */}
      <div className={styles.pills}>
        <div className={styles.pill}>
          <Route size={16} aria-hidden="true" />
          <div className={styles.pillText}>
            <b>{totalKm != null ? fmtKm(totalKm) : '—'}</b>
            <span>total</span>
          </div>
        </div>
        <div className={styles.pill}>
          <MapPin size={16} aria-hidden="true" />
          <div className={styles.pillText}>
            <b>{toPickupKm != null ? fmtKm(toPickupKm) : '—'}</b>
            <span>até retirada</span>
          </div>
        </div>
        <div className={styles.pill}>
          <Clock size={16} aria-hidden="true" />
          <div className={styles.pillText}>
            <b>{etaMin != null ? `~${etaMin} min` : '—'}</b>
            <span>estimado</span>
          </div>
        </div>
      </div>

      {/* Mapa (mais baixo, pino do cliente em verde) */}
      <RouteThumbnail store={store} customer={customer} motoboy={self} polyline={d.routePolyline} height={112} />

      {/* Timeline retirada → entrega */}
      <div className={styles.timeline}>
        <div className={styles.leg}>
          <div className={styles.rail}>
            <span className={`${styles.railDot} ${styles.dotStore}`} />
            <span className={styles.railLine} />
          </div>
          <div className={`${styles.legIcon} ${styles.iconStore}`}><Store size={17} aria-hidden="true" /></div>
          <div className={styles.legText}>
            <span className={`${styles.legLabel} ${styles.labelStore}`}>Retirada</span>
            <div className={styles.addr1}>{pickup.line1 || 'Loja'}</div>
            {pickup.line2 && <div className={styles.addr2}>{pickup.line2}</div>}
          </div>
        </div>
        <div className={styles.leg}>
          <div className={styles.rail}>
            <span className={`${styles.railDot} ${styles.dotDrop}`} />
          </div>
          <div className={`${styles.legIcon} ${styles.iconDrop}`}><Home size={17} aria-hidden="true" /></div>
          <div className={styles.legText}>
            <span className={`${styles.legLabel} ${styles.labelDrop}`}>Entrega</span>
            <div className={styles.addr1}>{drop.line1 || 'Cliente'}</div>
            {drop.line2 && <div className={styles.addr2}>{drop.line2}</div>}
          </div>
        </div>
      </div>

      {/* Ações */}
      <div className={styles.actions}>
        <Button className={styles.accept} onClick={onAccept} disabled={accepting} loading={accepting}>
          Aceitar por {formatBRL(earn)}
        </Button>
        <button type="button" className={styles.reject} onClick={onReject} disabled={accepting}>
          Recusar
        </button>
      </div>
    </Card>
  );
}
