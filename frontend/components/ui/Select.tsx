import { ChevronDown } from 'lucide-react';
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
}

/**
 * Seletor do DROP. Mesma borda funcional do `Input` (spec §3.1-B) e raio
 * `--r-md`. Seta (`ChevronDown`) em `--text-muted` substitui o indicador
 * nativo do navegador.
 */
export function Select({ value, onChange, options, disabled = false }: SelectProps) {
  return (
    <div className={[styles.field, disabled && styles.disabled].filter(Boolean).join(' ')}>
      <select
        className={styles.select}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
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
  );
}
