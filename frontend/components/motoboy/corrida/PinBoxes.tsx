import { useState } from 'react';
import styles from './PinBoxes.module.css';

export interface PinBoxesProps {
  length?: number;
  value: string;
  onChange: (v: string) => void;
  error?: boolean;
  disabled?: boolean;
  /** Nome acessível do campo (padrão "Código do cliente"). */
  label?: string;
  /** id da mensagem de erro/ajuda ligada ao campo. */
  describedBy?: string;
}

/**
 * PIN do cliente em caixas 44×54 (protótipo `.u-pinbox`). Um input real e invisível fica por cima
 * das caixas: teclado numérico, colar e autocomplete de SMS funcionam. Só dígitos. Não envia nada.
 */
export function PinBoxes({ length = 5, value, onChange, error, disabled, label = 'Código do cliente', describedBy }: PinBoxesProps) {
  const [focused, setFocused] = useState(false);
  const chars = value.slice(0, length).split('');
  const cursor = Math.min(chars.length, length - 1);
  return (
    <div className={styles.wrap}>
      <input
        className={styles.input}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        aria-label={label}
        aria-invalid={error || undefined}
        aria-describedby={describedBy}
        maxLength={length}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      <div className={styles.boxes} aria-hidden="true">
        {Array.from({ length }, (_, i) => (
          <span
            key={i}
            data-pin-box
            data-error={error ? 'true' : undefined}
            className={[
              styles.box,
              error && styles.boxError,
              !error && focused && i === cursor && styles.boxFocus,
              disabled && styles.boxDisabled,
            ].filter(Boolean).join(' ')}
          >
            {chars[i] ?? ''}
          </span>
        ))}
      </div>
    </div>
  );
}

export default PinBoxes;
