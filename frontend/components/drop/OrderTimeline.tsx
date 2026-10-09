import { Check, X } from 'lucide-react';
import styles from './OrderTimeline.module.css';

export type TimelineStepState = 'done' | 'current' | 'upcoming' | 'error';

export interface TimelineStep {
  label: string;
  /** Hora real do passo ("14:05"). Passo futuro não tem hora. */
  time?: string;
  /** Linha de apoio ("Motoboy Carlos · placa ABC1D23"). */
  detail?: string;
  state: TimelineStepState;
}

/**
 * Passos do pedido na vertical, com a hora real em cada um (DS v2).
 * Substitui os passos de 9,5px do OrderTracker. O passo atual leva
 * `aria-current="step"`; erro (cancelado, problema) leva ícone, não só cor.
 */
export function OrderTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className={styles.timeline}>
      {steps.map((step, i) => (
        <li
          key={`${step.label}-${i}`}
          className={[styles.step, styles[step.state]].join(' ')}
          aria-current={step.state === 'current' ? 'step' : undefined}
        >
          <span className={styles.marker} aria-hidden="true">
            {step.state === 'done' && <Check size={12} strokeWidth={3} />}
            {step.state === 'error' && <X size={12} strokeWidth={3} />}
          </span>
          <div className={styles.body}>
            <span className={styles.label}>{step.label}</span>
            {step.detail && <span className={styles.detail}>{step.detail}</span>}
          </div>
          {step.time && <time className={styles.time}>{step.time}</time>}
        </li>
      ))}
    </ol>
  );
}
