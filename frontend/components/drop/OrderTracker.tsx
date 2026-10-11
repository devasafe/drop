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
  /** "2 itens" — resumo do pedido, embaixo do nome da loja. */
  itemsLabel?: string;
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
  itemsLabel,
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
      <div className={styles.head}>
        <span className={styles.badge} aria-live="polite">
          <span className={styles.dot} aria-hidden="true" />
          {resolvedLabel}
        </span>
        <span className={styles.code}>Pedido #{orderId}</span>
      </div>
      <p className={styles.store}>{storeName}</p>
      {itemsLabel && <p className={styles.items}>{itemsLabel}</p>}
      {etaMin !== undefined && <p className={styles.items}>{`~${etaMin} min${etaLabel ? ` · ${etaLabel}` : ''}`}</p>}
      <ProgressBar value={clampedProgress * 100} label={`Progresso do pedido #${orderId}`} valueText={resolvedLabel} />
    </section>
  );
}
