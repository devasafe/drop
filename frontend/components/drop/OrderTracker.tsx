import { Route } from 'lucide-react';
import { ICON_STROKE_WIDTH } from '../ui/Icon';
import styles from './OrderTracker.module.css';

export interface OrderTrackerStep {
  label: string;
  done: boolean;
}

export interface OrderTrackerProps {
  orderId: string;
  storeName: string;
  imageUrl?: string;
  etaMin: number;
  etaLabel?: string;
  progress: number;
  steps: OrderTrackerStep[];
}

/**
 * Elemento dominante da home (spec Regra E): pedido a caminho. Replica
 * `.track` do mock canônico — painel `--panel-grad` que quebra a grade,
 * barra lateral roxa via `::before`, barra de progresso em `--brand-grad`
 * (largura = `progress*100%`) e steps com `done` em destaque.
 */
export function OrderTracker({
  orderId,
  storeName,
  imageUrl,
  etaMin,
  etaLabel,
  progress,
  steps,
}: OrderTrackerProps) {
  const clampedProgress = Math.min(1, Math.max(0, progress));

  return (
    <section className={styles.track} aria-label={`Pedido #${orderId} a caminho`}>
      <div className={styles.row}>
        <span
          className={styles.thumb}
          style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
          aria-hidden="true"
        />
        <div className={styles.meta}>
          <div className={styles.status}>
            <Route size={14} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
            A caminho
          </div>
          <div className={styles.title}>
            Pedido #{orderId} · {storeName}
          </div>
        </div>
        <div className={styles.eta}>
          <div className={styles.etaBig}>{etaMin} min</div>
          {etaLabel && <div className={styles.etaLabel}>{etaLabel}</div>}
        </div>
      </div>

      <div className={styles.bar}>
        <span className={styles.barFill} style={{ width: `${clampedProgress * 100}%` }} />
      </div>

      <div className={styles.steps}>
        {steps.map((step) => (
          <span
            key={step.label}
            className={step.done ? styles.stepDone : undefined}
          >
            {step.label}
          </span>
        ))}
      </div>
    </section>
  );
}
