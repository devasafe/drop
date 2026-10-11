import { InputHTMLAttributes, ReactNode, useId } from 'react';
import { AlertCircle } from 'lucide-react';
import { ICON_STROKE_WIDTH } from './Icon';
import styles from './Input.module.css';

export interface InputProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'value' | 'onChange' | 'placeholder' | 'type' | 'disabled'
  > {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  leftIcon?: ReactNode;
  type?: string;
  error?: string;
  label?: string;
  hint?: string;
  disabled?: boolean;
}

/**
 * Campo de texto do DROP. Único primitivo com borda funcional (ver
 * `Input.module.css`) — replica `.srch .box` do mock canônico. `leftIcon`
 * fica em `--text-muted`; `error` tinge a borda e mostra a mensagem abaixo.
 */
export function Input({
  value,
  onChange,
  placeholder,
  leftIcon,
  type = 'text',
  error,
  label,
  hint,
  disabled = false,
  className,
  id,
  ...rest
}: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const describedBy = [error ? errorId : null, hint && !error ? hintId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
      )}
      <div
        className={[styles.field, error && styles.error, disabled && styles.disabled]
          .filter(Boolean)
          .join(' ')}
      >
        {leftIcon && <span className={styles.icon}>{leftIcon}</span>}
        <input
          id={inputId}
          type={type}
          className={styles.input}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
        />
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
