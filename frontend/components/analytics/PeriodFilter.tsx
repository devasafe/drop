import React from 'react';
import styles from './PeriodFilter.module.css';
import type { Period, DateRange } from '../../lib/analyticsApi';

interface Props {
  value: Period;
  onChange: (p: Period) => void;
  options?: Period[];
  range?: DateRange;
  onRangeChange?: (r: DateRange) => void;
}

const LABELS: Record<Period, string> = {
  '7d': '7 dias',
  '30d': '30 dias',
  '90d': '90 dias',
  custom: 'Personalizado',
};

export default function PeriodFilter({
  value,
  onChange,
  options = ['7d', '30d', '90d'],
  range,
  onRangeChange,
}: Props) {
  return (
    <div className={styles.wrap}>
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

      {value === 'custom' && onRangeChange && (
        <div className={styles.customRange}>
          <input
            type="date"
            className={styles.dateInput}
            value={range?.from || ''}
            max={range?.to || undefined}
            onChange={e => onRangeChange({ from: e.target.value, to: range?.to || '' })}
            aria-label="Data inicial"
          />
          <span className={styles.dateSep}>até</span>
          <input
            type="date"
            className={styles.dateInput}
            value={range?.to || ''}
            min={range?.from || undefined}
            onChange={e => onRangeChange({ from: range?.from || '', to: e.target.value })}
            aria-label="Data final"
          />
        </div>
      )}
    </div>
  );
}
