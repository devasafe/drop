import { Route } from 'lucide-react';
import { ICON_STROKE_WIDTH } from '../ui/Icon';
import { ProgressBar } from '../ui/ProgressBar';
import styles from './OrderTracker.module.css';

export interface OrderTrackerStep {
  label: string;
  done: boolean;
}

export interface OrderTrackerProps {
  orderId: string;
  storeName: string;
  imageUrl?: string;
  /** Sem cálculo de ETA real no backend hoje — opcional. Quando ausente, o
   * bloco de tempo inteiro (minutos + horário) some, em vez de mostrar um
   * número inventado. */
  etaMin?: number;
  etaLabel?: string;
  /** Rótulo da fase atual (ex.: "Preparando", "Buscando entregador", "A
   * caminho"). O status de um pedido tem várias fases antes de sair pra
   * entrega — nunca hardcode "A caminho" aqui, isso mentiria pro usuário
   * num pedido ainda em preparo. Se omitido, cai pro rótulo do último step
   * concluído (ou "Em andamento" se nenhum estiver concluído ainda). */
  statusLabel?: string;
  progress: number;
  steps: OrderTrackerStep[];
  onClick?: () => void;
}

/** Fallback de rótulo quando `statusLabel` não é passado: nome do último
 * step concluído (assume `steps` em ordem cronológica), ou "Em andamento". */
function deriveStatusLabel(steps: OrderTrackerStep[]): string {
  const done = steps.filter((s) => s.done);
  return done.length > 0 ? done[done.length - 1].label : 'Em andamento';
}

/** Elemento dominante da Home (spec Regra E): pedido em andamento, flat, com ProgressBar do DS. */
export function OrderTracker({
  orderId,
  storeName,
  imageUrl,
  etaMin,
  etaLabel,
  statusLabel,
  progress,
  steps,
  onClick,
}: OrderTrackerProps) {
  const clampedProgress = Math.min(1, Math.max(0, progress));
  const resolvedLabel = statusLabel ?? deriveStatusLabel(steps);
  const interactive = !!onClick;

  return (
    <section
      className={interactive ? `${styles.track} ${styles.clickable}` : styles.track}
      aria-label={`Pedido #${orderId} — ${resolvedLabel}`}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick!(); } }
          : undefined
      }
    >
      <div className={styles.row}>
        <span
          className={styles.thumb}
          style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
          aria-hidden="true"
        />
        <div className={styles.meta}>
          <div className={styles.status} aria-live="polite">
            <Route size={14} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
            {resolvedLabel}
          </div>
          <div className={styles.title}>
            Pedido #{orderId} · {storeName}
          </div>
        </div>
        {etaMin !== undefined && (
          <div className={styles.eta}>
            <div className={styles.etaBig}>{etaMin} min</div>
            {etaLabel && <div className={styles.etaLabel}>{etaLabel}</div>}
          </div>
        )}
      </div>

      <ProgressBar value={clampedProgress * 100} label={`Progresso do pedido #${orderId}`} valueText={resolvedLabel} />

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
