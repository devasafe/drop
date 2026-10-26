import { Button } from '../../ui/Button';
import { RouteThumbnail } from '../../map/RouteThumbnail';
import { formatMoney } from '../../../lib/money';
import type { RoutePoint } from '../../../lib/staticMap';
import blocks from '../../panel/PanelBlocks.module.css';
import { fmtKm, offerView } from './offerView';
import styles from './Corridas.module.css';

export interface OfferCardProps {
  delivery: any;
  self: RoutePoint | null;
  accepting?: boolean;
  disabled?: boolean;
  showMap?: boolean;
  onAccept: () => void;
  onSkip: () => void;
}

/** Oferta do pool (protótipo "Online com oferta"): sem contagem regressiva (não há prazo por motoboy). */
export function OfferCard({ delivery, self, accepting, disabled, showMap, onAccept, onSkip }: OfferCardProps) {
  const v = offerView(delivery, self);
  // Corrida de devolução: a retirada é na casa do cliente e o destino é a loja (store*/customer* da corrida).
  const isReturn = delivery?.kind === 'devolucao';
  return (
    <article className={styles.offerWrap} data-testid={`oferta-${delivery._id}`} aria-label={`Corrida do pedido ${v.code}`}>
      {showMap && (
        <div className={styles.mapTall}>
          <RouteThumbnail store={v.store} customer={v.customer} motoboy={self} polyline={delivery.routePolyline} height={300} />
        </div>
      )}
      <div className={`${blocks.blk} ${styles.offer}`}>
        <div className={blocks.head}>
          {isReturn
            ? <span className={`${blocks.tag} ${blocks.tagWarn}`}>Devolução</span>
            : <span className={`${blocks.tag} ${blocks.tagBrand}`}>Nova corrida</span>}
          <span className={blocks.meta}>Pedido #{v.code}</span>
        </div>
        <div className={styles.value}>
          <span className={blocks.big}>{formatMoney(v.earn)}</span>
          <span className={blocks.meta}>para você</span>
        </div>
        <ol className={styles.legs}>
          <li className={styles.legDone}>
            <span className={styles.legDot} aria-hidden="true" />
            <span className={blocks.tx}>
              <b>{isReturn ? 'Retirada com o cliente' : 'Retirada'}</b>
              <span>{[v.pickup.line1, v.pickup.km != null ? `${fmtKm(v.pickup.km)} de você` : null].filter(Boolean).join(' · ')}</span>
            </span>
            {v.pickup.min != null && <time className={blocks.time}>{v.pickup.min} min</time>}
          </li>
          <li>
            <span className={styles.legDot} aria-hidden="true" />
            <span className={blocks.tx}>
              <b>{isReturn ? 'Levar à loja' : v.drop.area ? `Entrega em ${v.drop.area}` : 'Entrega'}</b>
              <span>{[v.drop.line1, v.drop.km != null ? `${fmtKm(v.drop.km)} ${isReturn ? 'do cliente' : 'da loja'}` : null].filter(Boolean).join(' · ')}</span>
            </span>
            {v.drop.min != null && <time className={blocks.time}>{v.drop.min} min</time>}
          </li>
        </ol>
        <div className={styles.offerButtons}>
          <Button variant="secondary" onClick={onSkip} disabled={accepting}>Pular</Button>
          <Button onClick={onAccept} disabled={accepting || disabled} loading={accepting}>{`Aceitar por ${formatMoney(v.earn)}`}</Button>
        </div>
        {v.totalKm != null && v.totalMin != null && (
          <span className={`${blocks.meta} ${styles.centerText}`}>Total {fmtKm(v.totalKm)} · cerca de {v.totalMin} min</span>
        )}
      </div>
    </article>
  );
}

export default OfferCard;
