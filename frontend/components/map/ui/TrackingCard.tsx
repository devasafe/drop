import styles from './TrackingCard.module.css';

export interface TrackingStep {
  label: string;
  done: boolean;
}

interface Props {
  etaText: string;
  statusBadge: string;
  steps: TrackingStep[];
  storeName?: string;
  orderCode?: string;
  distanceText?: string;
}

/**
 * Card de acompanhamento (camada UI): ETA + progresso do pedido + loja.
 * Translúcido premium, sobreposto ao mapa.
 */
export function TrackingCard({ etaText, statusBadge, steps, storeName, orderCode, distanceText }: Props) {
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <div>
          <div className={styles.etaLabel}>Seu pedido chega em</div>
          <div className={styles.eta}>{etaText}</div>
        </div>
        {statusBadge && <span className={styles.badge}>{statusBadge}</span>}
      </div>

      <div className={styles.steps}>
        {steps.map((s, i) => (
          <div key={i} className={`${styles.step}${s.done ? ' ' + styles.done : ''}`}>
            <span className={styles.dot} />
            <span className={styles.stepLabel}>{s.label}</span>
          </div>
        ))}
      </div>

      {(storeName || orderCode) && (
        <div className={styles.footer}>
          <div className={styles.storeInfo}>
            {storeName && <span className={styles.storeName}>{storeName}</span>}
            <span className={styles.orderMeta}>
              {orderCode ? `Pedido ${orderCode}` : ''}
              {distanceText ? ` · ${distanceText}` : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default TrackingCard;
