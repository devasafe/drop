import React from 'react';
import styles from './StatCard.module.css';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  /** Percentual vs período anterior (ex: 12.5 → +12,5%) */
  delta?: number;
  /** Quando true, delta negativo é "bom" (ex: taxa de cancelamento) */
  invertDelta?: boolean;
  hint?: string;
  variant?: 'purple' | 'green' | 'blue' | 'orange' | 'pink';
}

export default function StatCard({
  label,
  value,
  icon,
  delta,
  invertDelta,
  hint,
  variant = 'purple',
}: StatCardProps) {
  const hasDelta = typeof delta === 'number' && !Number.isNaN(delta);
  let deltaPositive = hasDelta && delta! >= 0;
  if (invertDelta) deltaPositive = !deltaPositive;
  const deltaClass = hasDelta ? (deltaPositive ? styles.deltaUp : styles.deltaDown) : '';
  const deltaSign = hasDelta ? (delta! >= 0 ? '+' : '') : '';

  return (
    <div className={`${styles.card} ${styles[variant]}`}>
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        {icon && <span className={styles.icon}>{icon}</span>}
      </div>
      <div className={styles.value}>{value}</div>
      <div className={styles.footer}>
        {hasDelta && (
          <span className={`${styles.delta} ${deltaClass}`}>
            {deltaSign}
            {delta!.toFixed(1)}%
          </span>
        )}
        {hint && <span className={styles.hint}>{hint}</span>}
      </div>
    </div>
  );
}
