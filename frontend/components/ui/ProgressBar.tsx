import styles from './ProgressBar.module.css';

export interface ProgressBarProps {
  value: number;
  max?: number;
  /** Nome acessível ("Progresso do pedido"). */
  label: string;
  /** Texto do valor para leitor de tela ("Saiu para entrega"). */
  valueText?: string;
}

/**
 * Barra de progresso (DS v2), usada no tracker do pedido. A cor de ação
 * aqui é legítima: progresso é um dos usos do roxo (Regra D).
 */
export function ProgressBar({ value, max = 100, label, valueText }: ProgressBarProps) {
  const now = Math.min(Math.max(value, 0), max);
  const pct = max > 0 ? (now / max) * 100 : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={now}
      aria-valuetext={valueText}
      className={styles.track}
    >
      <div className={styles.fill} style={{ width: `${pct}%` }} />
    </div>
  );
}
