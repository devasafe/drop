import { HTMLAttributes, ReactNode } from 'react';
import styles from './KpiBand.module.css';

export interface KpiBandProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
}

/**
 * Banda flat de indicadores, separados por divisória vertical (--line). É o
 * padrão flat para KPIs — no lugar de uma fileira de mini-cards. Preencha com
 * `Kpi`.
 */
export function KpiBand({ children, className, ...rest }: KpiBandProps) {
  return (
    <div className={[styles.band, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}

export type KpiTone = 'default' | 'success' | 'danger' | 'warn' | 'info';

export interface KpiProps {
  label: ReactNode;
  value: ReactNode;
  /** Cor semântica do valor. Default = --text-strong. */
  tone?: KpiTone;
  className?: string;
}

/** Um indicador da `KpiBand`: valor em destaque + rótulo. */
export function Kpi({ label, value, tone = 'default', className }: KpiProps) {
  return (
    <div className={[styles.kpi, className].filter(Boolean).join(' ')}>
      <div className={[styles.value, tone !== 'default' && styles[tone]].filter(Boolean).join(' ')}>
        {value}
      </div>
      <div className={styles.label}>{label}</div>
    </div>
  );
}
