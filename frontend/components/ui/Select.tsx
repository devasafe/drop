import { useId } from 'react';
import { AlertCircle, ChevronDown } from 'lucide-react';
import { ICON_STROKE_WIDTH } from './Icon';
import styles from './Select.module.css';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  label?: string;
  hint?: string;
  error?: string;
  id?: string;
}

/**
 * Seletor do DROP. Mesma borda funcional do `Input` (spec §3.1-B) e raio
 * `--r-md`. Seta (`ChevronDown`) em `--text-muted` substitui o indicador
 * nativo do navegador.
 */
export function Select({
  value,
  onChange,
  options,
  disabled = false,
  label,
  hint,
  error,
  id,
}: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const errorId = `${selectId}-error`;
  const hintId = `${selectId}-hint`;
  const describedBy =
    [error ? errorId : null, hint && !error ? hintId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      {label && (
        <label htmlFor={selectId} className={styles.label}>
          {label}
        </label>
      )}
      <div
        className={[styles.field, error && styles.error, disabled && styles.disabled]
          .filter(Boolean)
          .join(' ')}
      >
        <select
          id={selectId}
          className={styles.select}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className={styles.chevron}>
          <ChevronDown size={16} strokeWidth={ICON_STROKE_WIDTH} />
        </span>
      </div>
      {error && (
        <p id={errorId} role="alert" className={styles.errorText}>
          <AlertCircle size={14} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}
