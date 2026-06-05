import React from 'react';
import styles from './PeriodFilter.module.css';
import type { Period } from '../../lib/analyticsApi';

interface Props {
  value: Period;
  onChange: (p: Period) => void;
  options?: Period[];
}

const LABELS: Record<Period, string> = {
  '7d': '7 dias',
  '30d': '30 dias',
  '90d': '90 dias',
};

export default function PeriodFilter({ value, onChange, options = ['7d', '30d', '90d'] }: Props) {
  return (
    <div className={styles.group} role="group" aria-label="Período">
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          className={`${styles.btn} ${value === opt ? styles.active : ''}`}
          onClick={() => onChange(opt)}
        >
          {LABELS[opt]}
        </button>
      ))}
    </div>
  );
}
