import { ReactNode } from 'react';
import styles from './AdminBlocks.module.css';

/** Número grande com rótulo e dica opcional (protótipo .u-kpis). Valor de dinheiro vem formatado da tela. */
export function Kpi({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className={styles.kpi}>
      <span className={styles.kpiLabel}>{label}</span>
      <strong className={styles.kpiValue}>{value}</strong>
      {hint && <em className={styles.kpiHint}>{hint}</em>}
    </div>
  );
}

export default Kpi;
